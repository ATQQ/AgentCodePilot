import type { AgentModelOption, ModelCatalogResult, ModelCatalogSource } from '../../shared/agent-model'
import { getAgentConfig } from './agent-config'
import {
  fetchCodexProviderModels,
  readCodexLocalProfile,
  resolveActiveCodexProvider,
  resolveCodexProviderApiKey,
  type OpenAiModelListItem
} from './codex-local-config'

const FALLBACK_MODELS: AgentModelOption[] = [
  { id: 'gpt-5.4', name: 'GPT-5.4', description: 'Default Codex model' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', description: 'Codex-optimized model' },
  { id: 'o3', name: 'o3', description: 'Reasoning model' }
]

const discoveryCache = {
  expiresAt: 0,
  discoveredModels: FALLBACK_MODELS,
  discoveredDefault: FALLBACK_MODELS[0]?.id ?? null,
  discoveredSource: 'fallback' as ModelCatalogSource
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
  return models[0]?.id ?? 'gpt-5.4'
}

function mapProviderModels(
  items: OpenAiModelListItem[],
  providerLabel?: string
): AgentModelOption[] {
  return items.map((item) => ({
    id: item.id,
    name: item.id,
    description: item.owned_by
      ? `${providerLabel ?? 'provider'} · ${item.owned_by}`
      : providerLabel
  }))
}

function ensureModelInList(models: AgentModelOption[], modelId: string, label?: string): AgentModelOption[] {
  if (models.some((model) => model.id === modelId)) return models
  return [{ id: modelId, name: modelId, description: label ?? 'From ~/.codex/config.toml' }, ...models]
}

function modelsFromLocalConfigOnly(profile: NonNullable<ReturnType<typeof readCodexLocalProfile>>): {
  models: AgentModelOption[]
  defaultModelId: string | null
  source: ModelCatalogSource
} {
  const provider = resolveActiveCodexProvider(profile)
  const defaultModelId = profile.defaultModel ?? null
  const models: AgentModelOption[] = []

  if (defaultModelId) {
    models.push({
      id: defaultModelId,
      name: defaultModelId,
      description: provider
        ? `Default model · ${provider.name ?? provider.id}`
        : 'Default model from ~/.codex/config.toml'
    })
  }

  if (models.length === 0) {
    return { models: FALLBACK_MODELS, defaultModelId: FALLBACK_MODELS[0]?.id ?? null, source: 'fallback' }
  }

  return { models, defaultModelId, source: 'codex-config' }
}

async function discoverCodexModels(forceRefresh: boolean): Promise<{
  discoveredModels: AgentModelOption[]
  discoveredDefault: string | null
  discoveredSource: ModelCatalogSource
}> {
  if (!forceRefresh && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache
  }

  const profile = readCodexLocalProfile()
  if (!profile) {
    const snapshot = {
      discoveredModels: FALLBACK_MODELS,
      discoveredDefault: FALLBACK_MODELS[0]?.id ?? null,
      discoveredSource: 'fallback' as const
    }
    discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
    Object.assign(discoveryCache, snapshot)
    return snapshot
  }

  const provider = resolveActiveCodexProvider(profile)
  const apiKey = resolveCodexProviderApiKey()
  const providerLabel = provider?.name ?? provider?.id

  if (provider?.baseUrl && apiKey) {
    try {
      const remoteModels = await fetchCodexProviderModels(provider.baseUrl, apiKey)
      let models = mapProviderModels(remoteModels, providerLabel)
      if (profile.defaultModel) {
        models = ensureModelInList(models, profile.defaultModel, providerLabel)
      }

      const snapshot = {
        discoveredModels: models.length > 0 ? models : FALLBACK_MODELS,
        discoveredDefault: profile.defaultModel ?? models[0]?.id ?? null,
        discoveredSource: 'codex-provider' as const
      }
      discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
      Object.assign(discoveryCache, snapshot)
      return snapshot
    } catch {
      // Fall through to config-only discovery.
    }
  }

  const fromConfig = modelsFromLocalConfigOnly(profile)
  const snapshot = {
    discoveredModels: fromConfig.models,
    discoveredDefault: fromConfig.defaultModelId,
    discoveredSource: fromConfig.source
  }
  discoveryCache.expiresAt = Date.now() + CACHE_TTL_MS
  Object.assign(discoveryCache, snapshot)
  return snapshot
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
    appConfig.codex?.defaultModelId,
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

export async function getCodexModelCatalog(forceRefresh = false): Promise<ModelCatalogResult> {
  const appConfig = getAgentConfig('codex')
  const { discoveredModels, discoveredDefault, discoveredSource } =
    await discoverCodexModels(forceRefresh)
  return finalizeCatalog('codex', discoveredModels, discoveredDefault, discoveredSource, appConfig)
}

export function invalidateCodexModelCatalog(): void {
  discoveryCache.expiresAt = 0
}
