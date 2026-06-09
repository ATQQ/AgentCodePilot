import { ElectronAPI } from '@electron-toolkit/preload'
import type { AgentAPI } from './types'

declare global {
  interface Window {
    electron: ElectronAPI
    agentAPI: AgentAPI
  }
}
