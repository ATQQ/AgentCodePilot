import { homedir } from 'os'
import { app } from 'electron'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'
import { loadClaudeAgentSdk } from './claude-sdk-loader'
import { resolveClaudeCodeExecutablePath } from './claude-executable'
import { getShellEnvironment } from '../shell/shell-env'
import {
  type AgentConfigSettings,
  type AgentModelOption,
  type ModelCatalogResult,
  type ModelCatalogSource
} from '../../shared/agent-model'
import { getAgentConfig, saveAgentConfig } from './agent-config'
import { canReuseDiscoveryCache, getExternalConfigFingerprint } from './model-config-fingerprint'

export { saveAgentConfig, getAgentConfig }

const FALLBACK_MODELS: AgentModelOption[] = [
  { id: 'sonnet', name: 'Sonnet', description: 'Balanced speed and capability (default)' },
  { id: 'opus', name: 'Opus', description: 'Most capable, best for complex tasks' },
  { id: 'haiku', name: 'Haiku', description: 'Fastest, best for simple tasks' }
]

const ALIAS_META: Record<string, { label: string; description: string }> = {
  sonnet: { label: 'Sonnet', description: 'Balanced speed and capability' },
  opus: { label: 'Opus', description: 'Most capable, best for complex tasks' },
  haiku: { label: 'Haiku', description: 'Fastest, best for simple tasks' }
}

const discoveryCache = new Map<
  string,
  {
    expiresAt: number
    externalFingerprint: string
    discoveredModels: AgentModelOption[]
    discoveredDefault: string | null
    discoveredSource: ModelCatalogSource
  }
>()
const CACHE_TTL_MS = 5 * 60 * 1000

function readAgentConfig(agentId: string): AgentConfigSettings {
  return getAgentConfig(agentId)
}

function mapSdkModels(models: ModelInfo[]): AgentModelOption[] {
  return models.map((model) => ({
    id: model.value,
    name: model.displayName,
    description: model.description
  }))
}

function buildModelsFromClaudeEnv(env: Record<string, string>): AgentModelOption[] {
  const models: AgentModelOption[] = []

  for (const [alias, meta] of Object.entries(ALIAS_META)) {
    const envPrefix = alias.toUpperCase()
    const displayName = env[`ANTHROPIC_DEFAULT_${envPrefix}_MODEL_NAME`]
    const resolvedModel = env[`ANTHROPIC_DEFAULT_${envPrefix}_MODEL`]
    const name = displayName || meta.label
    const description = resolvedModel && resolvedModel !== name ? resolvedModel : meta.description

    models.push({ id: alias, name, description })
  }

  return models
}

async function fetchSdkModels(): Promise<AgentModelOption[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const { query } = await loadClaudeAgentSdk()
    const claudeExecutable = resolveClaudeCodeExecutablePath()
    const q = query({
      prompt: '',
      options: {
        abortController: controller,
        cwd: app.getPath('home') || homedir(),
        env: getShellEnvironment(),
        ...(claudeExecutable ? { pathToClaudeCodeExecutable: claudeExecutable } : {}),
        maxTurns: 1,
        permissionMode: 'plan'
      }
    })

    let models: ModelInfo[] | null = null

    try {
      models = await q.supportedModels()
    } catch {
      for await (const message of q) {
        if (message.type === 'system') break
      }
      models = await q.supportedModels()
    }

    await q.interrupt().catch(() => {})

    if (!models?.length) return null
    return mapSdkModels(models)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchModelsFromClaudeSettings(): Promise<{
  models: AgentModelOption[]
  defaultModelId: string | null
}> {
  try {
    const { resolveSettings } = await loadClaudeAgentSdk()
    const resolved = await resolveSettings({
      cwd: app.getPath('home') || homedir()
    })
    const env = resolved.effective.env ?? {}
    const models = buildModelsFromClaudeEnv(env)
    const defaultModelId = resolved.effective.model ?? null
    return { models, defaultModelId }
  } catch {
    return { models: FALLBACK_MODELS, defaultModelId: null }
  }
}

function pickDefaultModelId(
  models: AgentModelOption[],
  ...candidates: Array<string | null | undefined>
): string {
  const ids = new Set(models.map((m) => m.id))
  for (const candidate of candidates) {
    if (candidate && ids.has(candidate)) return candidate
  }
  return models[0]?.id ?? 'sonnet'
}

function finalizeCatalog(
  agentId: string,
  discoveredModels: AgentModelOption[],
  discoveredDefault: string | null,
  discoveredSource: ModelCatalogSource,
  appConfig: AgentConfigSettings
): ModelCatalogResult {
  const models =
    appConfig.models && appConfig.models.length > 0 ? appConfig.models : discoveredModels

  const defaultModelId = pickDefaultModelId(
    models,
    appConfig.defaultModelId,
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
    discoveredSource,
    claudeDefaultModelId: discoveredDefault
  }
}

async function discoverModels(forceRefresh: boolean): Promise<{
  discoveredModels: AgentModelOption[]
  discoveredDefault: string | null
  discoveredSource: ModelCatalogSource
}> {
  const cacheKey = 'claude-code'
  const cached = discoveryCache.get(cacheKey)
  const externalFingerprint = getExternalConfigFingerprint('claude-code')

  if (cached && canReuseDiscoveryCache('claude-code', cached.externalFingerprint)) {
    return cached
  }

  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached
  }

  const sdkModels = await fetchSdkModels()
  if (sdkModels?.length) {
    const claudeSettings = await fetchModelsFromClaudeSettings()
    const snapshot = {
      discoveredModels: sdkModels,
      discoveredDefault: claudeSettings.defaultModelId,
      discoveredSource: 'sdk' as const
    }
    discoveryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      externalFingerprint,
      ...snapshot
    })
    return snapshot
  }

  const claudeSettings = await fetchModelsFromClaudeSettings()
  const fromClaudeSettings = claudeSettings.models.length > 0
  const snapshot = {
    discoveredModels: fromClaudeSettings ? claudeSettings.models : FALLBACK_MODELS,
    discoveredDefault: claudeSettings.defaultModelId,
    discoveredSource: (fromClaudeSettings ? 'claude-settings' : 'fallback') as ModelCatalogSource
  }
  discoveryCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    externalFingerprint,
    ...snapshot
  })
  return snapshot
}

export async function getClaudeModelCatalog(forceRefresh = false): Promise<ModelCatalogResult> {
  const appConfig = readAgentConfig('claude-code')
  const { discoveredModels, discoveredDefault, discoveredSource } =
    await discoverModels(forceRefresh)
  return finalizeCatalog(
    'claude-code',
    discoveredModels,
    discoveredDefault,
    discoveredSource,
    appConfig
  )
}

export function invalidateClaudeModelCatalog(): void {
  discoveryCache.delete('claude-code')
}
