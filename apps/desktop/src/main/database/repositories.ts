import { getDatabase } from './index'

export interface ConversationRow {
  id: string
  title: string
  agent_id: string
  project_id: string | null
  cwd: string | null
  agent_session_id: string | null
  approval_level: string | null
  pinned: number
  archived: number
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: string
  attachments: string | null
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_creation_tokens: number | null
  cost_usd: number | null
  raw_input: string | null
  debug_input: string | null
  debug_output: string | null
  plan_mode: number | null
}

export interface ProjectRow {
  id: string
  name: string
  path: string
}

// --- Conversations ---

export function createConversation(conv: {
  id: string
  title: string
  agentId: string
  projectId: string | null
  cwd: string | null
  approvalLevel?: string
  createdAt: string
  updatedAt: string
}): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO conversations (id, title, agent_id, project_id, cwd, approval_level, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    conv.id,
    conv.title,
    conv.agentId,
    conv.projectId,
    conv.cwd,
    conv.approvalLevel ?? 'auto',
    conv.createdAt,
    conv.updatedAt
  )
}

export function getConversationsByProject(projectId: string): ConversationRow[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM conversations
       WHERE project_id = ? AND archived = 0
       ORDER BY pinned DESC, updated_at DESC`
    )
    .all(projectId) as ConversationRow[]
}

export function getAllConversations(): ConversationRow[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM conversations
       WHERE archived = 0
       ORDER BY pinned DESC, updated_at DESC`
    )
    .all() as ConversationRow[]
}

export function getConversationById(id: string): ConversationRow | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
}

export function setConversationSessionId(id: string, sessionId: string | null): void {
  const db = getDatabase()
  db.prepare('UPDATE conversations SET agent_session_id = ? WHERE id = ?').run(sessionId, id)
}

export function setConversationCwd(id: string, cwd: string): void {
  const db = getDatabase()
  db.prepare('UPDATE conversations SET cwd = ? WHERE id = ?').run(cwd, id)
}

export function getProjectById(id: string): ProjectRow | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
}

export function resolveCwdForProjectId(projectId: string): string | null {
  const project = getProjectById(projectId)
  if (project) return project.path

  const db = getDatabase()
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(projectId) as
    | { id: string; name: string; folders: string }
    | undefined
  if (workspace) {
    try {
      const folders = JSON.parse(workspace.folders) as string[]
      return folders[0] ?? null
    } catch {
      return null
    }
  }

  return null
}

export function resolveWorkspaceFoldersForProjectId(projectId: string): string[] | undefined {
  const db = getDatabase()
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(projectId) as
    | { folders: string }
    | undefined
  if (!workspace) return undefined

  try {
    const folders = JSON.parse(workspace.folders) as string[]
    return folders.length > 1 ? folders : undefined
  } catch {
    return undefined
  }
}

export function updateConversation(
  id: string,
  fields: { title?: string; pinned?: boolean; archived?: boolean; approvalLevel?: string }
): void {
  const db = getDatabase()
  const sets: string[] = []
  const values: unknown[] = []

  if (fields.title !== undefined) {
    sets.push('title = ?')
    values.push(fields.title)
  }
  if (fields.pinned !== undefined) {
    sets.push('pinned = ?')
    values.push(fields.pinned ? 1 : 0)
  }
  if (fields.archived !== undefined) {
    sets.push('archived = ?')
    values.push(fields.archived ? 1 : 0)
  }
  if (fields.approvalLevel !== undefined) {
    sets.push('approval_level = ?')
    values.push(fields.approvalLevel)
  }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function getConversationApprovalLevel(conversationId: string): 'request' | 'auto' | 'full' {
  const conv = getConversationById(conversationId)
  const level = conv?.approval_level
  if (level === 'request' || level === 'auto' || level === 'full') return level
  return 'auto'
}

export function deleteConversation(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// --- Messages ---

export function addMessage(msg: {
  id: string
  conversationId: string
  role: string
  content: string
  createdAt: string
  attachments?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  cacheReadTokens?: number | null
  cacheCreationTokens?: number | null
  costUSD?: number | null
  rawInput?: string | null
  debugInput?: string | null
  debugOutput?: string | null
  planMode?: boolean | null
}): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, attachments, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, raw_input, debug_input, debug_output, plan_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.conversationId,
    msg.role,
    msg.content,
    msg.createdAt,
    msg.attachments ?? null,
    msg.inputTokens ?? null,
    msg.outputTokens ?? null,
    msg.cacheReadTokens ?? null,
    msg.cacheCreationTokens ?? null,
    msg.costUSD ?? null,
    msg.rawInput ?? null,
    msg.debugInput ?? null,
    msg.debugOutput ?? null,
    msg.planMode ? 1 : 0
  )

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
    msg.createdAt,
    msg.conversationId
  )
}

export function updateMessageUsage(id: string, inputTokens: number, outputTokens: number): void {
  const db = getDatabase()
  db.prepare('UPDATE messages SET input_tokens = ?, output_tokens = ? WHERE id = ?').run(
    inputTokens,
    outputTokens,
    id
  )
}

export function getMessagesByConversation(conversationId: string): MessageRow[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as MessageRow[]
}

export function updateMessageContent(id: string, content: string): void {
  const db = getDatabase()
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id)
}

// --- Settings ---

export function getSetting(key: string): string | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

// --- Projects ---

export function saveProject(proj: { id: string; name: string; path: string }): void {
  const db = getDatabase()
  db.prepare(
    `INSERT OR REPLACE INTO projects (id, name, path) VALUES (?, ?, ?)`
  ).run(proj.id, proj.name, proj.path)
}

export function getAllProjects(): ProjectRow[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM projects').all() as ProjectRow[]
}

export function deleteProject(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// --- Workspaces ---

export interface WorkspaceRow {
  id: string
  name: string
  folders: string
}

export function saveWorkspace(ws: { id: string; name: string; folders: string[] }): void {
  const db = getDatabase()
  db.prepare(
    `INSERT OR REPLACE INTO workspaces (id, name, folders) VALUES (?, ?, ?)`
  ).run(ws.id, ws.name, JSON.stringify(ws.folders))
}

export function getAllWorkspaces(): WorkspaceRow[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM workspaces').all() as WorkspaceRow[]
}

export function deleteWorkspace(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

// --- Provider Configs ---

export interface ProviderConfigRow {
  id: string
  name: string
  type: string
  config: string
}

export function saveProviderConfig(provider: {
  id: string
  name: string
  type: string
  config: string
}): void {
  const db = getDatabase()
  db.prepare(
    'INSERT OR REPLACE INTO provider_configs (id, name, type, config) VALUES (?, ?, ?, ?)'
  ).run(provider.id, provider.name, provider.type, provider.config)
}

export function getAllProviderConfigs(): ProviderConfigRow[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM provider_configs').all() as ProviderConfigRow[]
}

export function getProviderConfig(id: string): ProviderConfigRow | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as
    | ProviderConfigRow
    | undefined
}

export function deleteProviderConfig(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id)
}
