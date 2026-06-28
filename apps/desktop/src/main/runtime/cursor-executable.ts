import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { getShellEnvironment } from '../shell/shell-env'

/** Cursor SDK agent IDs use the `agent-` prefix; CLI sessions are plain UUIDs. */
export function isSdkSessionId(sessionId: string): boolean {
  return sessionId.startsWith('agent-')
}

export function resolveCliResumeSessionId(
  sessionId: string | null | undefined
): string | undefined {
  if (!sessionId || isSdkSessionId(sessionId)) return undefined
  return sessionId
}

/**
 * Prefer the user's PATH `agent` binary so behavior matches their working CLI install.
 */
export function resolveAgentExecutablePath(): string | undefined {
  if (process.platform === 'win32') {
    const pathVar = process.env.Path || process.env.PATH || ''
    for (const dir of pathVar.split(';')) {
      const candidate = `${dir.trim()}\\agent.exe`
      if (candidate && existsSync(candidate)) return candidate
    }
    return undefined
  }

  const shell = process.env.SHELL || '/bin/zsh'
  if (!existsSync(shell)) return undefined

  try {
    const resolved = execFileSync(shell, ['-ilc', 'command -v agent'], {
      encoding: 'utf8',
      timeout: 10000,
      env: getShellEnvironment()
    }).trim()
    if (resolved && existsSync(resolved)) return resolved
  } catch {
    // Fall back to SDK when CLI is not installed.
  }

  return undefined
}
