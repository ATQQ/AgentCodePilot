import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getShellEnvironment } from '../shell/shell-env'

export function getCodexHomeDir(): string {
  return join(homedir(), '.codex')
}

/** True when the user has a local Codex CLI profile (same files the CLI reads). */
export function hasLocalCodexCliConfig(): boolean {
  const home = getCodexHomeDir()
  return existsSync(join(home, 'config.toml')) || existsSync(join(home, 'auth.json'))
}

/**
 * Prefer the user's PATH `codex` binary so SDK behavior matches their working CLI install.
 * Falls back to the bundled binary inside @openai/codex-sdk when not found.
 */
export function resolveCodexExecutablePath(): string | undefined {
  if (process.platform === 'win32') {
    const pathVar = process.env.Path || process.env.PATH || ''
    for (const dir of pathVar.split(';')) {
      const candidate = join(dir.trim(), 'codex.exe')
      if (candidate && existsSync(candidate)) return candidate
    }
    return undefined
  }

  const shell = process.env.SHELL || '/bin/zsh'
  if (!existsSync(shell)) return undefined

  try {
    const resolved = execFileSync(shell, ['-ilc', 'command -v codex'], {
      encoding: 'utf8',
      timeout: 10000,
      env: getShellEnvironment()
    }).trim()
    if (resolved && existsSync(resolved)) return resolved
  } catch {
    // Fall back to SDK bundled codex.
  }

  return undefined
}
