import * as repo from '../database/repositories'
import {
  type AgentConfigSettings,
  type AgentConfigSettingsPublic,
  getAgentConfigSettingKey
} from '../../shared/agent-model'

function readRawConfig(agentId: string): AgentConfigSettings {
  const raw = repo.getSetting(getAgentConfigSettingKey(agentId))
  if (!raw) return {}
  try {
    return JSON.parse(raw) as AgentConfigSettings
  } catch {
    return {}
  }
}

function mergeAuthField(
  incoming: string | undefined,
  existing: string | undefined
): string | undefined {
  if (incoming === undefined || incoming === '__KEEP__') return existing
  if (incoming === '') return undefined
  return incoming.trim() || undefined
}

export function saveAgentConfig(agentId: string, config: AgentConfigSettings): void {
  const existing = readRawConfig(agentId)
  const merged: AgentConfigSettings = {
    ...existing,
    ...config,
    codex: config.codex
      ? {
          ...existing.codex,
          ...config.codex,
          apiKey: mergeAuthField(config.codex.apiKey, existing.codex?.apiKey)
        }
      : existing.codex,
    // Cursor config merge kept so re-enabling adapter works without another config rewrite.
    cursor: config.cursor
      ? {
          ...existing.cursor,
          ...config.cursor,
          apiKey: mergeAuthField(config.cursor.apiKey, existing.cursor?.apiKey)
        }
      : existing.cursor
  }

  repo.setSetting(getAgentConfigSettingKey(agentId), JSON.stringify(merged))
}

export function getAgentConfig(agentId: string): AgentConfigSettings {
  return readRawConfig(agentId)
}

export function sanitizeAgentConfigForRenderer(
  config: AgentConfigSettings
): AgentConfigSettingsPublic {
  const { codex, cursor, ...rest } = config
  const result: AgentConfigSettingsPublic = { ...rest }

  if (codex) {
    result.codex = {
      defaultModelId: codex.defaultModelId,
      sandbox: codex.sandbox,
      hasApiKey: Boolean(codex.apiKey?.trim())
    }
  }

  if (cursor) {
    result.cursor = {
      defaultModelId: cursor.defaultModelId,
      mode: cursor.mode,
      autoReview: cursor.autoReview,
      settingSources: cursor.settingSources,
      hasApiKey: Boolean(cursor.apiKey?.trim())
    }
  }

  return result
}
