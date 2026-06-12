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
  DIALOG_SELECT_FILES: 'dialog:selectFiles',
  FILE_SAVE_TEMP_IMAGE: 'file:saveTempImage',
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_GET_MESSAGES: 'conversations:getMessages',
  CONVERSATIONS_UPDATE: 'conversations:update',
  CONVERSATIONS_DELETE: 'conversations:delete',
  PROJECTS_LIST: 'projects:list',
  PROJECTS_SAVE: 'projects:save',
  PROJECTS_DELETE: 'projects:delete',
  WORKSPACES_LIST: 'workspaces:list',
  WORKSPACES_SAVE: 'workspaces:save',
  WORKSPACES_DELETE: 'workspaces:delete',
  PROVIDERS_LIST: 'providers:list',
  PROVIDERS_SAVE: 'providers:save',
  PROVIDERS_DELETE: 'providers:delete',
  GATEWAY_STATUS: 'gateway:status',
  GATEWAY_START: 'gateway:start',
  GATEWAY_STOP: 'gateway:stop'
} as const

export interface FileAttachmentPayload {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
}

export interface UrlAttachmentPayload {
  id: string
  type: 'url'
  url: string
}

export type AttachmentPayload = FileAttachmentPayload | UrlAttachmentPayload

export interface SendMessagePayload {
  conversationId: string
  content: string
  agentId: string
  cwd?: string
  workspaceFolders?: string[]
  attachments?: AttachmentPayload[]
}

export interface CreateConversationPayload {
  agentId: string
  firstMessage: string
  projectId?: string | null
  attachments?: AttachmentPayload[]
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

export interface WorkspacePayload {
  id: string
  name: string
  folders: string[]
}

export interface ProviderConfigPayload {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
}

export interface GatewayStatus {
  running: boolean
  host: string
  port: number
  token: string
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
  attachments?: AttachmentPayload[]
  usage?: TokenUsage
  debugInput?: string
  debugOutput?: string
}

export interface SettingsInfo {
  theme: 'light' | 'dark' | 'system'
  approvalLevel: 'request' | 'auto' | 'full'
  language: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUSD: number
}

export interface ToolUseInfo {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'running' | 'completed' | 'error'
  summary?: string
  elapsedSeconds?: number
}

export type AgentEvent =
  | { type: 'message.started'; conversationId: string; messageId: string }
  | { type: 'message.delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message.completed'; conversationId: string; messageId: string; usage?: TokenUsage; debugInput?: string; debugOutput?: string }
  | { type: 'message.error'; conversationId: string; error: string }
  | { type: 'tool.started'; conversationId: string; messageId: string; tool: ToolUseInfo }
  | { type: 'tool.progress'; conversationId: string; messageId: string; toolUseId: string; elapsedSeconds: number }
  | { type: 'tool.completed'; conversationId: string; messageId: string; toolUseId: string; summary?: string }

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
  workspaces: {
    list: () => Promise<WorkspacePayload[]>
    save: (payload: WorkspacePayload) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  providers: {
    list: () => Promise<ProviderConfigPayload[]>
    save: (payload: ProviderConfigPayload) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  settings: {
    get: () => Promise<SettingsInfo>
    update: (payload: SettingsPayload) => Promise<void>
  }
  gateway: {
    status: () => Promise<GatewayStatus>
    start: () => Promise<GatewayStatus>
    stop: () => Promise<void>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
    selectFiles: () => Promise<string[] | null>
  }
  file: {
    saveTempImage: (data: ArrayBuffer, filename: string) => Promise<string>
  }
}
