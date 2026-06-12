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

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUSD: number }
  attachments?: Attachment[]
  debugInput?: string
  debugOutput?: string
}

export interface Conversation {
  id: string
  title: string
  agentId: string
  projectId: string | null
  cwd: string | null
  messages: Message[]
  createdAt: string
  updatedAt: string
  pinned?: boolean
  archived?: boolean
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
