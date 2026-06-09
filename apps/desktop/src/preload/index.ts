import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { CreateConversationPayload, SendMessagePayload, SettingsPayload } from './types'
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
    stop: (conversationId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, conversationId)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (payload: SettingsPayload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, payload)
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
