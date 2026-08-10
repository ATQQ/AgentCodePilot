import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { CLAUDE_DESKTOP_PROFILE_ID, buildClaudeDesktopGatewayUrl } from './constants'
import { listEnabledProviders } from '../provider-store'

export interface ClaudeDesktopPaths {
  normalConfig: string
  threepConfig: string
  configLibraryDir: string
  profilePath: string
  metaPath: string
}

export interface ClaudeDesktopFileSnapshot {
  path: string
  exists: boolean
  content: string | null
}

export function isClaudeDesktopSupported(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32'
}

export function getClaudeDesktopPaths(): ClaudeDesktopPaths | null {
  if (process.platform === 'darwin') {
    const support = join(homedir(), 'Library', 'Application Support')
    const library = join(support, 'Claude-3p', 'configLibrary')
    return {
      normalConfig: join(support, 'Claude', 'claude_desktop_config.json'),
      threepConfig: join(support, 'Claude-3p', 'claude_desktop_config.json'),
      configLibraryDir: library,
      profilePath: join(library, `${CLAUDE_DESKTOP_PROFILE_ID}.json`),
      metaPath: join(library, '_meta.json')
    }
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    const library = join(local, 'Claude-3p', 'configLibrary')
    return {
      normalConfig: join(local, 'Claude', 'claude_desktop_config.json'),
      threepConfig: join(local, 'Claude-3p', 'claude_desktop_config.json'),
      configLibraryDir: library,
      profilePath: join(library, `${CLAUDE_DESKTOP_PROFILE_ID}.json`),
      metaPath: join(library, '_meta.json')
    }
  }
  return null
}

function readOptional(path: string): ClaudeDesktopFileSnapshot {
  if (!existsSync(path)) return { path, exists: false, content: null }
  try {
    return { path, exists: true, content: readFileSync(path, 'utf8') }
  } catch {
    return { path, exists: true, content: null }
  }
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

function parseJson(content: string | null): Record<string, unknown> {
  if (!content) return {}
  try {
    const parsed = JSON.parse(content) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function buildInferenceModels(): Array<{
  name: string
  labelOverride?: string
  supports1m?: boolean
}> {
  const models: Array<{ name: string; labelOverride?: string; supports1m?: boolean }> = []
  const seen = new Set<string>()
  for (const provider of listEnabledProviders()) {
    for (const model of [
      provider.config.defaultModel,
      ...(provider.config.models ?? []),
      ...Object.keys(provider.config.modelMap ?? {})
    ]) {
      if (!model || seen.has(model)) continue
      seen.add(model)
      models.push({ name: model, labelOverride: model })
    }
  }
  if (models.length === 0) {
    models.push(
      { name: 'claude-sonnet-4-20250514', labelOverride: 'Sonnet', supports1m: true },
      { name: 'claude-haiku-4-5-20251001', labelOverride: 'Haiku' }
    )
  }
  return models.slice(0, 20)
}

export function snapshotClaudeDesktopFiles(): ClaudeDesktopFileSnapshot[] {
  const paths = getClaudeDesktopPaths()
  if (!paths) return []
  return [
    readOptional(paths.normalConfig),
    readOptional(paths.threepConfig),
    readOptional(paths.profilePath),
    readOptional(paths.metaPath)
  ]
}

export function restoreClaudeDesktopSnapshots(snapshots: ClaudeDesktopFileSnapshot[]): void {
  for (const snap of snapshots) {
    if (!snap.exists || snap.content === null) {
      if (existsSync(snap.path)) {
        try {
          rmSync(snap.path)
        } catch {
          // ignore
        }
      }
      continue
    }
    writeAtomic(snap.path, snap.content)
  }
}

export function applyClaudeDesktopTakeover(
  host: string,
  port: number,
  gatewayToken: string
): ClaudeDesktopFileSnapshot[] {
  const paths = getClaudeDesktopPaths()
  if (!paths) {
    throw new Error('Claude Desktop takeover is only supported on macOS and Windows')
  }

  const snapshots = snapshotClaudeDesktopFiles()

  try {
    for (const configPath of [paths.normalConfig, paths.threepConfig]) {
      const current = parseJson(readOptional(configPath).content)
      current.deploymentMode = '3p'
      writeAtomic(configPath, JSON.stringify(current, null, 2) + '\n')
    }

    mkdirSync(paths.configLibraryDir, { recursive: true })

    const profile = {
      inferenceProvider: 'gateway',
      inferenceGatewayBaseUrl: buildClaudeDesktopGatewayUrl(host, port),
      inferenceGatewayApiKey: gatewayToken,
      inferenceGatewayAuthScheme: 'bearer',
      disableDeploymentModeChooser: true,
      coworkEgressAllowedHosts: ['*'],
      inferenceModels: buildInferenceModels()
    }
    writeAtomic(paths.profilePath, JSON.stringify(profile, null, 2) + '\n')

    const meta = parseJson(readOptional(paths.metaPath).content)
    meta.appliedProfileId = CLAUDE_DESKTOP_PROFILE_ID
    meta.updatedAt = new Date().toISOString()
    writeAtomic(paths.metaPath, JSON.stringify(meta, null, 2) + '\n')
  } catch (e) {
    restoreClaudeDesktopSnapshots(snapshots)
    throw e
  }

  return snapshots
}

export function isClaudeDesktopTakeoverActive(host: string, port: number): boolean {
  const paths = getClaudeDesktopPaths()
  if (!paths || !existsSync(paths.profilePath)) return false
  try {
    const profile = parseJson(readFileSync(paths.profilePath, 'utf8'))
    return (
      profile.inferenceProvider === 'gateway' &&
      profile.inferenceGatewayBaseUrl === buildClaudeDesktopGatewayUrl(host, port)
    )
  } catch {
    return false
  }
}
