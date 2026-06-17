import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

interface TerminalSession {
  terminalId: string
  wrapper: HTMLDivElement
  term: Terminal
  fitAddon: FitAddon
  removeDataListener: () => void
  resizeObserver: ResizeObserver | null
  host: HTMLElement | null
}

const sessions = new Map<string, TerminalSession>()
let poolEl: HTMLDivElement | null = null

function getPool(): HTMLDivElement {
  if (!poolEl) {
    poolEl = document.createElement('div')
    poolEl.id = 'terminal-session-pool'
    poolEl.style.cssText =
      'position:fixed;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none'
    document.body.appendChild(poolEl)
  }
  return poolEl
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function getXtermTheme(): ITheme {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    background: cssVar('--content-bg') || (isDark ? '#09090b' : '#ffffff'),
    foreground: cssVar('--content-text') || (isDark ? '#f4f4f5' : '#111827'),
    cursor: cssVar('--content-text-secondary') || (isDark ? '#a1a1aa' : '#6b7280'),
    cursorAccent: cssVar('--content-bg') || (isDark ? '#09090b' : '#ffffff'),
    selectionBackground: isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(59, 130, 246, 0.25)',
    selectionForeground: cssVar('--content-text') || (isDark ? '#f4f4f5' : '#111827')
  }
}

function refitSession(session: TerminalSession): void {
  const host = session.host
  if (!host || host.clientWidth < 1 || host.clientHeight < 1) return
  session.fitAddon.fit()
  const { cols, rows } = session.term
  if (cols < 1 || rows < 1) return
  void window.agentAPI.terminal.resize(session.terminalId, cols, rows)
}

function scheduleRefit(session: TerminalSession): void {
  requestAnimationFrame(() => {
    refitSession(session)
    requestAnimationFrame(() => refitSession(session))
  })
}

function setupResizeObserver(session: TerminalSession, host: HTMLElement): void {
  session.resizeObserver?.disconnect()
  session.host = host
  session.resizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 }
    if (width > 0 && height > 0) scheduleRefit(session)
  })
  session.resizeObserver.observe(host)
}

function createSession(terminalId: string): TerminalSession {
  const wrapper = document.createElement('div')
  wrapper.className = 'terminal-view-host'
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.padding = '4px'
  wrapper.style.boxSizing = 'border-box'
  wrapper.style.overflow = 'hidden'
  wrapper.style.background = 'var(--content-bg)'

  const term = new Terminal({
    theme: getXtermTheme(),
    fontFamily: '"Cascadia Code", "Fira Code", Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 1000,
    cursorBlink: true
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(wrapper)

  term.onData((data) => {
    window.agentAPI.terminal.write(terminalId, data)
  })

  const removeDataListener = window.agentAPI.terminal.onData(({ terminalId: id, data }) => {
    if (id === terminalId) term.write(data)
  })

  return {
    terminalId,
    wrapper,
    term,
    fitAddon,
    removeDataListener,
    resizeObserver: null,
    host: null
  }
}

export function attachTerminalSession(terminalId: string, host: HTMLElement): void {
  let session = sessions.get(terminalId)
  if (!session) {
    session = createSession(terminalId)
    sessions.set(terminalId, session)
  }

  host.appendChild(session.wrapper)
  setupResizeObserver(session, host)
  scheduleRefit(session)
}

export function detachTerminalSession(terminalId: string): void {
  const session = sessions.get(terminalId)
  if (!session) return
  session.resizeObserver?.disconnect()
  session.resizeObserver = null
  session.host = null
  getPool().appendChild(session.wrapper)
}

export function refitTerminalSession(terminalId: string): void {
  const session = sessions.get(terminalId)
  if (!session) return
  scheduleRefit(session)
}

export function disposeTerminalSession(terminalId: string): void {
  const session = sessions.get(terminalId)
  if (!session) return
  session.removeDataListener()
  session.resizeObserver?.disconnect()
  session.term.dispose()
  session.wrapper.remove()
  sessions.delete(terminalId)
}

export function applyThemeToAllTerminalSessions(): void {
  const theme = getXtermTheme()
  for (const session of sessions.values()) {
    session.term.options.theme = theme
    session.term.refresh(0, session.term.rows - 1)
  }
}
