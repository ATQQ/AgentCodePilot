import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import type {
  AnthropicRequest,
  GatewayConfig,
  OpenAIChatRequest,
  ResponsesRequest,
  UnifiedTurn
} from './types'
import { handleChatCompletions } from './handlers/chat-completions'
import { handleMessages } from './handlers/messages'
import { handleResponses } from './handlers/responses'
import { listGatewayModels } from './handlers/models'
import {
  ensureGatewayToken,
  loadGatewaySettings,
  saveGatewaySettings,
  updateGatewaySettings,
  generateGatewayToken
} from './settings-store'
import { PROXY_MANAGED } from './live/constants'
import {
  reapplyPreferredTakeovers,
  registerGatewayStarter,
  restoreAllTakeovers
} from './live/takeover'
import { ensureLiveBackupTable } from './live/backup-store'
import { buildPromptPreview, createRequestLog, finishRequestLog } from './request-log'
import { syncLogViewerWithSettings } from './log-viewer'

let server: Server | null = null
let config: GatewayConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 3456,
  token: ''
}

function syncConfigFromSettings(): void {
  const settings = ensureGatewayToken(loadGatewaySettings())
  config = {
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    token: settings.token
  }
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(body)
}

function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  type = 'invalid_request_error'
): void {
  sendJson(res, status, { error: { message, type, code: null } })
}

function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-api-key, anthropic-version, OpenAI-Beta',
      'Access-Control-Max-Age': '86400'
    })
    res.end()
    return true
  }
  return false
}

function validateToken(req: IncomingMessage): boolean {
  if (!config.token) return true
  const auth = req.headers['authorization'] || ''
  const apiKey = (req.headers['x-api-key'] as string) || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (bearer === config.token || apiKey === config.token) return true
  // Live takeover writes PROXY_MANAGED into CLI configs
  if (bearer === PROXY_MANAGED || apiKey === PROXY_MANAGED) return true
  return false
}

function openaiToUnified(body: OpenAIChatRequest): UnifiedTurn {
  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = []
  let systemPrompt: string | undefined
  for (const msg of body.messages) {
    if (msg.role === 'system') {
      systemPrompt = (systemPrompt ? systemPrompt + '\n' : '') + msg.content
    } else {
      messages.push({ role: msg.role, content: msg.content })
    }
  }
  return {
    model: body.model,
    systemPrompt,
    messages,
    stream: body.stream ?? false,
    temperature: body.temperature,
    maxTokens: body.max_tokens
  }
}

function anthropicToUnified(body: AnthropicRequest): UnifiedTurn {
  const messages: { role: 'user' | 'assistant'; content: string }[] = body.messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : m.content.map((c) => c.text).join('')
  }))
  return {
    model: body.model,
    systemPrompt: body.system,
    messages,
    stream: body.stream ?? false,
    temperature: body.temperature,
    maxTokens: body.max_tokens
  }
}

function normalizePath(url: string): string {
  const path = url.split('?')[0] || ''
  return path.replace(/\/+$/, '') || '/'
}

function createAbortFromRequest(req: IncomingMessage): AbortController {
  const controller = new AbortController()
  req.on('close', () => {
    if (!req.complete) controller.abort()
  })
  return controller
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (handleCors(req, res)) return

  if (!validateToken(req)) {
    sendError(res, 401, 'Invalid or missing authentication token', 'authentication_error')
    return
  }

  const path = normalizePath(req.url || '')
  const abort = createAbortFromRequest(req)

  // Claude Desktop prefix → same handlers
  const isClaudeDesktop = path.startsWith('/claude-desktop')
  const effectivePath = isClaudeDesktop ? path.replace(/^\/claude-desktop/, '') || '/' : path

  if (req.method === 'GET' && (effectivePath === '/v1/models' || effectivePath === '/models')) {
    const log = createRequestLog({
      method: 'GET',
      path: effectivePath,
      protocol: 'models',
      headers: req.headers
    })
    try {
      sendJson(res, 200, { object: 'list', data: listGatewayModels() })
      finishRequestLog(log, 'ok')
    } catch (e) {
      finishRequestLog(log, 'error', {
        error: e instanceof Error ? e.message : 'models failed'
      })
      throw e
    }
    return
  }

  if (req.method === 'GET' && effectivePath === '/healthz') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && effectivePath === '/v1/chat/completions') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as OpenAIChatRequest
      const turn = openaiToUnified(body)
      const log = createRequestLog({
        method: 'POST',
        path: effectivePath,
        protocol: 'chat',
        headers: req.headers,
        model: turn.model,
        stream: turn.stream,
        requestBody: body,
        promptPreview: buildPromptPreview(turn.messages)
      })
      await handleChatCompletions(turn, res, abort.signal, log)
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : 'Invalid request body')
    }
    return
  }

  if (req.method === 'POST' && effectivePath === '/v1/messages') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as AnthropicRequest
      const turn = anthropicToUnified(body)
      const log = createRequestLog({
        method: 'POST',
        path: effectivePath,
        protocol: 'messages',
        headers: req.headers,
        model: turn.model,
        stream: turn.stream,
        requestBody: body,
        promptPreview: buildPromptPreview(turn.messages)
      })
      await handleMessages(
        turn,
        res,
        abort.signal,
        log,
        isClaudeDesktop ? 'claudeDesktop' : 'claudeCli'
      )
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : 'Invalid request body')
    }
    return
  }

  if (req.method === 'POST' && effectivePath === '/v1/responses') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as ResponsesRequest
      const log = createRequestLog({
        method: 'POST',
        path: effectivePath,
        protocol: 'responses',
        headers: req.headers,
        model: body.model,
        stream: body.stream,
        requestBody: body
      })
      await handleResponses(body, res, abort.signal, log, 'codex')
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : 'Invalid request body')
    }
    return
  }

  sendError(res, 404, `Not found: ${path}`)
}

export function getGatewayConfig(): GatewayConfig {
  syncConfigFromSettings()
  return { ...config }
}

export function startGateway(overrides?: Partial<GatewayConfig>): { token: string; port: number } {
  ensureLiveBackupTable()
  syncConfigFromSettings()

  if (server) stopGateway({ restoreTakeovers: false })

  if (overrides) {
    config = { ...config, ...overrides }
  }
  if (!config.token) {
    config.token = generateGatewayToken()
  }
  config.enabled = true

  saveGatewaySettings({
    ...loadGatewaySettings(),
    enabled: true,
    host: config.host,
    port: config.port,
    token: config.token
  })

  server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[Gateway] unhandled error:', err)
      if (!res.headersSent) {
        sendError(res, 500, 'Internal server error')
      }
    })
  })

  server.listen(config.port, config.host, () => {
    console.log(`[Gateway] listening on http://${config.host}:${config.port}`)
  })

  // Keep log viewer in sync if logging was previously enabled
  try {
    syncLogViewerWithSettings()
  } catch (e) {
    console.error('[Gateway] log viewer sync failed:', e)
  }

  return { token: config.token, port: config.port }
}

export function stopGateway(options?: {
  restoreTakeovers?: boolean
  /** Persist enabled=false to settings (user toggle). Quit should leave preference alone. */
  persistDisabled?: boolean
}): void {
  const restore = options?.restoreTakeovers !== false
  if (restore) {
    try {
      restoreAllTakeovers()
    } catch (e) {
      console.error('[Gateway] restore takeovers failed:', e)
    }
  }

  if (server) {
    server.close()
    server = null
  }
  config.enabled = false
  if (options?.persistDisabled) {
    try {
      updateGatewaySettings({ enabled: false })
    } catch {
      // db may already be closed on quit
    }
  }
  // Log viewer can keep running so users still browse historical logs;
  // only stop it on full app quit via stopLogViewer().
  console.log('[Gateway] stopped')
}

export function isGatewayRunning(): boolean {
  return server !== null
}

export function maybeAutoStartGateway(): void {
  ensureLiveBackupTable()
  const settings = ensureGatewayToken(loadGatewaySettings())
  if (settings.enabled) {
    try {
      startGateway()
      // Preference flags survive quit; re-wire CLI/Desktop configs to this gateway.
      reapplyPreferredTakeovers()
    } catch (e) {
      console.error('[Gateway] auto-start failed:', e)
    }
  }
  try {
    syncLogViewerWithSettings()
  } catch (e) {
    console.error('[Gateway] log viewer auto-start failed:', e)
  }
}

registerGatewayStarter(() => {
  if (isGatewayRunning()) {
    const cfg = getGatewayConfig()
    return { token: cfg.token, port: cfg.port }
  }
  return startGateway()
})

// Re-exports for main process consumers
export { loadGatewaySettings, updateGatewaySettings, ensureGatewayToken } from './settings-store'
export {
  listPublicProviders,
  saveProvider,
  removeProvider,
  listProviders,
  PROVIDER_PRESETS
} from './provider-store'
export {
  testProviderConnectivity,
  type ProviderTestInput,
  type ProviderTestResult
} from './provider-test'
export {
  getTakeoverStatus,
  setTakeover,
  restoreAllTakeovers,
  reapplyPreferredTakeovers,
  type TakeoverUiApp
} from './live/takeover'
export {
  startLogViewer,
  stopLogViewer,
  getLogViewerUrl,
  isLogViewerRunning,
  syncLogViewerWithSettings
} from './log-viewer'
export { getGatewayLogsDir } from './request-log'
