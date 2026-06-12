import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, appendFileSync, readdirSync, unlinkSync, statSync } from 'fs'

let logDir: string | null = null
let logFile: string | null = null

function getLogDir(): string {
  if (logDir) return logDir
  const home = app.getPath('home')
  const isDev = !app.isPackaged
  const dirName = isDev ? '.agent-desktop-app-dev' : '.agent-desktop-app'
  logDir = join(home, dirName, 'logs')
  mkdirSync(logDir, { recursive: true })
  return logDir
}

function getLogFile(): string {
  if (logFile) return logFile
  const dir = getLogDir()
  const date = new Date().toISOString().slice(0, 10)
  logFile = join(dir, `app-${date}.log`)
  return logFile
}

function formatMessage(level: string, category: string, message: string): string {
  const ts = new Date().toISOString()
  return `[${ts}] [${level}] [${category}] ${message}\n`
}

export function logInfo(category: string, message: string): void {
  const line = formatMessage('INFO', category, message)
  try {
    appendFileSync(getLogFile(), line)
  } catch {}
  if (!app.isPackaged) {
    process.stdout.write(line)
  }
}

export function logWarn(category: string, message: string): void {
  const line = formatMessage('WARN', category, message)
  try {
    appendFileSync(getLogFile(), line)
  } catch {}
  console.warn(line.trim())
}

export function logError(category: string, message: string, error?: unknown): void {
  const errStr = error instanceof Error ? `\n  ${error.stack || error.message}` : error ? `\n  ${String(error)}` : ''
  const line = formatMessage('ERROR', category, message + errStr)
  try {
    appendFileSync(getLogFile(), line)
  } catch {}
  console.error(line.trim())
}

export function cleanOldLogs(maxDays = 7): void {
  try {
    const dir = getLogDir()
    const files = readdirSync(dir)
    const now = Date.now()
    const maxAge = maxDays * 24 * 60 * 60 * 1000
    for (const file of files) {
      const filePath = join(dir, file)
      const stat = statSync(filePath)
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath)
      }
    }
  } catch {}
}

export function getLogPath(): string {
  return getLogDir()
}
