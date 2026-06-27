import { readFileSync } from 'fs'
import { join } from 'path'
import { getCodexHomeDir } from './codex-executable'
import { resolveConfiguredApiKey, resolveEnvValue } from './agent-auth'

export interface CodexModelProviderConfig {
  name?: string
  baseUrl?: string
}

export interface CodexLocalProfile {
  modelProvider?: string
  defaultModel?: string
  providers: Record<string, CodexModelProviderConfig>
}

const PLACEHOLDER_AUTH_VALUES = new Set(['PROXY_MANAGED', ''])

function readTomlStringValue(line: string): string | undefined {
  const match = line.match(/=\s*"((?:\\.|[^"\\])*)"/)
  if (!match) return undefined
  return match[1].replace(/\\"/g, '"')
}

/** Minimal parser for the Codex CLI config fields we need. */
export function parseCodexConfigToml(content: string): CodexLocalProfile {
  const profile: CodexLocalProfile = { providers: {} }
  let activeProviderKey: string | undefined

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const providerHeader = line.match(/^\[model_providers\.([^\]]+)\]$/)
    if (providerHeader) {
      activeProviderKey = providerHeader[1]
      profile.providers[activeProviderKey] = profile.providers[activeProviderKey] ?? {}
      continue
    }

    if (line.startsWith('[')) {
      activeProviderKey = undefined
      continue
    }

    if (!line.includes('=')) continue

    const [rawKey, ...rest] = line.split('=')
    const key = rawKey.trim()
    const value = readTomlStringValue(`=${rest.join('=')}`)
    if (value === undefined) continue

    if (!activeProviderKey) {
      if (key === 'model_provider') profile.modelProvider = value
      if (key === 'model') profile.defaultModel = value
      continue
    }

    const provider = profile.providers[activeProviderKey] ?? {}
    if (key === 'base_url') provider.baseUrl = value
    if (key === 'name') provider.name = value
    profile.providers[activeProviderKey] = provider
  }

  return profile
}

export function readCodexLocalProfile(): CodexLocalProfile | null {
  try {
    const configPath = join(getCodexHomeDir(), 'config.toml')
    const content = readFileSync(configPath, 'utf8')
    return parseCodexConfigToml(content)
  } catch {
    return null
  }
}

function readAuthRecord(): Record<string, string> | null {
  try {
    const authPath = join(getCodexHomeDir(), 'auth.json')
    const parsed = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, unknown>
    const record: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') record[key] = value
    }
    return record
  } catch {
    return null
  }
}

function isUsableApiKey(value: string | undefined): value is string {
  if (!value?.trim()) return false
  return !PLACEHOLDER_AUTH_VALUES.has(value.trim())
}

export function readCodexAuthApiKey(): string | undefined {
  const auth = readAuthRecord()
  if (!auth) return undefined

  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'api_key', 'token']) {
    const value = auth[key]
    if (isUsableApiKey(value)) return value.trim()
  }

  return undefined
}

/** App settings > ~/.codex/auth.json > shell env. */
export function resolveCodexProviderApiKey(): string | undefined {
  return (
    resolveConfiguredApiKey('codex') ||
    readCodexAuthApiKey() ||
    resolveEnvValue(['OPENAI_API_KEY', 'CODEX_API_KEY'])
  )
}

export function resolveActiveCodexProvider(
  profile: CodexLocalProfile
): CodexModelProviderConfig & { id: string } | null {
  const providerId = profile.modelProvider
  if (!providerId) return null

  const provider = profile.providers[providerId]
  if (!provider?.baseUrl) return null

  return { id: providerId, ...provider }
}

export function buildCodexModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/models')) return trimmed
  return `${trimmed}/models`
}

export interface OpenAiModelListItem {
  id: string
  owned_by?: string
  description?: string
}

export async function fetchCodexProviderModels(
  baseUrl: string,
  apiKey: string
): Promise<OpenAiModelListItem[]> {
  const url = buildCodexModelsUrl(baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Models request failed (${response.status})`)
    }

    const payload = (await response.json()) as { data?: OpenAiModelListItem[] }
    if (!Array.isArray(payload.data)) {
      throw new Error('Unexpected models response shape')
    }

    return payload.data.filter((item) => typeof item?.id === 'string' && item.id.length > 0)
  } finally {
    clearTimeout(timeout)
  }
}
