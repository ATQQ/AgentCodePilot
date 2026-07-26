import { getDatabase } from '../../database'
import type { TakeoverApp } from '../types'

export interface LiveBackupRow {
  app_type: string
  original_config: string
  backed_up_at: string
}

export function ensureLiveBackupTable(): void {
  const db = getDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_live_backup (
      app_type TEXT PRIMARY KEY,
      original_config TEXT NOT NULL,
      backed_up_at TEXT NOT NULL
    );
  `)
}

export function saveLiveBackup(appType: TakeoverApp, originalConfig: unknown): void {
  ensureLiveBackupTable()
  const db = getDatabase()
  db.prepare(
    `INSERT OR REPLACE INTO gateway_live_backup (app_type, original_config, backed_up_at)
     VALUES (?, ?, ?)`
  ).run(appType, JSON.stringify(originalConfig), new Date().toISOString())
}

export function getLiveBackup(appType: TakeoverApp): LiveBackupRow | undefined {
  ensureLiveBackupTable()
  const db = getDatabase()
  return db.prepare('SELECT * FROM gateway_live_backup WHERE app_type = ?').get(appType) as
    | LiveBackupRow
    | undefined
}

export function deleteLiveBackup(appType: TakeoverApp): void {
  ensureLiveBackupTable()
  const db = getDatabase()
  db.prepare('DELETE FROM gateway_live_backup WHERE app_type = ?').run(appType)
}

export function listLiveBackups(): LiveBackupRow[] {
  ensureLiveBackupTable()
  const db = getDatabase()
  return db.prepare('SELECT * FROM gateway_live_backup').all() as LiveBackupRow[]
}
