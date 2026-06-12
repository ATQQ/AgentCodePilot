import { agentRegistry } from '../runtime'

export interface RoutingRule {
  pattern: string
  agentId: string
}

export interface RouterConfig {
  rules: RoutingRule[]
  fallback: string[]
  defaultAgent: string
}

const defaultConfig: RouterConfig = {
  rules: [
    { pattern: 'claude*', agentId: 'claude-code' },
    { pattern: 'codex*', agentId: 'codex' },
    { pattern: 'cursor*', agentId: 'cursor' },
    { pattern: 'gpt*', agentId: 'openai' },
    { pattern: 'custom*', agentId: 'custom' }
  ],
  fallback: ['claude-code', 'mock'],
  defaultAgent: 'claude-code'
}

let config: RouterConfig = { ...defaultConfig }

export function setRouterConfig(newConfig: Partial<RouterConfig>): void {
  config = { ...config, ...newConfig }
}

export function getRouterConfig(): RouterConfig {
  return { ...config }
}

function matchPattern(model: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return model.startsWith(pattern.slice(0, -1))
  }
  return model === pattern
}

export function resolveAgent(model: string): string {
  for (const rule of config.rules) {
    if (matchPattern(model, rule.pattern)) {
      const adapter = agentRegistry.get(rule.agentId)
      if (adapter && adapter.enabled) {
        return rule.agentId
      }
    }
  }

  for (const fallbackId of config.fallback) {
    const adapter = agentRegistry.get(fallbackId)
    if (adapter && adapter.enabled) {
      return fallbackId
    }
  }

  return config.defaultAgent
}
