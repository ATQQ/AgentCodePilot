import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getCodexHomeDir } from '../../runtime/codex-executable'
import { CODEX_PROXY_PROVIDER_ID, PROXY_MANAGED, buildProxyV1Url } from './constants'

export interface CodexBackup {
  configToml: string
  configExisted: boolean
  authJson: string
  authExisted: boolean
}

function getCodexConfigPath(): string {
  return join(getCodexHomeDir(), 'config.toml')
}

function getCodexAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

export function readCodexConfigToml(): { content: string; existed: boolean } {
  const path = getCodexConfigPath()
  if (!existsSync(path)) return { content: '', existed: false }
  try {
    return { content: readFileSync(path, 'utf8'), existed: true }
  } catch {
    return { content: '', existed: false }
  }
}

function readCodexAuthJson(): { content: string; existed: boolean } {
  const path = getCodexAuthPath()
  if (!existsSync(path)) return { content: '', existed: false }
  try {
    return { content: readFileSync(path, 'utf8'), existed: true }
  } catch {
    return { content: '', existed: false }
  }
}

function writeCodexAuthPlaceholder(): void {
  atomicWrite(getCodexAuthPath(), JSON.stringify({ OPENAI_API_KEY: PROXY_MANAGED }, null, 2) + '\n')
}

function isAuthPlaceholderActive(): boolean {
  const { content, existed } = readCodexAuthJson()
  if (!existed || !content.trim()) return false
  try {
    const parsed = JSON.parse(content) as { OPENAI_API_KEY?: unknown }
    return parsed.OPENAI_API_KEY === PROXY_MANAGED
  } catch {
    return false
  }
}

/**
 * Upsert [model_providers.agent-desktop], set model_provider, and replace
 * ~/.codex/auth.json OPENAI_API_KEY with PROXY_MANAGED (Codex prefers auth.json).
 */
export function applyCodexTakeover(host: string, port: number): CodexBackup {
  const { content, existed } = readCodexConfigToml()
  const auth = readCodexAuthJson()
  const backup: CodexBackup = {
    configToml: content,
    configExisted: existed,
    authJson: auth.content,
    authExisted: auth.existed
  }

  const providerId = CODEX_PROXY_PROVIDER_ID
  const baseUrl = buildProxyV1Url(host, port)

  // Remove previous agent-desktop provider block if present
  let next = content.replace(
    new RegExp(`\\n?\\[model_providers\\.${providerId}\\][\\s\\S]*?(?=\\n\\[|$)`, 'g'),
    '\n'
  )

  // Update or insert top-level model_provider
  if (/^model_provider\s*=/m.test(next)) {
    next = next.replace(/^model_provider\s*=\s*.*$/m, `model_provider = "${providerId}"`)
  } else {
    next = `model_provider = "${providerId}"\n` + next.trimStart()
  }

  const section = [
    '',
    `[model_providers.${providerId}]`,
    `name = "Agent Desktop Gateway"`,
    `base_url = "${baseUrl}"`,
    `wire_api = "responses"`,
    `experimental_bearer_token = "${PROXY_MANAGED}"`,
    ''
  ].join('\n')

  next = next.trimEnd() + '\n' + section
  atomicWrite(getCodexConfigPath(), next)
  writeCodexAuthPlaceholder()
  return backup
}

export function restoreCodexConfig(backup: CodexBackup): void {
  const path = getCodexConfigPath()
  if (!backup.configExisted) {
    if (existsSync(path)) {
      try {
        rmSync(path)
      } catch {
        atomicWrite(path, '')
      }
    }
  } else {
    atomicWrite(path, backup.configToml)
  }

  // Older backups (pre-auth takeover) omit auth fields — leave auth.json untouched.
  if (backup.authJson === undefined && backup.authExisted === undefined) {
    return
  }

  const authPath = getCodexAuthPath()
  if (!backup.authExisted) {
    if (existsSync(authPath)) {
      try {
        rmSync(authPath)
      } catch {
        // leave file if delete fails
      }
    }
    return
  }
  atomicWrite(authPath, backup.authJson || '{}\n')
}

export function isCodexTakeoverActive(host: string, port: number): boolean {
  const { content } = readCodexConfigToml()
  if (!content) return false
  const baseUrl = buildProxyV1Url(host, port)
  return (
    content.includes(`[model_providers.${CODEX_PROXY_PROVIDER_ID}]`) &&
    content.includes(`base_url = "${baseUrl}"`) &&
    content.includes(`experimental_bearer_token = "${PROXY_MANAGED}"`) &&
    isAuthPlaceholderActive()
  )
}
