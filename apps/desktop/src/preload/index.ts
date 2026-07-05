import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AgentEvent,
  AgentConfigUpdatePayload,
  ApprovalRespondPayload,
  CreateConversationPayload,
  SendMessagePayload,
  SendMessageResult,
  SettingsPayload,
  ConversationUpdatePayload,
  ProjectPayload,
  WorkspacePayload,
  ProviderConfigPayload,
  GitDiffScope,
  TerminalDataEvent,
  TerminalExitEvent,
  PlansListPayload,
  PlanDetail,
  OpenPathPayload
} from './types'
import { IPC_CHANNELS } from './types'
import { cloneForIpc } from '../shared/ipc-clone'

const agentAPI = {
  agents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_LIST),
    listModels: (agentId: string, forceRefresh?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENTS_MODELS_LIST, agentId, forceRefresh),
    getConfig: (agentId: string) => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_CONFIG_GET, agentId),
    updateConfig: (agentId: string, config: AgentConfigUpdatePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENTS_CONFIG_UPDATE, agentId, config)
  },
  chat: {
    createConversation: (payload: CreateConversationPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_CREATE, cloneForIpc(payload)),
    sendMessage: (payload: SendMessagePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CHAT_SEND,
        cloneForIpc(payload)
      ) as Promise<SendMessageResult>,
    sendFirstMessage: (payload: SendMessagePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_FIRST, cloneForIpc(payload)),
    stop: (conversationId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, conversationId),
    onAgentEvent: (callback: (event: AgentEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: AgentEvent): void => callback(data)
      ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, listener)
      }
    }
  },
  approval: {
    respond: (payload: ApprovalRespondPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.APPROVAL_RESPOND, payload),
    onNavigate: (callback: (conversationId: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, conversationId: string): void =>
        callback(conversationId)
      ipcRenderer.on(IPC_CHANNELS.APPROVAL_NAVIGATE, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.APPROVAL_NAVIGATE, listener)
      }
    }
  },
  conversations: {
    list: (projectId?: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST, projectId),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST_ARCHIVED),
    getMessages: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_GET_MESSAGES, conversationId),
    update: (payload: ConversationUpdatePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_UPDATE, payload),
    delete: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_DELETE, conversationId),
    deleteAllArchived: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_DELETE_ALL_ARCHIVED)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    save: (payload: ProjectPayload) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SAVE, payload),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, id),
    restoreByPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_RESTORE_BY_PATH, path)
  },
  workspaces: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACES_LIST),
    save: (payload: WorkspacePayload) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACES_SAVE, payload),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACES_DELETE, id)
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_LIST),
    save: (payload: ProviderConfigPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_SAVE, payload),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_DELETE, id)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (payload: SettingsPayload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, payload)
  },
  gateway: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_STATUS),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_START),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_STOP)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),
    selectFiles: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FILES)
  },
  file: {
    saveTempImage: (data: ArrayBuffer, filename: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_TEMP_IMAGE, data, filename),
    openAttachment: (filePath: string, type: 'image' | 'file') =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_ATTACHMENT, filePath, type),
    getImageDataUrl: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_GET_IMAGE_DATA_URL, filePath) as Promise<string | null>,
    list: (dirPath: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST, dirPath, roots),
    read: (filePath: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath, roots),
    write: (filePath: string, content: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, content, roots),
    delete: (filePath: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, filePath, roots),
    copy: (srcPath: string, destPath: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_COPY, srcPath, destPath, roots),
    mkdir: (dirPath: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_MKDIR, dirPath, roots),
    rename: (oldPath: string, newPath: string, roots: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, oldPath, newPath, roots)
  },
  git: {
    status: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, cwd),
    changedFiles: (cwd: string, scope: GitDiffScope) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CHANGED_FILES, cwd, scope),
    diff: (cwd: string, file: string, staged?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, cwd, file, staged),
    stage: (cwd: string, paths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, cwd, paths),
    unstage: (cwd: string, paths: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, cwd, paths),
    discard: (cwd: string, paths: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD, cwd, paths),
    commit: (cwd: string, message: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, cwd, message),
    push: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, cwd),
    stagedDiff: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGED_DIFF, cwd),
    recentLog: (cwd: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_RECENT_LOG, cwd, limit)
  },
  agent: {
    runUtility: (payload: import('./types').AgentUtilityPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN_UTILITY, payload)
  },
  skills: {
    scan: (workspaceCwd?: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_SCAN, workspaceCwd)
  },
  terminal: {
    create: (scopeKey: string, cwd: string, title?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, scopeKey, cwd, title),
    write: (terminalId: string, data: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_WRITE, terminalId, data),
    resize: (terminalId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, terminalId, cols, rows),
    kill: (terminalId: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_KILL, terminalId),
    list: (scopeKey: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_LIST, scopeKey),
    onData: (callback: (event: TerminalDataEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TerminalDataEvent): void =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, listener)
    },
    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TerminalExitEvent): void =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, listener)
    }
  },
  plans: {
    list: (payload: PlansListPayload) => ipcRenderer.invoke(IPC_CHANNELS.PLANS_LIST, payload),
    get: (planId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLANS_GET, planId) as Promise<PlanDetail | null>
  },
  shell: {
    openPath: (payload: OpenPathPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, payload)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('agentAPI', agentAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.agentAPI = agentAPI
}
