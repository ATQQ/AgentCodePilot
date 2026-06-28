import type {
  AgentModelOption,
  ModelCatalogResult,
  ModelCatalogSource
} from '../../shared/agent-model'
import { resolveApiKey } from './agent-auth'
import { getAgentConfig } from './agent-config'
import { loadCursorSdk } from './cursor-sdk-loader'
import { canReuseDiscoveryCache, getExternalConfigFingerprint } from './model-config-fingerprint'

const FALLBACK_MODELS: AgentModelOption[] = [
  { id: 'composer-2.5', name: 'Composer 2.5', description: 'Default Cursor agent model' },
  { id: 'auto', name: 'Auto', description: 'Let Cursor pick the model' }
]

const discoveryCache = {
  expiresAt: 0,
  externalFingerprint: '',
  models: FALLBACK_MODELS
}
const CACHE_TTL_MS = 5 * 60 * 1000

function pickDefaultModelId(
  models: AgentModelOption[],
  ...candidates: Array<string | null | undefined>
): string {
  const ids = new Set(models.map((m) => m.id))
  for (const candidate of candidates) {
    if (candidate && ids.has(candidate)) return candidate
  }
  return models[0]?.id ?? 'composer-2.5'
}

function finalizeCatalog(
  agentId: string,
  discoveredModels: AgentModelOption[],
  discoveredDefault: string | null,
  discoveredSource: ModelCatalogSource,
  appConfig: ReturnType<typeof getAgentConfig>
): ModelCatalogResult {
  const models =
    appConfig.models && appConfig.models.length > 0 ? appConfig.models : discoveredModels

  const defaultModelId = pickDefaultModelId(
    models,
    appConfig.defaultModelId,
    appConfig.cursor?.defaultModelId,
    discoveredDefault,
    models[0]?.id
  )

  const source: ModelCatalogSource =
    appConfig.models && appConfig.models.length > 0 ? 'app-config' : discoveredSource

  return {
    agentId,
    models,
    discoveredModels,
    defaultModelId,
    source,
    discoveredSource
  }
}

async function discoverCursorModels(forceRefresh: boolean): Promise<AgentModelOption[]> {
  const externalFingerprint = getExternalConfigFingerprint('cursor')

  if (canReuseDiscoveryCache('cursor', discoveryCache.externalFingerprint)) {
    return discoveryCache.models
  }

  if (!forceRefresh && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache.models
  }

  const apiKey = resolveApiKey('cursor', ['CURSOR_API_KEY'])
  if (!apiKey) {
    discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
    discoveryCache.externalFingerprint = externalFingerprint
    discoveryCache.models = FALLBACK_MODELS
    return FALLBACK_MODELS
  }

  try {
    const { Cursor } = await loadCursorSdk()
    const sdkModels = await Cursor.models.list({ apiKey })
    if (!sdkModels.length) {
      discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
      discoveryCache.externalFingerprint = externalFingerprint
      discoveryCache.models = FALLBACK_MODELS
      return FALLBACK_MODELS
    }

    const mapped = sdkModels.map((model) => ({
      id: model.id,
      name: model.displayName,
      description: model.description
    }))
    discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
    discoveryCache.externalFingerprint = externalFingerprint
    discoveryCache.models = mapped
    return mapped
  } catch {
    discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
    discoveryCache.externalFingerprint = externalFingerprint
    discoveryCache.models = FALLBACK_MODELS
    return FALLBACK_MODELS
  }
}

export async function getCursorModelCatalog(forceRefresh = false): Promise<ModelCatalogResult> {
  const appConfig = getAgentConfig('cursor')
  const discoveredModels = await discoverCursorModels(forceRefresh)
  const discoveredSource: ModelCatalogSource =
    discoveredModels === FALLBACK_MODELS ? 'fallback' : 'cursor-sdk'
  return finalizeCatalog(
    'cursor',
    discoveredModels,
    discoveredModels[0]?.id ?? null,
    discoveredSource,
    appConfig
  )
}

export function invalidateCursorModelCatalog(): void {
  discoveryCache.expiresAt = 0
  discoveryCache.externalFingerprint = ''
}
