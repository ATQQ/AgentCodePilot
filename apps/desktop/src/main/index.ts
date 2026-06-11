import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS } from '../preload/types'
import type {
  AgentEvent,
  AgentInfo,
  ConversationInfo,
  ConversationListItem,
  CreateConversationPayload,
  ConversationUpdatePayload,
  MessageInfo,
  ProjectPayload,
  SendMessagePayload,
  SettingsInfo,
  SettingsPayload
} from '../preload/types'
import { MockAgentAdapter } from './runtime/mock-agent'
import { ClaudeAgentAdapter } from './runtime/claude-agent'
import { getDatabase, closeDatabase } from './database'
import * as repo from './database/repositories'

const mockAgents: AgentInfo[] = [
  { id: 'claude-code', name: 'Claude Code', enabled: true },
  { id: 'codex', name: 'Codex', enabled: true },
  { id: 'gemini-cli', name: 'Gemini CLI', enabled: true },
  { id: 'cursor', name: 'Cursor', enabled: false }
]

const mockAgent = new MockAgentAdapter()
const claudeAgent = new ClaudeAgentAdapter()
let mainWindow: BrowserWindow | null = null

const streamingMessages = new Map<string, { conversationId: string; content: string }>()

function emitAgentEvent(event: AgentEvent): void {
  mainWindow?.webContents.send(IPC_CHANNELS.AGENT_EVENT, event)

  if (event.type === 'message.started') {
    streamingMessages.set(event.messageId, { conversationId: event.conversationId, content: '' })
  } else if (event.type === 'message.delta') {
    const entry = streamingMessages.get(event.messageId)
    if (entry) entry.content += event.delta
  } else if (event.type === 'message.completed') {
    const entry = streamingMessages.get(event.messageId)
    if (entry) {
      repo.addMessage({
        id: event.messageId,
        conversationId: entry.conversationId,
        role: 'assistant',
        content: entry.content,
        createdAt: new Date().toISOString()
      })
      streamingMessages.delete(event.messageId)
    }
  } else if (event.type === 'message.error') {
    for (const [msgId, entry] of streamingMessages) {
      if (entry.conversationId === event.conversationId) {
        streamingMessages.delete(msgId)
        break
      }
    }
  }
}

function getSettingsFromDb(): SettingsInfo {
  const all = repo.getAllSettings()
  return {
    theme: (all['theme'] as SettingsInfo['theme']) || 'light',
    approvalLevel: (all['approvalLevel'] as SettingsInfo['approvalLevel']) || 'request',
    language: all['language'] || 'zh-CN'
  }
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
      const now = new Date().toISOString()

      let cwd: string | null = null
      if (!payload.projectId) {
        const slug = id.replace(/[^a-z0-9-]/gi, '-')
        const baseDir = join(app.getPath('documents'), 'agent-desktop-app')
        cwd = join(baseDir, slug)
        mkdirSync(cwd, { recursive: true })
      }

      repo.createConversation({
        id,
        title,
        agentId: payload.agentId,
        projectId: payload.projectId ?? null,
        cwd,
        createdAt: now,
        updatedAt: now
      })

      const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      repo.addMessage({
        id: userMsgId,
        conversationId: id,
        role: 'user',
        content: payload.firstMessage,
        createdAt: now
      })

      return { id, title, cwd }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_FIRST, (_e, payload: SendMessagePayload): void => {
    const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-a`
    const runInput = {
      conversationId: payload.conversationId,
      messageId: assistantMsgId,
      content: payload.content,
      agentId: payload.agentId,
      cwd: payload.cwd
    }

    if (payload.agentId === 'claude-code') {
      claudeAgent.run(runInput, emitAgentEvent)
    } else {
      mockAgent.run(runInput, emitAgentEvent)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, (_e, payload: SendMessagePayload): void => {
    const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-a`
    const now = new Date().toISOString()

    repo.addMessage({
      id: userMsgId,
      conversationId: payload.conversationId,
      role: 'user',
      content: payload.content,
      createdAt: now
    })

    const runInput = {
      conversationId: payload.conversationId,
      messageId: assistantMsgId,
      content: payload.content,
      agentId: payload.agentId,
      cwd: payload.cwd
    }

    if (payload.agentId === 'claude-code') {
      claudeAgent.run(runInput, emitAgentEvent)
    } else {
      mockAgent.run(runInput, emitAgentEvent)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_STOP, (_e, conversationId: string): void => {
    claudeAgent.stop(conversationId)
    mockAgent.stop(conversationId)
  })

  // --- Conversations ---

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATIONS_LIST,
    (_e, projectId?: string | null): ConversationListItem[] => {
      const rows = projectId
        ? repo.getConversationsByProject(projectId)
        : repo.getAllConversations()

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        agentId: r.agent_id,
        projectId: r.project_id,
        cwd: r.cwd ?? null,
        pinned: r.pinned === 1,
        archived: r.archived === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATIONS_GET_MESSAGES,
    (_e, conversationId: string): MessageInfo[] => {
      const rows = repo.getMessagesByConversation(conversationId)
      return rows.map((r) => ({
        id: r.id,
        role: r.role as 'user' | 'assistant',
        content: r.content,
        createdAt: r.created_at
      }))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATIONS_UPDATE,
    (_e, payload: ConversationUpdatePayload): void => {
      repo.updateConversation(payload.id, {
        title: payload.title,
        pinned: payload.pinned,
        archived: payload.archived
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE, (_e, conversationId: string): void => {
    repo.deleteConversation(conversationId)
  })

  // --- Projects ---

  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, (): ProjectPayload[] => {
    return repo.getAllProjects()
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_SAVE, (_e, payload: ProjectPayload): void => {
    repo.saveProject(payload)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_DELETE, (_e, id: string): void => {
    repo.deleteProject(id)
  })

  // --- Settings ---

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsInfo => {
    return getSettingsFromDb()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_e, payload: SettingsPayload): void => {
    if (payload.theme) repo.setSetting('theme', payload.theme)
    if (payload.approvalLevel) repo.setSetting('approvalLevel', payload.approvalLevel)
    if (payload.language) repo.setSetting('language', payload.language)
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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

  // Initialize database
  getDatabase()

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

app.on('will-quit', () => {
  closeDatabase()
})
