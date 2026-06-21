import { execFileSync } from 'child_process'
import { existsSync } from 'fs'

let cachedEnv: Record<string, string> | null = null

function parseEnvOutput(output: string, base: Record<string, string>): Record<string, string> {
  const env = { ...base }
  for (const entry of output.split('\0')) {
    if (!entry) continue
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    env[entry.slice(0, eq)] = entry.slice(eq + 1)
  }
  return env
}

/**
 * Resolve the user's login-shell environment (PATH, HOME, etc.).
 * Packaged Electron apps inherit a minimal PATH; dev mode inherits the launcher terminal.
 */
export function getShellEnvironment(): Record<string, string> {
  if (cachedEnv) return cachedEnv

  const base = { ...process.env } as Record<string, string>
  cachedEnv = base

  if (process.platform === 'win32') return cachedEnv

  const shell = process.env.SHELL || '/bin/zsh'
  if (!existsSync(shell)) return cachedEnv

  try {
    const output = execFileSync(shell, ['-ilc', 'env -0'], {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, TERM: 'dumb' }
    })
    cachedEnv = parseEnvOutput(output, base)
  } catch {
    // Fall back to process.env when login shell probing fails.
  }

  return cachedEnv
}

/** Merge login-shell env into process.env once at startup. */
export function initShellEnvironment(): void {
  const env = getShellEnvironment()
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }
}
