import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS } from '../preload/types'
import type {
  AgentEvent,
  AgentInfo,
  AttachmentPayload,
  ConversationInfo,
  ConversationListItem,
  CreateConversationPayload,
  ConversationUpdatePayload,
  GatewayStatus,
  MessageInfo,
  ProjectPayload,
  ProviderConfigPayload,
  WorkspacePayload,
  SendMessagePayload,
  SettingsInfo,
  SettingsPayload
} from '../preload/types'
import { agentRegistry, initializeAgentRegistry } from './runtime'
import { startGateway, stopGateway, getGatewayConfig, isGatewayRunning } from './gateway'
import { getDatabase, closeDatabase } from './database'
import * as repo from './database/repositories'

let mainWindow: BrowserWindow | null = null

const streamingMessages = new Map<string, { conversationId: string; content: string; rawInput: string }>()

function buildPromptWithAttachments(content: string, attachments?: AttachmentPayload[]): string {
  if (!attachments || attachments.length === 0) return content
  const parts: string[] = []
  for (const att of attachments) {
    if (att.type === 'url') {
      parts.push(`[参考链接: ${att.url}]`)
    } else {
      parts.push(`[附件: ${att.path}]`)
    }
  }
  return parts.join('\n') + '\n\n' + content
}

function emitAgentEvent(event: AgentEvent): void {
  if (event.type === 'message.started') {
    if (!streamingMessages.has(event.messageId)) {
      streamingMessages.set(event.messageId, { conversationId: event.conversationId, content: '', rawInput: '' })
    }
  } else if (event.type === 'message.delta') {
    const entry = streamingMessages.get(event.messageId)
    if (entry) entry.content += event.delta
  } else if (event.type === 'message.completed') {
    const entry = streamingMessages.get(event.messageId)
    if (entry) {
      try {
        repo.addMessage({
          id: event.messageId,
          conversationId: entry.conversationId,
          role: 'assistant',
          content: entry.content,
          createdAt: new Date().toISOString(),
          inputTokens: event.usage?.inputTokens ?? null,
          outputTokens: event.usage?.outputTokens ?? null,
          cacheReadTokens: event.usage?.cacheReadTokens ?? null,
          cacheCreationTokens: event.usage?.cacheCreationTokens ?? null,
          costUSD: event.usage?.costUSD ?? null,
          rawInput: entry.rawInput || null,
          debugInput: event.debugInput || null,
          debugOutput: event.debugOutput || null
        })
      } catch (e) {
        console.error('[emitAgentEvent] Failed to save message to db:', e)
      }
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

  mainWindow?.webContents.send(IPC_CHANNELS.AGENT_EVENT, event)
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
    return agentRegistry.list().map((a) => ({
      id: a.id,
      name: a.name,
      enabled: a.enabled
    }))
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
        createdAt: now,
        attachments: payload.attachments ? JSON.stringify(payload.attachments) : null
      })

      return { id, title, cwd }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_FIRST, (_e, payload: SendMessagePayload): void => {
    const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-a`
    const prompt = buildPromptWithAttachments(payload.content, payload.attachments)
    streamingMessages.set(assistantMsgId, {
      conversationId: payload.conversationId,
      content: '',
      rawInput: prompt
    })
    const runInput = {
      conversationId: payload.conversationId,
      messageId: assistantMsgId,
      content: prompt,
      agentId: payload.agentId,
      cwd: payload.cwd,
      workspaceFolders: payload.workspaceFolders
    }

    const adapter = agentRegistry.get(payload.agentId)
    if (adapter) {
      adapter.run(runInput, emitAgentEvent)
    } else {
      emitAgentEvent({
        type: 'message.error',
        conversationId: payload.conversationId,
        error: `Agent "${payload.agentId}" not found or not configured`
      })
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
      createdAt: now,
      attachments: payload.attachments ? JSON.stringify(payload.attachments) : null
    })

    const prompt = buildPromptWithAttachments(payload.content, payload.attachments)
    streamingMessages.set(assistantMsgId, {
      conversationId: payload.conversationId,
      content: '',
      rawInput: prompt
    })
    const runInput = {
      conversationId: payload.conversationId,
      messageId: assistantMsgId,
      content: prompt,
      agentId: payload.agentId,
      cwd: payload.cwd,
      workspaceFolders: payload.workspaceFolders
    }

    const adapter = agentRegistry.get(payload.agentId)
    if (adapter) {
      adapter.run(runInput, emitAgentEvent)
    } else {
      emitAgentEvent({
        type: 'message.error',
        conversationId: payload.conversationId,
        error: `Agent "${payload.agentId}" not found or not configured`
      })
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_STOP, (_e, conversationId: string): void => {
    agentRegistry.stopAll(conversationId)
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
      return rows.map((r) => {
        const msg: MessageInfo = {
          id: r.id,
          role: r.role as 'user' | 'assistant',
          content: r.content,
          createdAt: r.created_at
        }
        if (r.attachments) {
          try { msg.attachments = JSON.parse(r.attachments) } catch {}
        }
        if (r.input_tokens != null && r.output_tokens != null) {
          msg.usage = {
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            cacheReadTokens: r.cache_read_tokens ?? 0,
            cacheCreationTokens: r.cache_creation_tokens ?? 0,
            costUSD: r.cost_usd ?? 0
          }
        }
        if (r.debug_input) {
          msg.debugInput = r.debug_input
        }
        if (r.debug_output) {
          msg.debugOutput = r.debug_output
        }
        return msg
      })
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

  // --- Workspaces ---

  ipcMain.handle(IPC_CHANNELS.WORKSPACES_LIST, (): WorkspacePayload[] => {
    return repo.getAllWorkspaces().map((w) => ({
      id: w.id,
      name: w.name,
      folders: JSON.parse(w.folders) as string[]
    }))
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACES_SAVE, (_e, payload: WorkspacePayload): void => {
    repo.saveWorkspace(payload)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACES_DELETE, (_e, id: string): void => {
    repo.deleteWorkspace(id)
  })

  // --- Providers ---

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_LIST, (): ProviderConfigPayload[] => {
    return repo.getAllProviderConfigs().map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      config: JSON.parse(p.config) as Record<string, unknown>
    }))
  })

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_SAVE, (_e, payload: ProviderConfigPayload): void => {
    repo.saveProviderConfig({
      id: payload.id,
      name: payload.name,
      type: payload.type,
      config: JSON.stringify(payload.config)
    })
  })

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_DELETE, (_e, id: string): void => {
    repo.deleteProviderConfig(id)
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

  // --- Gateway ---

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STATUS, (): GatewayStatus => {
    const cfg = getGatewayConfig()
    return { running: isGatewayRunning(), host: cfg.host, port: cfg.port, token: cfg.token }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_START, (): GatewayStatus => {
    const result = startGateway()
    const cfg = getGatewayConfig()
    return { running: true, host: cfg.host, port: cfg.port, token: result.token }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STOP, (): void => {
    stopGateway()
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FILES, async (): Promise<string[] | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_TEMP_IMAGE,
    (_e, data: ArrayBuffer, filename: string): string => {
      const tempDir = join(app.getPath('temp'), 'agent-desktop-app')
      mkdirSync(tempDir, { recursive: true })
      const uniqueName = `${Date.now()}-${filename}`
      const filePath = join(tempDir, uniqueName)
      writeFileSync(filePath, Buffer.from(data))
      return filePath
    }
  )
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

  getDatabase()
  initializeAgentRegistry()

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
  stopGateway()
  closeDatabase()
})
