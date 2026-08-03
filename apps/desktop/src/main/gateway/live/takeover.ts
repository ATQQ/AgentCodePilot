import { deleteLiveBackup, getLiveBackup, listLiveBackups, saveLiveBackup } from './backup-store'
import {
  applyClaudeCliTakeover,
  claudeSettingsHasForeignProxy,
  isClaudeTakeoverActive,
  readClaudeSettings,
  restoreClaudeCliSettings
} from './claude-cli'
import {
  applyClaudeDesktopTakeover,
  isClaudeDesktopSupported,
  isClaudeDesktopTakeoverActive,
  restoreClaudeDesktopSnapshots,
  type ClaudeDesktopFileSnapshot
} from './claude-desktop'
import {
  applyCodexTakeover,
  isCodexTakeoverActive,
  restoreCodexConfig,
  type CodexBackup
} from './codex'
import { buildProxyBaseUrl } from './constants'
import { ensureGatewayToken, loadGatewaySettings, updateGatewaySettings } from '../settings-store'
import type { TakeoverApp, TakeoverStatus } from '../types'

export type TakeoverUiApp = 'claudeCli' | 'claudeDesktop' | 'codex'

function uiAppToBackupApp(app: TakeoverUiApp): TakeoverApp {
  if (app === 'claudeCli') return 'claude'
  if (app === 'claudeDesktop') return 'claude-desktop'
  return 'codex'
}

function takeoverFlagKey(app: TakeoverUiApp): 'claudeCli' | 'claudeDesktop' | 'codex' {
  return app
}

let startGatewayFn: (() => Promise<{ token: string; port: number }>) | null = null

/** Avoid circular import: index registers this after load. */
export function registerGatewayStarter(fn: () => Promise<{ token: string; port: number }>): void {
  startGatewayFn = fn
}

async function ensureRunning(): Promise<{ host: string; port: number; token: string }> {
  let settings = ensureGatewayToken(loadGatewaySettings())
  if (!startGatewayFn) {
    throw new Error('Gateway starter not registered')
  }
  const result = await startGatewayFn()
  settings = updateGatewaySettings({
    enabled: true,
    token: result.token || settings.token,
    port: result.port || settings.port
  })
  return { host: settings.host, port: settings.port, token: settings.token }
}

/** Start gateway if needed (for in-app Claude/Codex when settings.enabled). */
export async function ensureGatewayRunning(): Promise<{
  host: string
  port: number
  token: string
}> {
  return ensureRunning()
}

export function getTakeoverStatus(): TakeoverStatus {
  const settings = loadGatewaySettings()
  const backups = listLiveBackups()
  const backedUpAt: Partial<Record<TakeoverApp, string>> = {}
  for (const row of backups) {
    backedUpAt[row.app_type as TakeoverApp] = row.backed_up_at
  }
  return {
    claudeCli: settings.takeover.claudeCli,
    claudeDesktop: settings.takeover.claudeDesktop,
    codex: settings.takeover.codex,
    backedUpAt,
    proxyBaseUrl: buildProxyBaseUrl(settings.host, settings.port),
    claudeDesktopSupported: isClaudeDesktopSupported()
  }
}

export async function enableTakeover(app: TakeoverUiApp): Promise<TakeoverStatus> {
  const backupApp = uiAppToBackupApp(app)
  const { host, port, token } = await ensureRunning()
  const proxyBaseUrl = buildProxyBaseUrl(host, port)
  const existing = getLiveBackup(backupApp)

  if (app === 'claudeCli') {
    const live = readClaudeSettings()
    if (existing && isClaudeTakeoverActive(live, proxyBaseUrl)) {
      updateGatewaySettings({ takeover: { ...loadGatewaySettings().takeover, claudeCli: true } })
      return getTakeoverStatus()
    }
    if (!existing && claudeSettingsHasForeignProxy(live, proxyBaseUrl)) {
      throw new Error(
        'Claude Code settings already point to another local proxy. Disable that proxy first, or restore settings manually.'
      )
    }
    const snapshot = applyClaudeCliTakeover(host, port)
    if (!existing) saveLiveBackup(backupApp, snapshot)
  } else if (app === 'claudeDesktop') {
    if (!isClaudeDesktopSupported()) {
      throw new Error('Claude Desktop takeover is only supported on macOS and Windows')
    }
    if (existing && isClaudeDesktopTakeoverActive(host, port)) {
      updateGatewaySettings({
        takeover: { ...loadGatewaySettings().takeover, claudeDesktop: true }
      })
      return getTakeoverStatus()
    }
    const snapshots = applyClaudeDesktopTakeover(host, port, token)
    if (!existing) saveLiveBackup(backupApp, snapshots)
  } else {
    if (existing && isCodexTakeoverActive(host, port)) {
      updateGatewaySettings({ takeover: { ...loadGatewaySettings().takeover, codex: true } })
      return getTakeoverStatus()
    }
    const backup = applyCodexTakeover(host, port)
    if (!existing) {
      saveLiveBackup(backupApp, backup)
    } else {
      // Older backups only stored config.toml — capture auth.json before placeholder write.
      try {
        const prev = JSON.parse(existing.original_config) as Record<string, unknown>
        if (prev.authJson === undefined) {
          saveLiveBackup(backupApp, {
            configToml: typeof prev.configToml === 'string' ? prev.configToml : backup.configToml,
            configExisted: Boolean(prev.configExisted ?? backup.configExisted),
            authJson: backup.authJson,
            authExisted: backup.authExisted
          })
        }
      } catch {
        saveLiveBackup(backupApp, backup)
      }
    }
  }

  const settings = loadGatewaySettings()
  updateGatewaySettings({
    takeover: { ...settings.takeover, [takeoverFlagKey(app)]: true }
  })
  return getTakeoverStatus()
}

/** Restore live client config from backup without clearing the preference flag. */
function restoreTakeoverConfig(app: TakeoverUiApp): void {
  const backupApp = uiAppToBackupApp(app)
  const row = getLiveBackup(backupApp)
  if (!row) return

  try {
    const parsed = JSON.parse(row.original_config) as unknown
    if (app === 'claudeCli') {
      restoreClaudeCliSettings((parsed as Record<string, unknown>) || {})
    } else if (app === 'claudeDesktop') {
      restoreClaudeDesktopSnapshots((parsed as ClaudeDesktopFileSnapshot[]) || [])
    } else {
      restoreCodexConfig(parsed as CodexBackup)
    }
  } finally {
    deleteLiveBackup(backupApp)
  }
}

export function disableTakeover(app: TakeoverUiApp): TakeoverStatus {
  try {
    restoreTakeoverConfig(app)
  } finally {
    const settings = loadGatewaySettings()
    updateGatewaySettings({
      takeover: { ...settings.takeover, [takeoverFlagKey(app)]: false }
    })
  }

  return getTakeoverStatus()
}

export async function setTakeover(app: TakeoverUiApp, enabled: boolean): Promise<TakeoverStatus> {
  return enabled ? enableTakeover(app) : disableTakeover(app)
}

/**
 * Restore live client configs before stopping gateway / app quit.
 * Preference flags are kept so takeovers can be re-applied on next start.
 */
export function restoreAllTakeovers(): void {
  const settings = loadGatewaySettings()
  const apps: TakeoverUiApp[] = ['claudeCli', 'claudeDesktop', 'codex']
  for (const app of apps) {
    if (!settings.takeover[takeoverFlagKey(app)]) continue
    try {
      restoreTakeoverConfig(app)
    } catch (e) {
      console.error(`[Gateway] failed to restore ${app}:`, e)
    }
  }
}

/** Re-apply takeovers that the user left enabled (after gateway start). */
export async function reapplyPreferredTakeovers(): Promise<void> {
  const settings = loadGatewaySettings()
  const apps: TakeoverUiApp[] = ['claudeCli', 'claudeDesktop', 'codex']
  for (const app of apps) {
    if (!settings.takeover[takeoverFlagKey(app)]) continue
    try {
      await enableTakeover(app)
    } catch (e) {
      console.error(`[Gateway] failed to re-apply ${app}:`, e)
    }
  }
}
