export const IPC_CHANNELS = {
  AGENTS_LIST: 'agents:list',
  AGENTS_MODELS_LIST: 'agents:listModels',
  AGENTS_CONFIG_GET: 'agents:getConfig',
  AGENTS_CONFIG_UPDATE: 'agents:updateConfig',
  CHAT_CREATE: 'chat:createConversation',
  CHAT_SEND: 'chat:sendMessage',
  CHAT_SEND_FIRST: 'chat:sendFirstMessage',
  CHAT_STOP: 'chat:stop',
  AGENT_EVENT: 'agent:event',
  APPROVAL_RESPOND: 'approval:respond',
  APPROVAL_NAVIGATE: 'approval:navigate',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  DIALOG_SELECT_FOLDER: 'dialog:selectFolder',
  DIALOG_SELECT_FILES: 'dialog:selectFiles',
  FILE_SAVE_TEMP_IMAGE: 'file:saveTempImage',
  FILE_OPEN_ATTACHMENT: 'file:openAttachment',
  FILE_GET_IMAGE_DATA_URL: 'file:getImageDataUrl',
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_LIST_ARCHIVED: 'conversations:listArchived',
  CONVERSATIONS_GET_MESSAGES: 'conversations:getMessages',
  CONVERSATIONS_UPDATE: 'conversations:update',
  CONVERSATIONS_DELETE: 'conversations:delete',
  CONVERSATIONS_DELETE_ALL_ARCHIVED: 'conversations:deleteAllArchived',
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
  GATEWAY_STOP: 'gateway:stop',
  GIT_STATUS: 'git:status',
  GIT_CHANGED_FILES: 'git:changedFiles',
  GIT_DIFF: 'git:diff',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_DISCARD: 'git:discard',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_STAGED_DIFF: 'git:stagedDiff',
  GIT_RECENT_LOG: 'git:recentLog',
  AGENT_RUN_UTILITY: 'agent:runUtility',
  FILE_LIST: 'file:list',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_COPY: 'file:copy',
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  PLANS_LIST: 'plans:list',
  PLANS_GET: 'plans:get'
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

export interface PlanReference {
  id: string
  title: string
}

export interface SendMessagePayload {
  conversationId: string
  content: string
  agentId: string
  modelId?: string
  cwd?: string
  workspaceFolders?: string[]
  attachments?: AttachmentPayload[]
  planMode?: boolean
  planRefs?: PlanReference[]
}

export interface CreateConversationPayload {
  agentId: string
  modelId?: string
  firstMessage: string
  projectId?: string | null
  attachments?: AttachmentPayload[]
  planMode?: boolean
}

export interface SettingsPayload {
  theme?: 'light' | 'dark' | 'system'
  approvalLevel?: 'request' | 'auto' | 'full'
  language?: string
  permissionNotificationsEnabled?: boolean
  filePreview?: FilePreviewSettings
  aiPrompts?: AiPromptsSettings
}

export interface FilePreviewSettings {
  textExtensions: string[]
  imageExtensions: string[]
}

export interface AiPromptsSettings {
  commitMessage?: string
  autoCommit?: string
}

export interface AgentUtilityPayload {
  systemPrompt: string
  userPrompt: string
  cwd?: string
  agentId?: string
  modelId?: string
}

export interface ConversationUpdatePayload {
  id: string
  title?: string
  pinned?: boolean
  archived?: boolean
  approvalLevel?: 'request' | 'auto' | 'full'
  modelId?: string
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

export interface GitChangedFile {
  path: string
  additions: number
  deletions: number
  status: string
}

export interface GitStatusResult {
  isRepo: boolean
  gitAvailable: boolean
  branch: string | null
  tracking: string | null
  ahead: number
  behind: number
  additions: number
  deletions: number
  changedFiles: number
  files: GitChangedFile[]
  error?: string
}

export type GitDiffScope = 'unstaged' | 'staged'

export interface GitDiffResult {
  original: string
  modified: string
  unified: string
}

export interface FileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size?: number
}

export interface TerminalInfo {
  id: string
  title: string
  cwd: string
  shell: string
}

export interface TerminalDataEvent {
  terminalId: string
  data: string
}

export interface TerminalExitEvent {
  terminalId: string
  exitCode: number
}

export interface AgentInfo {
  id: string
  name: string
  enabled: boolean
}

export interface AgentModelOption {
  id: string
  name: string
  description?: string
}

export interface AgentConfigSettings {
  defaultModelId?: string
  models?: AgentModelOption[]
}

export type ModelCatalogSource = 'sdk' | 'claude-settings' | 'app-config' | 'fallback'

export interface ModelCatalogResult {
  agentId: string
  models: AgentModelOption[]
  discoveredModels: AgentModelOption[]
  defaultModelId: string
  source: ModelCatalogSource
  discoveredSource: ModelCatalogSource
  claudeDefaultModelId?: string | null
}

export interface ConversationInfo {
  id: string
  title: string
  cwd: string | null
  attachments?: AttachmentPayload[]
}

export interface ConversationListItem {
  id: string
  title: string
  agentId: string
  modelId: string | null
  projectId: string | null
  cwd: string | null
  pinned: boolean
  archived: boolean
  approvalLevel: 'request' | 'auto' | 'full'
  createdAt: string
  updatedAt: string
}

export interface MessageInfo {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  planMode?: boolean
  planRefs?: PlanReference[]
  attachments?: AttachmentPayload[]
  usage?: TokenUsage
  debugInput?: string
  debugOutput?: string
}

export type PlanOwnerType = 'conversation' | 'project' | 'workspace'

export interface PlanInfo {
  id: string
  conversationId: string
  ownerType: PlanOwnerType
  ownerId: string
  userMessageId: string
  assistantMessageId: string
  title: string
  createdAt: string
}

export interface PlanDetail {
  meta: PlanInfo
  content: string
}

export interface PlansListPayload {
  conversationId?: string
  ownerType?: PlanOwnerType
  ownerId?: string
}

export interface SettingsInfo {
  theme: 'light' | 'dark' | 'system'
  approvalLevel: 'request' | 'auto' | 'full'
  language: string
  permissionNotificationsEnabled: boolean
  filePreview: FilePreviewSettings
  aiPrompts: AiPromptsSettings
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
  status: 'pending' | 'running' | 'completed' | 'error'
  summary?: string
  elapsedSeconds?: number
}

export interface ApprovalRequestInfo {
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
}

export interface ApprovalRespondPayload {
  requestId: string
  allowed: boolean
  scope?: 'once' | 'conversation'
}

export type AgentEvent =
  | { type: 'message.started'; conversationId: string; messageId: string }
  | { type: 'message.delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message.completed'; conversationId: string; messageId: string; usage?: TokenUsage; debugInput?: string; debugOutput?: string; stopped?: boolean }
  | { type: 'message.error'; conversationId: string; error: string }
  | { type: 'tool.started'; conversationId: string; messageId: string; tool: ToolUseInfo }
  | { type: 'tool.input_updated'; conversationId: string; messageId: string; toolUseId: string; input: Record<string, unknown> }
  | { type: 'tool.progress'; conversationId: string; messageId: string; toolUseId: string; elapsedSeconds: number }
  | { type: 'tool.completed'; conversationId: string; messageId: string; toolUseId: string; summary?: string }
  | { type: 'session.updated'; conversationId: string; sessionId: string }
  | { type: 'session.cleared'; conversationId: string }
  | ({ type: 'approval.requested' } & ApprovalRequestInfo)
  | { type: 'approval.resolved'; requestId: string; conversationId: string; allowed: boolean; scope?: 'once' | 'conversation' }

export interface AgentAPI {
  agents: {
    list: () => Promise<AgentInfo[]>
    listModels: (agentId: string, forceRefresh?: boolean) => Promise<ModelCatalogResult>
    getConfig: (agentId: string) => Promise<AgentConfigSettings>
    updateConfig: (agentId: string, config: AgentConfigSettings) => Promise<ModelCatalogResult>
  }
  chat: {
    createConversation: (payload: CreateConversationPayload) => Promise<ConversationInfo>
    sendMessage: (payload: SendMessagePayload) => Promise<AttachmentPayload[] | undefined>
    sendFirstMessage: (payload: SendMessagePayload) => Promise<void>
    stop: (conversationId: string) => Promise<void>
    onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  }
  approval: {
    respond: (payload: ApprovalRespondPayload) => Promise<boolean>
    onNavigate: (callback: (conversationId: string) => void) => () => void
  }
  conversations: {
    list: (projectId?: string | null) => Promise<ConversationListItem[]>
    listArchived: () => Promise<ConversationListItem[]>
    getMessages: (conversationId: string) => Promise<MessageInfo[]>
    update: (payload: ConversationUpdatePayload) => Promise<void>
    delete: (conversationId: string) => Promise<void>
    deleteAllArchived: () => Promise<void>
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
    openAttachment: (filePath: string, type: 'image' | 'file') => Promise<boolean>
    getImageDataUrl: (filePath: string) => Promise<string | null>
    list: (dirPath: string, roots: string[]) => Promise<FileEntry[]>
    read: (filePath: string, roots: string[]) => Promise<string>
    write: (filePath: string, content: string, roots: string[]) => Promise<void>
    delete: (filePath: string, roots: string[]) => Promise<void>
    copy: (srcPath: string, destPath: string, roots: string[]) => Promise<void>
  }
  git: {
    status: (cwd: string) => Promise<GitStatusResult>
    changedFiles: (cwd: string, scope: GitDiffScope) => Promise<GitChangedFile[]>
    diff: (cwd: string, file: string, staged?: boolean) => Promise<GitDiffResult>
    stage: (cwd: string, paths: string[]) => Promise<void>
    unstage: (cwd: string, paths: string[]) => Promise<void>
    discard: (cwd: string, paths: string[]) => Promise<void>
    commit: (cwd: string, message: string) => Promise<void>
    push: (cwd: string) => Promise<void>
    stagedDiff: (cwd: string) => Promise<string>
    recentLog: (cwd: string, limit?: number) => Promise<string[]>
  }
  agent: {
    runUtility: (payload: AgentUtilityPayload) => Promise<string>
  }
  terminal: {
    create: (scopeKey: string, cwd: string, title?: string) => Promise<TerminalInfo>
    write: (terminalId: string, data: string) => Promise<void>
    resize: (terminalId: string, cols: number, rows: number) => Promise<void>
    kill: (terminalId: string) => Promise<void>
    list: (scopeKey: string) => Promise<TerminalInfo[]>
    onData: (callback: (event: TerminalDataEvent) => void) => () => void
    onExit: (callback: (event: TerminalExitEvent) => void) => () => void
  }
  plans: {
    list: (payload: PlansListPayload) => Promise<PlanInfo[]>
    get: (planId: string) => Promise<PlanDetail | null>
  }
}
