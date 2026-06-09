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
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  agentId: string
  projectId: string | null
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ApprovalLevel = 'request' | 'auto' | 'full'
