import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getAgentConfig } from './agent-config'
import { getCodexHomeDir } from './codex-executable'

function md5(content: string): string {
  return createHash('md5').update(content).digest('hex')
}

function readOptionalFile(path: string): string {
  try {
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function appConfigSnapshot(agentId: string): string {
  const config = getAgentConfig(agentId)
  return JSON.stringify({
    defaultModelId: config.defaultModelId,
    models: config.models,
    codex: config.codex
      ? {
          defaultModelId: config.codex.defaultModelId,
          sandbox: config.codex.sandbox
        }
      : undefined,
    cursor: config.cursor
      ? {
          defaultModelId: config.cursor.defaultModelId,
          mode: config.cursor.mode,
          autoReview: config.cursor.autoReview,
          settingSources: config.cursor.settingSources
        }
      : undefined
  })
}

/** External agent CLI config files that affect model discovery (SDK/API). */
export function getExternalConfigFingerprint(agentId: string): string {
  const parts: string[] = []

  switch (agentId) {
    case 'claude-code':
      parts.push(readOptionalFile(join(homedir(), '.claude', 'settings.json')))
      break
    case 'codex':
      parts.push(readOptionalFile(join(getCodexHomeDir(), 'config.toml')))
      break
    case 'cursor':
      break
    default:
      break
  }

  return md5(parts.join('\n---\n'))
}

/** App-internal agent config (settings UI) — always re-read for catalog finalize. */
export function getAppConfigFingerprint(agentId: string): string {
  return md5(appConfigSnapshot(agentId))
}

/** Combined fingerprint for logging / diagnostics. */
export function getModelConfigFingerprint(agentId: string): string {
  return md5(`${getExternalConfigFingerprint(agentId)}\n${getAppConfigFingerprint(agentId)}`)
}

export function canReuseDiscoveryCache(
  agentId: string,
  cachedExternalFingerprint: string | undefined
): boolean {
  if (!cachedExternalFingerprint) return false
  return cachedExternalFingerprint === getExternalConfigFingerprint(agentId)
}
