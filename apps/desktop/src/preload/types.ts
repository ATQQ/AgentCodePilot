export const IPC_CHANNELS = {
  AGENTS_LIST: 'agents:list',
  CHAT_CREATE: 'chat:createConversation',
  CHAT_SEND: 'chat:sendMessage',
  CHAT_STOP: 'chat:stop',
  AGENT_EVENT: 'agent:event',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update'
} as const

export interface SendMessagePayload {
  conversationId: string
  content: string
  agentId: string
}

export interface CreateConversationPayload {
  agentId: string
  firstMessage: string
  projectId?: string | null
}

export interface SettingsPayload {
  theme?: 'light' | 'dark' | 'system'
  approvalLevel?: 'request' | 'auto' | 'full'
  language?: string
}

export interface AgentInfo {
  id: string
  name: string
  enabled: boolean
}

export interface ConversationInfo {
  id: string
  title: string
}

export interface MessageInfo {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface SettingsInfo {
  theme: 'light' | 'dark' | 'system'
  approvalLevel: 'request' | 'auto' | 'full'
  language: string
}

export type AgentEvent =
  | { type: 'message.started'; conversationId: string; messageId: string }
  | { type: 'message.delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message.completed'; conversationId: string; messageId: string }
  | { type: 'message.error'; conversationId: string; error: string }

export interface AgentAPI {
  agents: {
    list: () => Promise<AgentInfo[]>
  }
  chat: {
    createConversation: (payload: CreateConversationPayload) => Promise<ConversationInfo>
    sendMessage: (payload: SendMessagePayload) => Promise<void>
    stop: (conversationId: string) => Promise<void>
    onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  }
  settings: {
    get: () => Promise<SettingsInfo>
    update: (payload: SettingsPayload) => Promise<void>
  }
}
