export const IPC_CHANNELS = {
  AGENTS_LIST: 'agents:list',
  CHAT_CREATE: 'chat:createConversation',
  CHAT_SEND: 'chat:sendMessage',
  CHAT_SEND_FIRST: 'chat:sendFirstMessage',
  CHAT_STOP: 'chat:stop',
  AGENT_EVENT: 'agent:event',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  DIALOG_SELECT_FOLDER: 'dialog:selectFolder',
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_GET_MESSAGES: 'conversations:getMessages',
  CONVERSATIONS_UPDATE: 'conversations:update',
  CONVERSATIONS_DELETE: 'conversations:delete',
  PROJECTS_LIST: 'projects:list',
  PROJECTS_SAVE: 'projects:save',
  PROJECTS_DELETE: 'projects:delete'
} as const

export interface SendMessagePayload {
  conversationId: string
  content: string
  agentId: string
  cwd?: string
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

export interface ConversationUpdatePayload {
  id: string
  title?: string
  pinned?: boolean
  archived?: boolean
}

export interface ProjectPayload {
  id: string
  name: string
  path: string
}

export interface AgentInfo {
  id: string
  name: string
  enabled: boolean
}

export interface ConversationInfo {
  id: string
  title: string
  cwd: string | null
}

export interface ConversationListItem {
  id: string
  title: string
  agentId: string
  projectId: string | null
  cwd: string | null
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
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

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export type AgentEvent =
  | { type: 'message.started'; conversationId: string; messageId: string }
  | { type: 'message.delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message.completed'; conversationId: string; messageId: string; usage?: TokenUsage }
  | { type: 'message.error'; conversationId: string; error: string }

export interface AgentAPI {
  agents: {
    list: () => Promise<AgentInfo[]>
  }
  chat: {
    createConversation: (payload: CreateConversationPayload) => Promise<ConversationInfo>
    sendMessage: (payload: SendMessagePayload) => Promise<void>
    sendFirstMessage: (payload: SendMessagePayload) => Promise<void>
    stop: (conversationId: string) => Promise<void>
    onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  }
  conversations: {
    list: (projectId?: string | null) => Promise<ConversationListItem[]>
    getMessages: (conversationId: string) => Promise<MessageInfo[]>
    update: (payload: ConversationUpdatePayload) => Promise<void>
    delete: (conversationId: string) => Promise<void>
  }
  projects: {
    list: () => Promise<ProjectPayload[]>
    save: (payload: ProjectPayload) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  settings: {
    get: () => Promise<SettingsInfo>
    update: (payload: SettingsPayload) => Promise<void>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
  }
}
