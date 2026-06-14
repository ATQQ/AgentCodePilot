import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

function getDbDir(): string {
  const home = app.getPath('home')
  const isDev = !app.isPackaged
  const dirName = isDev ? '.agent-desktop-app-dev' : '.agent-desktop-app'
  return join(home, dirName)
}

export function getDatabase(): Database.Database {
  if (db) return db

  const dir = getDbDir()
  mkdirSync(dir, { recursive: true })

  const dbPath = join(dir, 'data.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate(db)
  runMigrations(db)

  return db
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      project_id TEXT,
      cwd TEXT,
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folders TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_conversations_project
      ON conversations(project_id, pinned DESC, updated_at DESC);
  `)
}

function runMigrations(database: Database.Database): void {
  const convCols = database.pragma('table_info(conversations)') as { name: string }[]
  if (!convCols.find((c) => c.name === 'cwd')) {
    database.exec('ALTER TABLE conversations ADD COLUMN cwd TEXT')
  }

  const msgCols = database.pragma('table_info(messages)') as { name: string }[]
  if (!msgCols.find((c) => c.name === 'attachments')) {
    database.exec('ALTER TABLE messages ADD COLUMN attachments TEXT')
  }
  if (!msgCols.find((c) => c.name === 'input_tokens')) {
    database.exec('ALTER TABLE messages ADD COLUMN input_tokens INTEGER')
  }
  if (!msgCols.find((c) => c.name === 'output_tokens')) {
    database.exec('ALTER TABLE messages ADD COLUMN output_tokens INTEGER')
  }
  if (!msgCols.find((c) => c.name === 'raw_input')) {
    database.exec('ALTER TABLE messages ADD COLUMN raw_input TEXT')
  }
  if (!msgCols.find((c) => c.name === 'debug_input')) {
    database.exec('ALTER TABLE messages ADD COLUMN debug_input TEXT')
  }
  if (!msgCols.find((c) => c.name === 'debug_output')) {
    database.exec('ALTER TABLE messages ADD COLUMN debug_output TEXT')
  }
  if (!msgCols.find((c) => c.name === 'cache_read_tokens')) {
    database.exec('ALTER TABLE messages ADD COLUMN cache_read_tokens INTEGER')
  }
  if (!msgCols.find((c) => c.name === 'cache_creation_tokens')) {
    database.exec('ALTER TABLE messages ADD COLUMN cache_creation_tokens INTEGER')
  }
  if (!msgCols.find((c) => c.name === 'cost_usd')) {
    database.exec('ALTER TABLE messages ADD COLUMN cost_usd REAL')
  }

  const convCols2 = database.pragma('table_info(conversations)') as { name: string }[]
  if (!convCols2.find((c) => c.name === 'agent_session_id')) {
    database.exec('ALTER TABLE conversations ADD COLUMN agent_session_id TEXT')
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
