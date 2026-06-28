export interface AgentModelOption {
  id: string
  name: string
  description?: string
}

export interface MockAgentConfig {
  initialDelayMs?: number
  responses?: string[]
}

export interface AgentAuthConfig {
  apiKey?: string
}

export type CodexSandboxPreset = 'read_only' | 'workspace_write' | 'full_access'

export interface CodexAgentConfig extends AgentAuthConfig {
  defaultModelId?: string
  sandbox?: CodexSandboxPreset
}

export type CursorSettingSource = 'project' | 'user' | 'team' | 'mdm' | 'plugins' | 'all'

export interface CursorAgentConfig extends AgentAuthConfig {
  defaultModelId?: string
  mode?: 'agent' | 'plan'
  autoReview?: boolean
  settingSources?: CursorSettingSource[]
}

export interface AgentConfigSettings {
  defaultModelId?: string
  models?: AgentModelOption[]
  mock?: MockAgentConfig
  codex?: CodexAgentConfig
  cursor?: CursorAgentConfig
}

/** Config returned to renderer — API keys are never included. */
export interface AgentConfigSettingsPublic extends Omit<AgentConfigSettings, 'codex' | 'cursor'> {
  codex?: Omit<CodexAgentConfig, 'apiKey'> & { hasApiKey?: boolean }
  cursor?: Omit<CursorAgentConfig, 'apiKey'> & { hasApiKey?: boolean }
}

export type ModelCatalogSource =
  | 'sdk'
  | 'claude-settings'
  | 'codex-config'
  | 'codex-provider'
  | 'cursor-sdk'
  | 'app-config'
  | 'fallback'

export interface ModelCatalogResult {
  agentId: string
  models: AgentModelOption[]
  discoveredModels: AgentModelOption[]
  defaultModelId: string
  source: ModelCatalogSource
  discoveredSource: ModelCatalogSource
  claudeDefaultModelId?: string | null
}

export const AGENT_CONFIG_SETTING_PREFIX = 'agentConfig:'

export function getAgentConfigSettingKey(agentId: string): string {
  return `${AGENT_CONFIG_SETTING_PREFIX}${agentId}`
}
