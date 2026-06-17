export type { AgentModelOption, AgentConfigSettings, ModelCatalogSource, ModelCatalogResult } from '../../../preload/types'
export type {
  GitChangedFile,
  GitStatusResult,
  GitDiffScope,
  GitDiffResult,
  FileEntry,
  TerminalInfo,
  TerminalDataEvent,
  TerminalExitEvent
} from '../../../preload/types'

export interface AgentConfig {
  id: string
  name: string
  enabled: boolean
}

export interface ModelConfig {
  id: string
  name: string
  provider: string
}

export interface Workspace {
  id: string
  name: string
  folders: string[]
}

export interface Project {
  id: string
  name: string
  path: string
}

export interface ToolCall {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'error'
  summary?: string
  elapsedSeconds?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  planMode?: boolean
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUSD: number }
  attachments?: Attachment[]
  toolCalls?: ToolCall[]
  debugInput?: string
  debugOutput?: string
}

export interface ApprovalRequest {
  requestId: string
  conversationId: string
  messageId: string
  toolUseId: string
  toolName: string
  displayName: string
  title: string
  description?: string
  detail: string
  decisionReason?: string
  status: 'pending' | 'allowed' | 'denied'
}

export interface Conversation {
  id: string
  title: string
  agentId: string
  modelId?: string | null
  projectId: string | null
  cwd: string | null
  messages: Message[]
  createdAt: string
  updatedAt: string
  pinned?: boolean
  archived?: boolean
  approvalLevel: ApprovalLevel
}

export interface FileAttachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  previewUrl?: string
}

export interface UrlAttachment {
  id: string
  type: 'url'
  url: string
  title?: string
}

export type Attachment = FileAttachment | UrlAttachment

export type ThemeMode = 'light' | 'dark' | 'system'
export type ApprovalLevel = 'request' | 'auto' | 'full'
