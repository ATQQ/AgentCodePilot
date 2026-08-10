import { joinUrl } from './adapters/base'
import { resolveProviderConfigForDraft, type ProviderTestInput } from './provider-test'
import { applyHeaderOverrides } from './request-overrides'
import type { ProtocolEndpointConfig, WireAdapter } from './types'

const FETCH_TIMEOUT_MS = 15_000

export interface ProviderRemoteModel {
  id: string
  name?: string
  protocol: WireAdapter
}

export interface ProviderFetchModelsError {
  protocol: WireAdapter
  error: string
}

export interface ProviderFetchModelsResult {
  ok: boolean
  models: ProviderRemoteModel[]
  errors: ProviderFetchModelsError[]
}

interface UpstreamModelItem {
  id?: unknown
  display_name?: unknown
  name?: unknown
}

function parseModelItems(payload: unknown, protocol: WireAdapter): ProviderRemoteModel[] {
  const data = (payload as { data?: UpstreamModelItem[] } | null)?.data
  if (!Array.isArray(data)) {
    throw new Error('Unexpected models response shape')
  }

  const seen = new Set<string>()
  const models: ProviderRemoteModel[] = []
  for (const item of data) {
    if (typeof item?.id !== 'string' || !item.id.trim()) continue
    const id = item.id.trim()
    if (seen.has(id)) continue
    seen.add(id)
    const name =
      typeof item.display_name === 'string' && item.display_name.trim()
        ? item.display_name.trim()
        : typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : undefined
    models.push({ id, name, protocol })
  }
  return models
}

async function fetchProtocolModels(
  protocol: WireAdapter,
  endpoint: ProtocolEndpointConfig
): Promise<{ models: ProviderRemoteModel[]; error?: string }> {
  if (!endpoint.baseUrl.trim()) {
    return { models: [], error: 'Base URL 为空' }
  }
  if (!endpoint.apiKey.trim()) {
    return { models: [], error: 'API Key 为空' }
  }

  const url = joinUrl(endpoint.baseUrl, '/v1/models')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (protocol === 'anthropic') {
    headers['x-api-key'] = endpoint.apiKey
    headers.Authorization = `Bearer ${endpoint.apiKey}`
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers.Authorization = `Bearer ${endpoint.apiKey}`
  }
  const finalHeaders = applyHeaderOverrides(headers, endpoint.headers)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: finalHeaders,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return {
        models: [],
        error: `HTTP ${res.status}: ${text.slice(0, 240) || res.statusText}`
      }
    }
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      return { models: [], error: 'Models response is not valid JSON' }
    }
    return { models: parseModelItems(payload, protocol) }
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * List upstream models via GET /v1/models for each enabled protocol.
 * Partial success is allowed: successful protocols contribute models, failures go to errors.
 */
export async function fetchProviderModels(
  input: ProviderTestInput
): Promise<ProviderFetchModelsResult> {
  const config = resolveProviderConfigForDraft(input)
  const protocols = (Object.keys(config.protocols) as WireAdapter[]).filter(
    (p) => config.protocols[p]?.baseUrl
  )
  const targets = input.protocol ? protocols.filter((p) => p === input.protocol) : protocols

  if (targets.length === 0) {
    return {
      ok: false,
      models: [],
      errors: [
        {
          protocol: input.protocol || 'openai-chat',
          error: '没有可拉取的协议（请先填写 Base URL）'
        }
      ]
    }
  }

  const models: ProviderRemoteModel[] = []
  const errors: ProviderFetchModelsError[] = []
  const seen = new Set<string>()

  for (const protocol of targets) {
    const endpoint = config.protocols[protocol]
    if (!endpoint) continue
    const result = await fetchProtocolModels(protocol, endpoint)
    if (result.error) {
      errors.push({ protocol, error: result.error })
      continue
    }
    for (const model of result.models) {
      if (seen.has(model.id)) continue
      seen.add(model.id)
      models.push(model)
    }
  }

  return {
    ok: models.length > 0,
    models,
    errors
  }
}
