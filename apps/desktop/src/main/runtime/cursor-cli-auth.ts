import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export function getCursorConfigDir(): string {
  return join(homedir(), '.cursor')
}

/** True when Cursor CLI has a saved login (same profile the local SDK bridge can reuse). */
export function hasLocalCursorCliConfig(): boolean {
  const configPath = join(getCursorConfigDir(), 'cli-config.json')
  if (!existsSync(configPath)) return false

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as {
      authInfo?: { authId?: string; email?: string; userId?: number }
    }
    return Boolean(parsed.authInfo?.authId || parsed.authInfo?.email || parsed.authInfo?.userId)
  } catch {
    return false
  }
}
