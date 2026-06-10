import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS } from '../preload/types'
import type {
  AgentEvent,
  AgentInfo,
  ConversationInfo,
  CreateConversationPayload,
  SendMessagePayload,
  SettingsInfo,
  SettingsPayload
} from '../preload/types'
import { MockAgentAdapter } from './runtime/mock-agent'

const mockAgents: AgentInfo[] = [
  { id: 'claude-code', name: 'Claude Code', enabled: true },
  { id: 'codex', name: 'Codex', enabled: true },
  { id: 'gemini-cli', name: 'Gemini CLI', enabled: true },
  { id: 'cursor', name: 'Cursor', enabled: false }
]

const mockSettings: SettingsInfo = {
  theme: 'light',
  approvalLevel: 'request',
  language: 'zh-CN'
}

const mockAgent = new MockAgentAdapter()
let mainWindow: BrowserWindow | null = null

function emitAgentEvent(event: AgentEvent): void {
  mainWindow?.webContents.send(IPC_CHANNELS.AGENT_EVENT, event)
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENTS_LIST, (): AgentInfo[] => {
    return mockAgents
  })

  ipcMain.handle(
    IPC_CHANNELS.CHAT_CREATE,
    (_e, payload: CreateConversationPayload): ConversationInfo => {
      const id = `conv-${Date.now()}`
      const title =
        payload.firstMessage.slice(0, 30) + (payload.firstMessage.length > 30 ? '...' : '')
      return { id, title }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, (_e, payload: SendMessagePayload): void => {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    mockAgent.run(
      {
        conversationId: payload.conversationId,
        messageId,
        content: payload.content,
        agentId: payload.agentId
      },
      emitAgentEvent
    )
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_STOP, (_e, conversationId: string): void => {
    mockAgent.stop(conversationId)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsInfo => {
    return { ...mockSettings }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_e, payload: SettingsPayload): void => {
    if (payload.theme) mockSettings.theme = payload.theme
    if (payload.approvalLevel) mockSettings.approvalLevel = payload.approvalLevel
    if (payload.language) mockSettings.language = payload.language
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AgentCodePilot',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.agentcodepilot.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
