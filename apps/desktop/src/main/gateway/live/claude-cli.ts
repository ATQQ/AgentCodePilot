import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { CLAUDE_AUTH_ENV_KEYS, PROXY_MANAGED, buildProxyBaseUrl } from './constants'

export function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json')
}

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

export function readClaudeSettings(): Record<string, unknown> {
  return readJsonFile(getClaudeSettingsPath())
}

export function isClaudeTakeoverActive(
  settings: Record<string, unknown>,
  proxyBaseUrl: string
): boolean {
  const env =
    settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
      ? (settings.env as Record<string, unknown>)
      : {}
  const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : ''
  const hasPlaceholder = CLAUDE_AUTH_ENV_KEYS.some((key) => env[key] === PROXY_MANAGED)
  return baseUrl.replace(/\/+$/, '') === proxyBaseUrl.replace(/\/+$/, '') && hasPlaceholder
}

export function applyClaudeCliTakeover(host: string, port: number): Record<string, unknown> {
  const path = getClaudeSettingsPath()
  const current = readClaudeSettings()
  const env =
    current.env && typeof current.env === 'object' && !Array.isArray(current.env)
      ? { ...(current.env as Record<string, unknown>) }
      : {}

  env.ANTHROPIC_BASE_URL = buildProxyBaseUrl(host, port)

  let hasAuthKey = false
  for (const key of CLAUDE_AUTH_ENV_KEYS) {
    if (typeof env[key] === 'string' && (env[key] as string).length > 0) {
      env[key] = PROXY_MANAGED
      hasAuthKey = true
    }
  }
  if (!hasAuthKey) {
    env.ANTHROPIC_AUTH_TOKEN = PROXY_MANAGED
  }

  const next = { ...current, env }
  atomicWriteJson(path, next)
  return current
}

export function restoreClaudeCliSettings(backup: Record<string, unknown>): void {
  const path = getClaudeSettingsPath()
  if (Object.keys(backup).length === 0 && !existsSync(path)) {
    return
  }
  atomicWriteJson(path, backup)
}

export function claudeSettingsHasForeignProxy(
  settings: Record<string, unknown>,
  ourBaseUrl: string
): boolean {
  const env =
    settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
      ? (settings.env as Record<string, unknown>)
      : {}
  const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL.trim() : ''
  if (!baseUrl) return false
  const normalized = baseUrl.replace(/\/+$/, '')
  const ours = ourBaseUrl.replace(/\/+$/, '')
  const looksLocal = normalized.includes('127.0.0.1') || normalized.includes('localhost')
  if (!looksLocal) return false
  if (normalized === ours) return false
  // Already PROXY_MANAGED under another local proxy
  return CLAUDE_AUTH_ENV_KEYS.some((key) => env[key] === PROXY_MANAGED) || looksLocal
}
