import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { getAppDataDir } from '../database'
import { loadGatewaySettings } from './settings-store'
import type { AdapterEvent } from './types'

export interface GatewayLogTags {
  sessionId?: string
  conversationId?: string
  projectId?: string
  workspaceId?: string
  cwd?: string
}

export interface GatewayLogEvent {
  at: string
  type: string
  message: string
}

export interface GatewayRequestLog {
  id: string
  startedAt: string
  endedAt?: string
  status: 'running' | 'ok' | 'error'
  method: string
  path: string
  protocol: 'chat' | 'messages' | 'responses' | 'models' | 'other'
  model?: string
  providerId?: string
  upstreamModel?: string
  upstreamHost?: string
  stream?: boolean
  latencyMs?: number
  httpStatus?: number
  error?: string
  usage?: { inputTokens: number; outputTokens: number }
  client?: string
  tags: GatewayLogTags
  events: GatewayLogEvent[]
  promptPreview?: string
  responsePreview?: string
}

export interface GatewayLogSummary {
  id: string
  startedAt: string
  endedAt?: string
  status: GatewayRequestLog['status']
  method: string
  path: string
  protocol: GatewayRequestLog['protocol']
  model?: string
  providerId?: string
  upstreamModel?: string
  latencyMs?: number
  error?: string
  sessionId?: string
  conversationId?: string
  projectId?: string
  workspaceId?: string
  cwd?: string
  promptPreview?: string
}

function dayKey(iso = new Date().toISOString()): string {
  return iso.slice(0, 10)
}

export function getGatewayLogsDir(): string {
  const dir = join(getAppDataDir(), 'gateway-logs')
  mkdirSync(dir, { recursive: true })
  return dir
}

function detailsDir(day: string): string {
  const dir = join(getGatewayLogsDir(), 'details', day)
  mkdirSync(dir, { recursive: true })
  return dir
}

function indexPath(day: string): string {
  return join(getGatewayLogsDir(), `${day}.jsonl`)
}

function detailPath(day: string, id: string): string {
  return join(detailsDir(day), `${id}.json`)
}

export function isGatewayLoggingEnabled(): boolean {
  try {
    return Boolean(loadGatewaySettings().logging?.enabled)
  } catch {
    return false
  }
}

function truncate(text: string, max = 240): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

export function buildPromptPreview(messages: Array<{ role: string; content: string }>): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) return ''
  return truncate(lastUser.content, 280)
}

export function extractLogTags(headers: IncomingHeaders): GatewayLogTags {
  const get = (name: string): string | undefined => {
    const raw = headers[name] ?? headers[name.toLowerCase()]
    if (Array.isArray(raw)) return raw[0]?.trim() || undefined
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
  }

  return {
    sessionId:
      get('x-session-id') ||
      get('x-agent-desktop-session') ||
      get('session-id') ||
      get('x-chat-id'),
    conversationId:
      get('x-conversation-id') || get('x-agent-desktop-conversation') || get('conversation-id'),
    projectId: get('x-project-id') || get('x-agent-desktop-project'),
    workspaceId: get('x-workspace-id') || get('x-agent-desktop-workspace'),
    cwd: get('x-cwd') || get('x-agent-desktop-cwd') || get('x-workspace-path')
  }
}

type IncomingHeaders = Record<string, string | string[] | undefined>

export function createRequestLog(input: {
  method: string
  path: string
  protocol: GatewayRequestLog['protocol']
  headers: IncomingHeaders
  model?: string
  stream?: boolean
  promptPreview?: string
}): GatewayRequestLog | null {
  if (!isGatewayLoggingEnabled()) return null

  const id = `req_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
  const startedAt = new Date().toISOString()
  const ua = input.headers['user-agent']
  const client = Array.isArray(ua) ? ua[0] : ua

  const log: GatewayRequestLog = {
    id,
    startedAt,
    status: 'running',
    method: input.method,
    path: input.path,
    protocol: input.protocol,
    model: input.model,
    stream: input.stream,
    client: client ? truncate(client, 120) : undefined,
    tags: extractLogTags(input.headers),
    events: [{ at: startedAt, type: 'start', message: `${input.method} ${input.path}` }],
    promptPreview: input.promptPreview
  }

  persistDetail(log)
  appendSummary(toSummary(log))
  return log
}

export function appendLogEvent(log: GatewayRequestLog | null, type: string, message: string): void {
  if (!log) return
  log.events.push({ at: new Date().toISOString(), type, message: truncate(message, 500) })
}

export function patchRequestLog(
  log: GatewayRequestLog | null,
  patch: Partial<
    Pick<
      GatewayRequestLog,
      | 'providerId'
      | 'upstreamModel'
      | 'upstreamHost'
      | 'usage'
      | 'error'
      | 'httpStatus'
      | 'responsePreview'
      | 'model'
      | 'stream'
    >
  >
): void {
  if (!log) return
  Object.assign(log, patch)
}

export function finishRequestLog(
  log: GatewayRequestLog | null,
  status: 'ok' | 'error',
  extra?: { error?: string; usage?: AdapterEvent['usage']; responsePreview?: string }
): void {
  if (!log) return
  log.status = status
  log.endedAt = new Date().toISOString()
  log.latencyMs = Math.max(0, Date.parse(log.endedAt) - Date.parse(log.startedAt))
  if (extra?.error) log.error = truncate(extra.error, 800)
  if (extra?.usage) log.usage = extra.usage
  if (extra?.responsePreview) log.responsePreview = truncate(extra.responsePreview, 280)
  log.events.push({
    at: log.endedAt,
    type: status === 'ok' ? 'done' : 'error',
    message:
      status === 'ok'
        ? `completed in ${log.latencyMs}ms`
        : `failed: ${log.error || 'unknown error'}`
  })
  persistDetail(log)
  appendSummary(toSummary(log))
}

function toSummary(log: GatewayRequestLog): GatewayLogSummary {
  return {
    id: log.id,
    startedAt: log.startedAt,
    endedAt: log.endedAt,
    status: log.status,
    method: log.method,
    path: log.path,
    protocol: log.protocol,
    model: log.model,
    providerId: log.providerId,
    upstreamModel: log.upstreamModel,
    latencyMs: log.latencyMs,
    error: log.error,
    sessionId: log.tags.sessionId,
    conversationId: log.tags.conversationId,
    projectId: log.tags.projectId,
    workspaceId: log.tags.workspaceId,
    cwd: log.tags.cwd,
    promptPreview: log.promptPreview
  }
}

function persistDetail(log: GatewayRequestLog): void {
  try {
    const day = dayKey(log.startedAt)
    writeFileSync(detailPath(day, log.id), JSON.stringify(log, null, 2), 'utf8')
  } catch (e) {
    console.error('[GatewayLog] persist detail failed:', e)
  }
}

function appendSummary(summary: GatewayLogSummary): void {
  try {
    const day = dayKey(summary.startedAt)
    // Rewrite last line for same id if present (running → ok). Simple approach: append;
    // list API de-dupes by id keeping latest.
    appendFileSync(indexPath(day), JSON.stringify(summary) + '\n', 'utf8')
  } catch (e) {
    console.error('[GatewayLog] append summary failed:', e)
  }
}

export function readRequestLog(id: string): GatewayRequestLog | null {
  const root = getGatewayLogsDir()
  const detailsRoot = join(root, 'details')
  if (!existsSync(detailsRoot)) return null

  for (const day of readdirSync(detailsRoot)) {
    const file = join(detailsRoot, day, `${id}.json`)
    if (!existsSync(file)) continue
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as GatewayRequestLog
    } catch {
      return null
    }
  }
  return null
}

export interface ListGatewayLogsQuery {
  q?: string
  session?: string
  conversation?: string
  project?: string
  workspace?: string
  cwd?: string
  status?: string
  protocol?: string
  days?: number
  limit?: number
}

function matches(summary: GatewayLogSummary, query: ListGatewayLogsQuery): boolean {
  if (query.status && summary.status !== query.status) return false
  if (query.protocol && summary.protocol !== query.protocol) return false
  if (query.session && !includes(summary.sessionId, query.session)) return false
  if (query.conversation && !includes(summary.conversationId, query.conversation)) return false
  if (query.project && !includes(summary.projectId, query.project)) return false
  if (query.workspace && !includes(summary.workspaceId, query.workspace)) return false
  if (query.cwd && !includes(summary.cwd, query.cwd)) return false

  if (query.q) {
    const hay = [
      summary.id,
      summary.path,
      summary.model,
      summary.providerId,
      summary.upstreamModel,
      summary.error,
      summary.sessionId,
      summary.conversationId,
      summary.projectId,
      summary.workspaceId,
      summary.cwd,
      summary.promptPreview
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(query.q.toLowerCase())) return false
  }
  return true
}

function includes(value: string | undefined, needle: string): boolean {
  if (!value) return false
  return value.toLowerCase().includes(needle.toLowerCase())
}

export function listGatewayLogSummaries(query: ListGatewayLogsQuery = {}): GatewayLogSummary[] {
  const days = Math.min(Math.max(query.days ?? 7, 1), 30)
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000)
  const root = getGatewayLogsDir()
  const files = existsSync(root)
    ? readdirSync(root)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .sort()
        .reverse()
        .slice(0, days)
    : []

  const byId = new Map<string, GatewayLogSummary>()
  for (const file of files) {
    const full = join(root, file)
    let content = ''
    try {
      content = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line) as GatewayLogSummary
        byId.set(row.id, row) // later lines overwrite earlier (running → ok)
      } catch {
        // skip bad line
      }
    }
  }

  return [...byId.values()]
    .filter((row) => matches(row, query))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit)
}

export function listLogFacetValues(
  field: 'sessionId' | 'conversationId' | 'projectId' | 'workspaceId' | 'cwd',
  limit = 50
): string[] {
  const values = new Set<string>()
  for (const row of listGatewayLogSummaries({ days: 14, limit: 1000 })) {
    const v = row[field]
    if (v) values.add(v)
    if (values.size >= limit) break
  }
  return [...values].sort()
}
