export interface AgentModelOption {
  id: string
  name: string
  description?: string
}

export interface MockAgentConfig {
  initialDelayMs?: number
  responses?: string[]
}

export interface AgentConfigSettings {
  defaultModelId?: string
  models?: AgentModelOption[]
  mock?: MockAgentConfig
}

export type ModelCatalogSource = 'sdk' | 'claude-settings' | 'app-config' | 'fallback'

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
