import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AgentEvent,
  ApprovalRespondPayload,
  CreateConversationPayload,
  SendMessagePayload,
  SettingsPayload,
  ConversationUpdatePayload,
  ProjectPayload,
  WorkspacePayload,
  ProviderConfigPayload
} from './types'
import { IPC_CHANNELS } from './types'

const agentAPI = {
  agents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_LIST)
  },
  chat: {
    createConversation: (payload: CreateConversationPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_CREATE, payload),
    sendMessage: (payload: SendMessagePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, payload),
    sendFirstMessage: (payload: SendMessagePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_FIRST, payload),
    stop: (conversationId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, conversationId),
    onAgentEvent: (callback: (event: AgentEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: AgentEvent): void =>
        callback(data)
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
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, id)
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
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_TEMP_IMAGE, data, filename)
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
