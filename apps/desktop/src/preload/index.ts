import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AgentEvent,
  CreateConversationPayload,
  SendMessagePayload,
  SettingsPayload,
  ConversationUpdatePayload,
  ProjectPayload
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
  conversations: {
    list: (projectId?: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST, projectId),
    getMessages: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_GET_MESSAGES, conversationId),
    update: (payload: ConversationUpdatePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_UPDATE, payload),
    delete: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_DELETE, conversationId)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    save: (payload: ProjectPayload) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SAVE, payload),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, id)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (payload: SettingsPayload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, payload)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER)
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
