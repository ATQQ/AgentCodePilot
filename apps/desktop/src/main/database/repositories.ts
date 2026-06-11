import { getDatabase } from './index'

export interface ConversationRow {
  id: string
  title: string
  agent_id: string
  project_id: string | null
  cwd: string | null
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
  createdAt: string
  updatedAt: string
}): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO conversations (id, title, agent_id, project_id, cwd, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(conv.id, conv.title, conv.agentId, conv.projectId, conv.cwd, conv.createdAt, conv.updatedAt)
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

export function updateConversation(
  id: string,
  fields: { title?: string; pinned?: boolean; archived?: boolean }
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

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values)
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
}): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt)

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
    msg.createdAt,
    msg.conversationId
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
