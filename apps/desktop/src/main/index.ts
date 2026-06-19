import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS } from '../preload/types'
import type {
  AgentEvent,
  AgentConfigSettings,
  AgentInfo,
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
  SendMessageResult,
  SettingsInfo,
  SettingsPayload,
  OpenPathPayload,
  OpenPathResult
} from '../preload/types'
import { agentRegistry, initializeAgentRegistry } from './runtime'
import { supervisedRun, supervisedStop } from './runtime/supervisor'
import { cloneForIpc } from '../shared/ipc-clone'
import { parseMaxAgentTurnsSetting, clampMaxAgentTurns } from '../shared/agent-run-settings'
import {
  getAgentConfig,
  getModelCatalog,
  saveAgentConfig
} from './runtime/claude-model-catalog'
import { respondToApproval, cancelApprovalsForConversation } from './runtime/approval-manager'
import type { ApprovalRespondPayload } from '../preload/types'
import { startGateway, stopGateway, getGatewayConfig, isGatewayRunning } from './gateway'
import { logInfo, logError, cleanOldLogs } from './logger'
import { getDatabase, closeDatabase } from './database'
import * as repo from './database/repositories'
import { persistAttachments, deleteConversationAttachments } from './file/attachments'
import {
  collectAttachmentDirectories,
  formatMessageContentWithAttachments
} from './file/prompt-attachments'
import { buildAgentPrompt } from './file/plan-prompt'
import { savePlanFromAssistantMessage } from './file/plan-service'
import { readPlanFile } from './file/plans'
import type { PlanDetail, PlanInfo, PlansListPayload } from '../preload/types'
import { registerLocalFileProtocol, registerLocalFileScheme } from './file/local-file-protocol'
import {
  getGitStatus,
  getChangedFiles,
  getGitDiff,
  stageFiles,
  unstageFiles,
  discardFileChanges,
  commitChanges,
  pushChanges,
  getStagedDiff,
  getRecentLog
} from './git/git-service'
import { runUtilityAgent } from './runtime/utility-agent'
import {
  parseFilePreviewSetting,
  parseAiPromptsSetting,
  parseExternalAppsSetting
} from './settings/defaults'
import { openPathWithApp } from './shell/open-external-app'
import type { GitDiffScope } from '../preload/types'
import {
  listDirectory,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
  copyWorkspaceFile
} from './file/workspace-file-service'
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  listTerminals,
  cleanupScopeTerminals,
  setTerminalWindow
} from './terminal/pty-manager'

registerLocalFileScheme()

let mainWindow: BrowserWindow | null = null

const streamingMessages = new Map<
  string,
  { conversationId: string; content: string; rawInput: string; agentId?: string }
>()

function resolveConversationCwd(conversationId: string, payloadCwd?: string): string {
  const conv = repo.getConversationById(conversationId)
  if (conv?.cwd) return conv.cwd

  if (conv?.project_id) {
    const projectCwd = repo.resolveCwdForProjectId(conv.project_id)
    if (projectCwd) {
      repo.setConversationCwd(conversationId, projectCwd)
      return projectCwd
    }
  }

  if (payloadCwd) return payloadCwd
  return app.getPath('home')
}

function resolveConversationWorkspaceFolders(
  conversationId: string,
  payloadFolders?: string[]
): string[] | undefined {
  if (payloadFolders && payloadFolders.length > 1) return payloadFolders

  const conv = repo.getConversationById(conversationId)
  if (!conv?.project_id) return undefined

  return repo.resolveWorkspaceFoldersForProjectId(conv.project_id)
}

function getConversationRunContext(conversationId: string): {
  agentSessionId: string | null
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
} {
  const conv = repo.getConversationById(conversationId)
  const messages = repo.getMessagesByConversation(conversationId)

  return {
    agentSessionId: conv?.agent_session_id ?? null,
    conversationHistory: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content:
        m.role === 'user'
          ? formatMessageContentWithAttachments(m.content, m.attachments)
          : m.content
    }))
  }
}

function mapPlanRow(r: repo.PlanRow): PlanInfo {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    ownerType: r.owner_type as PlanInfo['ownerType'],
    ownerId: r.owner_id,
    userMessageId: r.user_message_id,
    assistantMessageId: r.assistant_message_id,
    title: r.title,
    createdAt: r.created_at
  }
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
          agentId: entry.agentId ?? null,
          inputTokens: event.usage?.inputTokens ?? null,
          outputTokens: event.usage?.outputTokens ?? null,
          cacheReadTokens: event.usage?.cacheReadTokens ?? null,
          cacheCreationTokens: event.usage?.cacheCreationTokens ?? null,
          costUSD: event.usage?.costUSD ?? null,
          rawInput: entry.rawInput || null,
          debugInput: event.debugInput || null,
          debugOutput: event.debugOutput || null
        })
        savePlanFromAssistantMessage(entry.conversationId, event.messageId, entry.content)
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
  } else if (event.type === 'session.updated') {
    repo.setConversationSessionId(event.conversationId, event.sessionId)
  } else if (event.type === 'session.cleared') {
    repo.setConversationSessionId(event.conversationId, null)
  }

  mainWindow?.webContents.send(IPC_CHANNELS.AGENT_EVENT, cloneForIpc(event))
}

function getMaxAgentTurns(): number {
  return parseMaxAgentTurnsSetting(repo.getAllSettings()['maxAgentTurns'])
}

function getSettingsFromDb(): SettingsInfo {
  const all = repo.getAllSettings()
  return {
    theme: (all['theme'] as SettingsInfo['theme']) || 'light',
    approvalLevel: (all['approvalLevel'] as SettingsInfo['approvalLevel']) || 'auto',
    language: all['language'] || 'zh-CN',
    replyLanguage: (all['replyLanguage'] as SettingsInfo['replyLanguage']) || 'auto',
    permissionNotificationsEnabled: all['permissionNotificationsEnabled'] !== 'false',
    rememberPanelStatePerConversation: all['rememberPanelStatePerConversation'] !== 'false',
    filePreview: parseFilePreviewSetting(all['filePreview']),
    aiPrompts: parseAiPromptsSetting(all['aiPrompts']),
    externalApps: parseExternalAppsSetting(all['externalApps']),
    maxAgentTurns: parseMaxAgentTurnsSetting(all['maxAgentTurns'])
  }
}

function getRunApprovalLevel(conversationId: string): 'request' | 'auto' | 'full' {
  return repo.getConversationApprovalLevel(conversationId)
}

function mapConversationRow(r: repo.ConversationRow): ConversationListItem {
  return {
    id: r.id,
    title: r.title,
    agentId: r.agent_id,
    modelId: r.model_id ?? null,
    projectId: r.project_id,
    cwd: r.cwd ?? null,
    pinned: r.pinned === 1,
    archived: r.archived === 1,
    approvalLevel: (r.approval_level === 'request' || r.approval_level === 'auto' || r.approval_level === 'full'
      ? r.approval_level
      : 'auto') as 'request' | 'auto' | 'full',
    createdAt: r.created_at,
    updatedAt: r.updated_at
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
    IPC_CHANNELS.AGENTS_MODELS_LIST,
    (_e, agentId: string, forceRefresh?: boolean) => getModelCatalog(agentId, forceRefresh ?? false)
  )

  ipcMain.handle(IPC_CHANNELS.AGENTS_CONFIG_GET, (_e, agentId: string) => getAgentConfig(agentId))

  ipcMain.handle(
    IPC_CHANNELS.AGENTS_CONFIG_UPDATE,
    (_e, agentId: string, config: AgentConfigSettings) => {
      saveAgentConfig(agentId, config)
      return getModelCatalog(agentId, false)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_CREATE,
    (_e, payload: CreateConversationPayload): ConversationInfo => {
      const id = `conv-${Date.now()}`
      const titleSource =
        payload.firstMessage.trim() ||
        payload.planRefs?.[0]?.title ||
        '新对话'
      const title =
        titleSource.slice(0, 30) + (titleSource.length > 30 ? '...' : '')
      const now = new Date().toISOString()

      let cwd: string | null = null
      if (payload.projectId) {
        cwd = repo.resolveCwdForProjectId(payload.projectId)
      } else {
        const slug = id.replace(/[^a-z0-9-]/gi, '-')
        const baseDir = join(app.getPath('documents'), 'agent-desktop-app')
        cwd = join(baseDir, slug)
        mkdirSync(cwd, { recursive: true })
      }

      repo.createConversation({
        id,
        title,
        agentId: payload.agentId,
        modelId: payload.modelId ?? null,
        projectId: payload.projectId ?? null,
        cwd,
        approvalLevel: 'auto',
        createdAt: now,
        updatedAt: now
      })

      const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const persistedAttachments = persistAttachments(id, userMsgId, payload.attachments)
      repo.addMessage({
        id: userMsgId,
        conversationId: id,
        role: 'user',
        content: payload.firstMessage,
        createdAt: now,
        attachments: persistedAttachments ? JSON.stringify(persistedAttachments) : null,
        planMode: payload.planMode ?? false,
        planRefs: payload.planRefs?.length ? JSON.stringify(payload.planRefs) : null
      })

      return { id, title, cwd, attachments: persistedAttachments }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_FIRST, (_e, payload: SendMessagePayload): void => {
    const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-a`
    const prompt = buildAgentPrompt({
      content: payload.content,
      attachments: payload.attachments,
      planRefs: payload.planRefs,
      planMode: payload.planMode,
      conversationId: payload.conversationId
    })
    streamingMessages.set(assistantMsgId, {
      conversationId: payload.conversationId,
      content: '',
      rawInput: prompt,
      agentId: payload.agentId
    })
    const runContext = getConversationRunContext(payload.conversationId)
    const approvalLevel = getRunApprovalLevel(payload.conversationId)
    const runInput = {
      conversationId: payload.conversationId,
      messageId: assistantMsgId,
      content: prompt,
      agentId: payload.agentId,
      model: payload.modelId,
      cwd: resolveConversationCwd(payload.conversationId, payload.cwd),
      workspaceFolders: resolveConversationWorkspaceFolders(
        payload.conversationId,
        payload.workspaceFolders
      ),
      agentSessionId: runContext.agentSessionId,
      conversationHistory: runContext.conversationHistory,
      attachmentDirectories: collectAttachmentDirectories(payload.attachments),
      approvalLevel,
      planMode: payload.planMode ?? false,
      maxTurns: getMaxAgentTurns()
    }

    supervisedRun(runInput, emitAgentEvent)
  })

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    (_e, payload: SendMessagePayload): SendMessageResult => {
    const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-a`
    const now = new Date().toISOString()
    const persistedAttachments = persistAttachments(
      payload.conversationId,
      userMsgId,
      payload.attachments
    )

    repo.addMessage({
      id: userMsgId,
      conversationId: payload.conversationId,
      role: 'user',
      content: payload.content,
      createdAt: now,
      attachments: persistedAttachments ? JSON.stringify(persistedAttachments) : null,
      planMode: payload.planMode ?? false,
      planRefs: payload.planRefs?.length ? JSON.stringify(payload.planRefs) : null
    })

    const prompt = buildAgentPrompt({
      content: payload.content,
      attachments: persistedAttachments ?? payload.attachments,
      planRefs: payload.planRefs,
      planMode: payload.planMode,
      conversationId: payload.conversationId
    })
    streamingMessages.set(assistantMsgId, {
      conversationId: payload.conversationId,
      content: '',
      rawInput: prompt,
      agentId: payload.agentId
    })
    const runContext = getConversationRunContext(payload.conversationId)
    const approvalLevel = getRunApprovalLevel(payload.conversationId)
    const runInput = {
      conversationId: payload.conversationId,
      messageId: assistantMsgId,
      content: prompt,
      agentId: payload.agentId,
      model: payload.modelId,
      cwd: resolveConversationCwd(payload.conversationId, payload.cwd),
      workspaceFolders: resolveConversationWorkspaceFolders(
        payload.conversationId,
        payload.workspaceFolders
      ),
      agentSessionId: runContext.agentSessionId,
      conversationHistory: runContext.conversationHistory,
      attachmentDirectories: collectAttachmentDirectories(
        persistedAttachments ?? payload.attachments
      ),
      approvalLevel,
      planMode: payload.planMode ?? false,
      maxTurns: getMaxAgentTurns()
    }

    supervisedRun(runInput, emitAgentEvent)
    return cloneForIpc({
      assistantMessageId: assistantMsgId,
      attachments: persistedAttachments
    })
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_STOP, (_e, conversationId: string): void => {
    cancelApprovalsForConversation(conversationId)
    supervisedStop(conversationId)
  })

  ipcMain.handle(
    IPC_CHANNELS.APPROVAL_RESPOND,
    (_e, payload: ApprovalRespondPayload): boolean => {
      const result = respondToApproval(
        payload.requestId,
        payload.allowed,
        payload.scope ?? 'once'
      )
      if (!result.resolved || !result.conversationId) return false

      emitAgentEvent({
        type: 'approval.resolved',
        requestId: payload.requestId,
        conversationId: result.conversationId,
        allowed: payload.allowed,
        scope: payload.scope
      })
      return true
    }
  )

  // --- Conversations ---

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATIONS_LIST,
    (_e, projectId?: string | null): ConversationListItem[] => {
      const rows = projectId
        ? repo.getConversationsByProject(projectId)
        : repo.getAllConversations()

      return rows.map(mapConversationRow)
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST_ARCHIVED, (): ConversationListItem[] => {
    return repo.getArchivedConversations().map(mapConversationRow)
  })

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
        if (r.plan_mode === 1) {
          msg.planMode = true
        }
        if (r.plan_refs) {
          try {
            msg.planRefs = JSON.parse(r.plan_refs)
          } catch {
            /* ignore */
          }
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
        if (r.agent_id) {
          msg.agentId = r.agent_id
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
        archived: payload.archived,
        approvalLevel: payload.approvalLevel,
        modelId: payload.modelId
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE, (_e, conversationId: string): void => {
    deleteConversationAttachments(conversationId)
    cleanupScopeTerminals(`conv:${conversationId}`)
    repo.deleteConversation(conversationId)
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE_ALL_ARCHIVED, (): void => {
    const archived = repo.getArchivedConversations()
    for (const conv of archived) {
      deleteConversationAttachments(conv.id)
      cleanupScopeTerminals(`conv:${conv.id}`)
    }
    repo.deleteAllArchivedConversations()
  })

  // --- Projects ---

  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, (): ProjectPayload[] => {
    return repo.getAllProjects()
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_SAVE, (_e, payload: ProjectPayload): void => {
    repo.saveProject(payload)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_DELETE, (_e, id: string): void => {
    cleanupScopeTerminals(`shared:${id}`)
    repo.deleteProject(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECTS_RESTORE_BY_PATH, (_e, path: string): ProjectPayload | null => {
    const restored = repo.restoreProjectByPath(path)
    if (!restored) return null
    return { id: restored.id, name: restored.name, path: restored.path }
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
    cleanupScopeTerminals(`shared:${id}`)
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
    if (payload.replyLanguage) repo.setSetting('replyLanguage', payload.replyLanguage)
    if (payload.rememberPanelStatePerConversation !== undefined) {
      repo.setSetting(
        'rememberPanelStatePerConversation',
        payload.rememberPanelStatePerConversation ? 'true' : 'false'
      )
    }
    if (payload.permissionNotificationsEnabled !== undefined) {
      repo.setSetting('permissionNotificationsEnabled', payload.permissionNotificationsEnabled ? 'true' : 'false')
    }
    if (payload.filePreview) {
      repo.setSetting('filePreview', JSON.stringify(payload.filePreview))
    }
    if (payload.aiPrompts) {
      repo.setSetting('aiPrompts', JSON.stringify(payload.aiPrompts))
    }
    if (payload.externalApps) {
      repo.setSetting('externalApps', JSON.stringify(payload.externalApps))
    }
    if (payload.maxAgentTurns !== undefined) {
      repo.setSetting('maxAgentTurns', String(clampMaxAgentTurns(payload.maxAgentTurns)))
    }
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_e, payload: OpenPathPayload): Promise<OpenPathResult> => {
    return openPathWithApp({
      path: payload.path,
      kind: payload.kind,
      protocol: payload.protocol,
      appName: payload.appName
    })
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
      properties: ['openFile', 'multiSelections']
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

  ipcMain.handle(
    IPC_CHANNELS.FILE_OPEN_ATTACHMENT,
    (_e, filePath: string, type: 'image' | 'file'): boolean => {
      if (!existsSync(filePath)) return false
      if (type === 'image') {
        void shell.openPath(filePath)
      } else {
        shell.showItemInFolder(filePath)
      }
      return true
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_GET_IMAGE_DATA_URL,
    (_e, filePath: string): string | null => {
      if (!existsSync(filePath)) return null
      const image = nativeImage.createFromPath(filePath)
      if (image.isEmpty()) return null
      return image.toDataURL()
    }
  )

  // --- Git ---

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, (_e, cwd: string) => getGitStatus(cwd))

  ipcMain.handle(IPC_CHANNELS.GIT_CHANGED_FILES, (_e, cwd: string, scope: GitDiffScope) =>
    getChangedFiles(cwd, scope)
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    (_e, cwd: string, file: string, staged?: boolean) =>
      getGitDiff(cwd, { file, staged: staged ?? false })
  )

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, (_e, cwd: string, paths: string[]) =>
    stageFiles(cwd, paths)
  )

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, (_e, cwd: string, paths: string[]) =>
    unstageFiles(cwd, paths)
  )

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD, (_e, cwd: string, paths: string[]) =>
    discardFileChanges(cwd, paths)
  )

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, (_e, cwd: string, message: string) =>
    commitChanges(cwd, message)
  )

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, (_e, cwd: string) => pushChanges(cwd))

  ipcMain.handle(IPC_CHANNELS.GIT_STAGED_DIFF, (_e, cwd: string) => getStagedDiff(cwd))

  ipcMain.handle(IPC_CHANNELS.GIT_RECENT_LOG, (_e, cwd: string, limit?: number) =>
    getRecentLog(cwd, limit ?? 10)
  )

  ipcMain.handle(IPC_CHANNELS.AGENT_RUN_UTILITY, (_e, payload) => runUtilityAgent(payload))

  // --- Workspace files ---

  ipcMain.handle(IPC_CHANNELS.FILE_LIST, (_e, dirPath: string, roots: string[]) =>
    listDirectory(dirPath, roots)
  )

  ipcMain.handle(IPC_CHANNELS.FILE_READ, (_e, filePath: string, roots: string[]) =>
    readWorkspaceFile(filePath, roots)
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_WRITE,
    (_e, filePath: string, content: string, roots: string[]) =>
      writeWorkspaceFile(filePath, content, roots)
  )

  ipcMain.handle(IPC_CHANNELS.FILE_DELETE, (_e, filePath: string, roots: string[]) =>
    deleteWorkspaceFile(filePath, roots)
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE_COPY,
    (_e, srcPath: string, destPath: string, roots: string[]) =>
      copyWorkspaceFile(srcPath, destPath, roots)
  )

  // --- Terminal ---

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (_e, scopeKey: string, cwd: string, title?: string) =>
    createTerminal(scopeKey, cwd, title)
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, (_e, terminalId: string, data: string) => {
    writeTerminal(terminalId, data)
  })

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESIZE,
    (_e, terminalId: string, cols: number, rows: number) => {
      resizeTerminal(terminalId, cols, rows)
    }
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_KILL, (_e, terminalId: string) => {
    killTerminal(terminalId)
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_LIST, (_e, scopeKey: string) =>
    listTerminals(scopeKey)
  )

  // --- Plans ---

  ipcMain.handle(
    IPC_CHANNELS.PLANS_LIST,
    (_e, payload: PlansListPayload): PlanInfo[] => {
      if (payload.ownerType && payload.ownerId) {
        return repo.listPlansByOwner(payload.ownerType, payload.ownerId).map(mapPlanRow)
      }
      if (payload.conversationId) {
        return repo.listPlansByConversation(payload.conversationId).map(mapPlanRow)
      }
      return []
    }
  )

  ipcMain.handle(IPC_CHANNELS.PLANS_GET, (_e, planId: string): PlanDetail | null => {
    const row = repo.getPlanById(planId)
    if (!row) return null
    try {
      const content = readPlanFile(row.file_path)
      return { meta: mapPlanRow(row), content }
    } catch {
      return null
    }
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
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    setTerminalWindow(mainWindow)
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
    setTerminalWindow(null)
    mainWindow = null
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.agentcodepilot.app')
  registerLocalFileProtocol()

  logInfo('App', `Starting AgentCodePilot v${app.getVersion()}`)
  cleanOldLogs()
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
  logInfo('App', 'Application quit')
})

process.on('uncaughtException', (error) => {
  logError('Process', 'Uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  logError('Process', 'Unhandled rejection', reason)
})
