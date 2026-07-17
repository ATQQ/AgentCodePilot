import { getShellEnvironment } from '../shell/shell-env'
import { getAgentConfig } from './agent-config'
import type { AgentConfigSettings } from '../../shared/agent-model'

export function resolveEnvValue(names: string[]): string | undefined {
  for (const name of names) {
    const fromProcess = process.env[name]?.trim()
    if (fromProcess) return fromProcess
  }

  const shellEnv = getShellEnvironment()
  for (const name of names) {
    const fromShell = shellEnv[name]?.trim()
    if (fromShell) return fromShell
  }

  return undefined
}

/** `'cursor'` kept for disabled Cursor Agent sources (see CURSOR_AGENT_DISABLED.md). */
export function resolveApiKey(agentId: 'codex' | 'cursor', envNames: string[]): string | undefined {
  const config = getAgentConfig(agentId)
  const nested = agentId === 'codex' ? config.codex?.apiKey : config.cursor?.apiKey
  if (nested?.trim()) return nested.trim()
  return resolveEnvValue(envNames)
}

/** App settings only — does not read env vars (CLI profile may already be authenticated). */
export function resolveConfiguredApiKey(agentId: 'codex' | 'cursor'): string | undefined {
  const config = getAgentConfig(agentId)
  const nested = agentId === 'codex' ? config.codex?.apiKey : config.cursor?.apiKey
  return nested?.trim() || undefined
}

export function getNestedAgentConfig(agentId: 'codex' | 'cursor'): AgentConfigSettings {
  return getAgentConfig(agentId)
}
