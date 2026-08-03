import { resolveAdapter } from './adapters'
import { getProvider, parseProviderConfig } from './provider-store'
import type {
  GatewayProviderConfig,
  ProtocolEndpointConfig,
  UnifiedTurn,
  WireAdapter
} from './types'

const TEST_TIMEOUT_MS = 12_000

export interface ProviderTestProtocolResult {
  protocol: WireAdapter
  ok: boolean
  status?: number
  latencyMs: number
  url?: string
  error?: string
  message?: string
}

export interface ProviderTestResult {
  ok: boolean
  results: ProviderTestProtocolResult[]
}

export interface ProviderTestDraft {
  models?: string[]
  defaultModel?: string
  protocols: Partial<
    Record<
      WireAdapter,
      {
        baseUrl: string
        apiKey?: string
        headers?: Record<string, string>
        bodyDefaults?: Record<string, unknown>
      }
    >
  >
}

export interface ProviderTestInput {
  /** Test a saved provider by id. */
  providerId?: string
  /** Optional unsaved form values (apiKey may fall back to saved). */
  draft?: ProviderTestDraft
  /** When set, only probe this protocol. */
  protocol?: WireAdapter
}

function pickModel(config: {
  defaultModel?: string
  models?: string[]
  protocol: WireAdapter
}): string {
  if (config.defaultModel?.trim()) return config.defaultModel.trim()
  const first = config.models?.find((m) => m.trim())
  if (first) return first.trim()
  return config.protocol === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini'
}

function buildTurn(model: string): UnifiedTurn {
  return {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 1,
    stream: false
  }
}

async function probeEndpoint(
  protocol: WireAdapter,
  endpoint: ProtocolEndpointConfig,
  model: string
): Promise<ProviderTestProtocolResult> {
  if (!endpoint.baseUrl.trim()) {
    return {
      protocol,
      ok: false,
      latencyMs: 0,
      error: 'Base URL 为空'
    }
  }
  if (!endpoint.apiKey.trim()) {
    return {
      protocol,
      ok: false,
      latencyMs: 0,
      error: 'API Key 为空'
    }
  }

  const adapter = resolveAdapter(protocol)
  const req = adapter.buildRequest(buildTurn(model), endpoint, model)
  const started = Date.now()
  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS)
    })
    const latencyMs = Date.now() - started
    const text = await res.text().catch(() => '')
    if (res.ok) {
      return {
        protocol,
        ok: true,
        status: res.status,
        latencyMs,
        url: req.url,
        message: `HTTP ${res.status}`
      }
    }
    return {
      protocol,
      ok: false,
      status: res.status,
      latencyMs,
      url: req.url,
      error: `HTTP ${res.status}: ${text.slice(0, 240) || res.statusText}`
    }
  } catch (e) {
    return {
      protocol,
      ok: false,
      latencyMs: Date.now() - started,
      url: req.url,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/** Resolve saved provider + optional unsaved draft (empty draft apiKey falls back to saved). */
export function resolveProviderConfigForDraft(input: ProviderTestInput): GatewayProviderConfig {
  const saved = input.providerId ? getProvider(input.providerId) : undefined
  if (!saved && !input.draft) {
    throw new Error(
      input.providerId ? `Provider 不存在: ${input.providerId}` : '缺少 providerId 或 draft'
    )
  }

  if (!input.draft) {
    return saved!.config
  }

  const draftRaw = {
    models: input.draft.models,
    defaultModel: input.draft.defaultModel,
    protocols: Object.fromEntries(
      Object.entries(input.draft.protocols).map(([key, value]) => {
        const savedEndpoint = saved?.config.protocols[key as WireAdapter]
        const apiKey =
          typeof value?.apiKey === 'string' && value.apiKey.trim()
            ? value.apiKey.trim()
            : (savedEndpoint?.apiKey ?? '')
        return [
          key,
          {
            baseUrl: value?.baseUrl ?? '',
            apiKey,
            ...(value?.headers ? { headers: value.headers } : {}),
            ...(value?.bodyDefaults ? { bodyDefaults: value.bodyDefaults } : {})
          }
        ]
      })
    )
  }

  return parseProviderConfig(draftRaw)
}

/**
 * Probe provider connectivity with a tiny authenticated upstream request
 * (max_tokens=1). Validates both reachability and API key — unlike a bare
 * GET on baseUrl which would treat 401 as "reachable".
 */
export async function testProviderConnectivity(
  input: ProviderTestInput
): Promise<ProviderTestResult> {
  const config = resolveProviderConfigForDraft(input)
  const protocols = (Object.keys(config.protocols) as WireAdapter[]).filter(
    (p) => config.protocols[p]?.baseUrl
  )
  const targets = input.protocol ? protocols.filter((p) => p === input.protocol) : protocols

  if (targets.length === 0) {
    return {
      ok: false,
      results: [
        {
          protocol: input.protocol || 'openai-chat',
          ok: false,
          latencyMs: 0,
          error: '没有可测试的协议（请先填写 Base URL）'
        }
      ]
    }
  }

  const results: ProviderTestProtocolResult[] = []
  for (const protocol of targets) {
    const endpoint = config.protocols[protocol]
    if (!endpoint) continue
    const model = pickModel({
      defaultModel: config.defaultModel,
      models: config.models,
      protocol
    })
    results.push(await probeEndpoint(protocol, endpoint, model))
  }

  return {
    ok: results.length > 0 && results.every((r) => r.ok),
    results
  }
}
