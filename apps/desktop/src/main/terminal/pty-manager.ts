import * as pty from 'node-pty'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../preload/types'

export interface PtySession {
  id: string
  projectId: string
  title: string
  cwd: string
  shell: string
  process: pty.IPty
}

const sessionsByProject = new Map<string, Map<string, PtySession>>()
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
  projectId: string,
  cwd: string,
  title?: string
): { id: string; title: string; cwd: string; shell: string } {
  if (!sessionsByProject.has(projectId)) {
    sessionsByProject.set(projectId, new Map())
  }

  const projectSessions = sessionsByProject.get(projectId)!
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'zsh')
  const tabTitle = title || shell.split('/').pop() || 'terminal'
  const displayTitle =
    projectSessions.size > 0 ? `${tabTitle} (${projectSessions.size + 1})` : tabTitle

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cwd,
    env: process.env as Record<string, string>
  })

  const session: PtySession = {
    id,
    projectId,
    title: displayTitle,
    cwd,
    shell: tabTitle,
    process: ptyProcess
  }

  ptyProcess.onData((data) => emitData(id, data))
  ptyProcess.onExit(({ exitCode }) => emitExit(id, exitCode))

  projectSessions.set(id, session)

  return { id, title: displayTitle, cwd, shell: tabTitle }
}

export function writeTerminal(terminalId: string, data: string): void {
  for (const sessions of sessionsByProject.values()) {
    const session = sessions.get(terminalId)
    if (session) {
      session.process.write(data)
      return
    }
  }
}

export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
  for (const sessions of sessionsByProject.values()) {
    const session = sessions.get(terminalId)
    if (session) {
      session.process.resize(cols, rows)
      return
    }
  }
}

export function killTerminal(terminalId: string): void {
  for (const [projectId, sessions] of sessionsByProject) {
    const session = sessions.get(terminalId)
    if (session) {
      session.process.kill()
      sessions.delete(terminalId)
      if (sessions.size === 0) {
        sessionsByProject.delete(projectId)
      }
      return
    }
  }
}

export function listTerminals(
  projectId: string
): { id: string; title: string; cwd: string; shell: string }[] {
  const sessions = sessionsByProject.get(projectId)
  if (!sessions) return []
  return [...sessions.values()].map((s) => ({
    id: s.id,
    title: s.title,
    cwd: s.cwd,
    shell: s.shell
  }))
}

export function cleanupProjectTerminals(projectId: string): void {
  const sessions = sessionsByProject.get(projectId)
  if (!sessions) return
  for (const session of sessions.values()) {
    session.process.kill()
  }
  sessionsByProject.delete(projectId)
}
