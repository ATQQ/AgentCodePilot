import {
  deleteProviderConfig,
  getAllProviderConfigs,
  getProviderConfig,
  saveProviderConfig
} from '../database/repositories'
import type {
  GatewayProviderConfig,
  GatewayProviderPublic,
  GatewayProviderRecord,
  ProtocolEndpointConfig,
  ProtocolEndpointPublic,
  WireAdapter
} from './types'

const KEEP = '__KEEP__'

export const WIRE_ADAPTERS: WireAdapter[] = ['openai-chat', 'anthropic', 'openai-responses']

function isWireAdapter(value: unknown): value is WireAdapter {
  return value === 'openai-chat' || value === 'anthropic' || value === 'openai-responses'
}

function parseStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const list = raw.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
  return list.length ? list : undefined
}

function parseModelMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const map = Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
  return Object.keys(map).length ? map : undefined
}

function parseStringMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const map: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    if (!name || typeof value !== 'string') continue
    map[name] = value
  }
  return Object.keys(map).length ? map : undefined
}

function parseBodyDefaults(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const map = { ...(raw as Record<string, unknown>) }
  return Object.keys(map).length ? map : undefined
}

/** Protocol endpoint: address + key (+ optional request overrides). Models are provider-shared. */
function parseEndpoint(raw: unknown, adapter?: WireAdapter): ProtocolEndpointConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const rawBase = typeof obj.baseUrl === 'string' ? obj.baseUrl.trim().replace(/\/+$/, '') : ''
  if (!rawBase) return undefined
  const headers = parseStringMap(obj.headers)
  const bodyDefaults = parseBodyDefaults(obj.bodyDefaults)
  return {
    baseUrl: adapter ? normalizeProtocolBaseUrl(adapter, rawBase) : rawBase,
    apiKey: typeof obj.apiKey === 'string' ? obj.apiKey : '',
    ...(headers ? { headers } : {}),
    ...(bodyDefaults ? { bodyDefaults } : {})
  }
}

/**
 * Volces / BytePlus Coding Plan uses different roots per wire:
 * - openai-chat: .../api/coding/v3
 * - anthropic:   .../api/coding  (no /v3)
 * Users often paste the OpenAI URL into both; normalize anthropic.
 */
function normalizeProtocolBaseUrl(adapter: WireAdapter, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (adapter !== 'anthropic') return trimmed
  if (/\/api\/coding\/v3$/i.test(trimmed)) {
    return trimmed.replace(/\/v3$/i, '')
  }
  return trimmed
}

function collectModelsFromLegacyProtocols(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const models = parseStringList((value as Record<string, unknown>).models)
    for (const model of models ?? []) seen.add(model)
  }
  return seen.size ? Array.from(seen) : undefined
}

function collectDefaultFromLegacyProtocols(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const defaultModel = (value as Record<string, unknown>).defaultModel
    if (typeof defaultModel === 'string' && defaultModel.trim()) return defaultModel.trim()
  }
  return undefined
}

function flattenPrimary(
  protocols: Partial<Record<WireAdapter, ProtocolEndpointConfig>>,
  preferred: WireAdapter | undefined,
  shared: {
    models?: string[]
    defaultModel?: string
    modelMap?: Record<string, string>
  }
): GatewayProviderConfig {
  const adapter =
    (preferred && protocols[preferred] ? preferred : undefined) ||
    (protocols['openai-chat'] ? 'openai-chat' : undefined) ||
    (protocols['openai-responses'] ? 'openai-responses' : undefined) ||
    (protocols.anthropic ? 'anthropic' : undefined) ||
    preferred ||
    'openai-chat'
  const endpoint = protocols[adapter]
  return {
    protocols,
    adapter,
    baseUrl: endpoint?.baseUrl ?? '',
    apiKey: endpoint?.apiKey ?? '',
    models: shared.models,
    defaultModel: shared.defaultModel,
    modelMap: shared.modelMap
  }
}

export function parseProviderConfig(raw: unknown): GatewayProviderConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const protocols: Partial<Record<WireAdapter, ProtocolEndpointConfig>> = {}

  if (obj.protocols && typeof obj.protocols === 'object' && !Array.isArray(obj.protocols)) {
    for (const [key, value] of Object.entries(obj.protocols as Record<string, unknown>)) {
      if (!isWireAdapter(key)) continue
      const endpoint = parseEndpoint(value, key)
      if (endpoint) protocols[key] = endpoint
    }
  }

  const legacyAdapter: WireAdapter = isWireAdapter(obj.adapter) ? obj.adapter : 'openai-chat'
  const legacyBase = typeof obj.baseUrl === 'string' ? obj.baseUrl.trim().replace(/\/+$/, '') : ''
  if (legacyBase && !protocols[legacyAdapter]) {
    const legacy = parseEndpoint(
      {
        baseUrl: legacyBase,
        apiKey: typeof obj.apiKey === 'string' ? obj.apiKey : ''
      },
      legacyAdapter
    )
    if (legacy) protocols[legacyAdapter] = legacy
  }

  const sharedModels =
    parseStringList(obj.models) ?? collectModelsFromLegacyProtocols(obj.protocols)
  const sharedDefault =
    typeof obj.defaultModel === 'string' && obj.defaultModel.trim()
      ? obj.defaultModel.trim()
      : collectDefaultFromLegacyProtocols(obj.protocols)

  return flattenPrimary(protocols, isWireAdapter(obj.adapter) ? obj.adapter : undefined, {
    models: sharedModels,
    defaultModel: sharedDefault,
    modelMap: parseModelMap(obj.modelMap)
  })
}

/** Missing / legacy configs default to enabled. */
export function parseProviderEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true
  const enabled = (raw as Record<string, unknown>).enabled
  return enabled !== false
}

function recordFromRow(row: {
  id: string
  name: string
  type: string
  config: string
}): GatewayProviderRecord {
  const raw = JSON.parse(row.config || '{}') as unknown
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: parseProviderEnabled(raw),
    config: parseProviderConfig(raw)
  }
}

export function listProviders(): GatewayProviderRecord[] {
  return getAllProviderConfigs().map(recordFromRow)
}

export function listEnabledProviders(): GatewayProviderRecord[] {
  return listProviders().filter((provider) => provider.enabled)
}

export function getProvider(id: string): GatewayProviderRecord | undefined {
  const row = getProviderConfig(id)
  if (!row) return undefined
  return recordFromRow(row)
}

function toPublicEndpoint(endpoint: ProtocolEndpointConfig): ProtocolEndpointPublic {
  return {
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    ...(endpoint.headers ? { headers: endpoint.headers } : {}),
    ...(endpoint.bodyDefaults ? { bodyDefaults: endpoint.bodyDefaults } : {})
  }
}

export function toPublicProvider(record: GatewayProviderRecord): GatewayProviderPublic {
  const protocols: Partial<Record<WireAdapter, ProtocolEndpointPublic & { hasApiKey: boolean }>> =
    {}
  for (const [key, endpoint] of Object.entries(record.config.protocols)) {
    if (!isWireAdapter(key) || !endpoint) continue
    protocols[key] = {
      ...toPublicEndpoint(endpoint),
      hasApiKey: Boolean(endpoint.apiKey?.trim())
    }
  }
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    enabled: record.enabled,
    config: {
      adapter: record.config.adapter,
      baseUrl: record.config.baseUrl,
      apiKey: record.config.apiKey,
      models: record.config.models,
      defaultModel: record.config.defaultModel,
      modelMap: record.config.modelMap,
      hasApiKey: Boolean(record.config.apiKey?.trim()),
      protocols
    }
  }
}

export function listPublicProviders(): GatewayProviderPublic[] {
  return listProviders().map(toPublicProvider)
}

function mergeEndpointApiKey(
  incoming: ProtocolEndpointConfig,
  existing: ProtocolEndpointConfig | undefined,
  apiKeyRaw: unknown
): ProtocolEndpointConfig {
  let apiKey = incoming.apiKey
  if (apiKeyRaw === KEEP || apiKeyRaw === undefined) {
    apiKey = existing?.apiKey ?? ''
  }
  return { ...incoming, apiKey }
}

export function saveProvider(input: {
  id: string
  name: string
  type: string
  config: unknown
}): GatewayProviderPublic {
  const existing = getProvider(input.id)
  const raw =
    input.config && typeof input.config === 'object'
      ? (input.config as Record<string, unknown>)
      : {}
  const incoming = parseProviderConfig(raw)

  const protocols: Partial<Record<WireAdapter, ProtocolEndpointConfig>> = {}
  const rawProtocols =
    raw.protocols && typeof raw.protocols === 'object' && !Array.isArray(raw.protocols)
      ? (raw.protocols as Record<string, unknown>)
      : {}

  for (const adapter of WIRE_ADAPTERS) {
    const next = incoming.protocols[adapter]
    if (!next) continue
    const prev = existing?.config.protocols[adapter]
    const protoRaw = rawProtocols[adapter]
    const apiKeyRaw =
      protoRaw && typeof protoRaw === 'object' && !Array.isArray(protoRaw)
        ? (protoRaw as Record<string, unknown>).apiKey
        : undefined
    protocols[adapter] = mergeEndpointApiKey(next, prev, apiKeyRaw)
  }

  // Legacy top-level apiKey keep when only primary protocol is present via flat fields
  if (
    Object.keys(protocols).length === 0 &&
    typeof raw.baseUrl === 'string' &&
    raw.baseUrl.trim()
  ) {
    const adapter = isWireAdapter(raw.adapter) ? raw.adapter : 'openai-chat'
    protocols[adapter] = mergeEndpointApiKey(
      { baseUrl: raw.baseUrl.trim().replace(/\/+$/, ''), apiKey: '' },
      existing?.config.protocols[adapter],
      raw.apiKey
    )
  }

  // Partial updates (e.g. toggle enabled) keep existing protocol endpoints.
  if (Object.keys(protocols).length === 0 && existing) {
    for (const adapter of WIRE_ADAPTERS) {
      const prev = existing.config.protocols[adapter]
      if (prev) protocols[adapter] = prev
    }
  }

  const sharedModels = parseStringList(raw.models) ?? incoming.models ?? existing?.config.models
  const sharedDefault =
    typeof raw.defaultModel === 'string'
      ? raw.defaultModel.trim() || undefined
      : (incoming.defaultModel ?? existing?.config.defaultModel)
  const sharedMap = parseModelMap(raw.modelMap) ?? incoming.modelMap ?? existing?.config.modelMap

  const enabled =
    typeof raw.enabled === 'boolean' ? raw.enabled : (existing?.enabled ?? true)

  const config = flattenPrimary(
    protocols,
    isWireAdapter(raw.adapter) ? raw.adapter : existing?.config.adapter || incoming.adapter,
    {
      models: sharedModels,
      defaultModel: sharedDefault,
      modelMap: sharedMap
    }
  )

  saveProviderConfig({
    id: input.id,
    name: input.name,
    type: input.type || config.adapter,
    config: JSON.stringify({ ...config, enabled })
  })

  const saved = getProvider(input.id)
  if (!saved) throw new Error(`Failed to save provider ${input.id}`)
  return toPublicProvider(saved)
}

export function removeProvider(id: string): void {
  deleteProviderConfig(id)
}

export function providerSupportsProtocol(
  provider: GatewayProviderRecord,
  protocol: WireAdapter
): boolean {
  return Boolean(provider.config.protocols[protocol]?.baseUrl)
}

export function getProviderEndpoint(
  provider: GatewayProviderRecord,
  protocol: WireAdapter
): ProtocolEndpointConfig | undefined {
  return provider.config.protocols[protocol]
}

function presetConfig(
  adapter: WireAdapter,
  baseUrl: string,
  models?: string[]
): GatewayProviderConfig {
  return {
    protocols: { [adapter]: { baseUrl, apiKey: '' } },
    adapter,
    baseUrl,
    apiKey: '',
    models
  }
}

export const PROVIDER_PRESETS: Array<{
  id: string
  name: string
  type: string
  config: GatewayProviderConfig
}> = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-chat',
    config: presetConfig('openai-chat', 'https://api.openai.com', ['gpt-4o', 'gpt-4o-mini'])
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    config: presetConfig('anthropic', 'https://api.anthropic.com', [
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001'
    ])
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-chat',
    config: presetConfig('openai-chat', 'https://api.deepseek.com', [
      'deepseek-chat',
      'deepseek-reasoner'
    ])
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai-chat',
    config: presetConfig('openai-chat', 'https://openrouter.ai/api', [
      'openai/gpt-4o-mini',
      'anthropic/claude-sonnet-4'
    ])
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'openai-chat',
    config: presetConfig('openai-chat', 'http://127.0.0.1:11434', ['llama3.2'])
  }
]
