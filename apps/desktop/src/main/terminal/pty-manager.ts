import * as pty from 'node-pty'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../preload/types'

export interface PtySession {
  id: string
  scopeKey: string
  title: string
  cwd: string
  shell: string
  process: pty.IPty
}

const sessionsByScope = new Map<string, Map<string, PtySession>>()
let windowRef: BrowserWindow | null = null

export function setTerminalWindow(win: BrowserWindow | null): void {
  windowRef = win
}

function emitData(terminalId: string, data: string): void {
  windowRef?.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { terminalId, data })
}

function emitExit(terminalId: string, exitCode: number): void {
  windowRef?.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { terminalId, exitCode })
}

export function createTerminal(
  scopeKey: string,
  cwd: string,
  title?: string
): { id: string; title: string; cwd: string; shell: string } {
  if (!sessionsByScope.has(scopeKey)) {
    sessionsByScope.set(scopeKey, new Map())
  }

  const scopeSessions = sessionsByScope.get(scopeKey)!
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'zsh')
  const tabTitle = title || shell.split('/').pop() || 'terminal'
  const displayTitle = scopeSessions.size > 0 ? `${tabTitle} (${scopeSessions.size + 1})` : tabTitle

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cwd,
    env: process.env as Record<string, string>
  })

  const session: PtySession = {
    id,
    scopeKey,
    title: displayTitle,
    cwd,
    shell: tabTitle,
    process: ptyProcess
  }

  ptyProcess.onData((data) => emitData(id, data))
  ptyProcess.onExit(({ exitCode }) => {
    emitExit(id, exitCode)
    scopeSessions.delete(id)
    if (scopeSessions.size === 0) {
      sessionsByScope.delete(scopeKey)
    }
  })

  scopeSessions.set(id, session)

  return { id, title: displayTitle, cwd, shell: tabTitle }
}

export function writeTerminal(terminalId: string, data: string): void {
  for (const sessions of sessionsByScope.values()) {
    const session = sessions.get(terminalId)
    if (session) {
      session.process.write(data)
      return
    }
  }
}

export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return
  for (const sessions of sessionsByScope.values()) {
    const session = sessions.get(terminalId)
    if (session) {
      try {
        session.process.resize(cols, rows)
      } catch {
        // PTY may not be ready or process already exited (ENOTTY on macOS)
      }
      return
    }
  }
}

export function killTerminal(terminalId: string): void {
  for (const [scopeKey, sessions] of sessionsByScope) {
    const session = sessions.get(terminalId)
    if (session) {
      session.process.kill()
      sessions.delete(terminalId)
      if (sessions.size === 0) {
        sessionsByScope.delete(scopeKey)
      }
      return
    }
  }
}

export function listTerminals(
  scopeKey: string
): { id: string; title: string; cwd: string; shell: string }[] {
  const sessions = sessionsByScope.get(scopeKey)
  if (!sessions) return []
  return [...sessions.values()].map((s) => ({
    id: s.id,
    title: s.title,
    cwd: s.cwd,
    shell: s.shell
  }))
}

export function cleanupScopeTerminals(scopeKey: string): void {
  const sessions = sessionsByScope.get(scopeKey)
  if (!sessions) return
  for (const session of sessions.values()) {
    session.process.kill()
  }
  sessionsByScope.delete(scopeKey)
}
