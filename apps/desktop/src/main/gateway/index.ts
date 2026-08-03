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
import {
  reapplyPreferredTakeovers,
  registerGatewayStarter,
  restoreAllTakeovers
} from './live/takeover'
import { ensureLiveBackupTable } from './live/backup-store'
import { buildPromptPreview, createRequestLog, finishRequestLog } from './request-log'
import { syncLogViewerWithSettings } from './log-viewer'
import { canPassthrough, clientProtocolForPath, handlePassthrough } from './passthrough'
import { reclaimGatewayPort } from './port-reclaim'
import { routeModel } from './router'

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

function bodyHasTools(body: Record<string, unknown>): boolean {
  const tools = body.tools
  return Array.isArray(tools) && tools.length > 0
}

function crossProtocolToolsError(clientProtocol: string, upstreamProtocol: string): string {
  return (
    `跨协议请求无法透传 tools（客户端 ${clientProtocol} → 上游 ${upstreamProtocol}）。` +
    `请为该 Provider 配置与通道一致的协议 endpoint，或改用同协议 Provider。`
  )
}

function logGatewayRoute(input: {
  path: string
  model?: string
  providerId?: string
  protocol?: string
  proxyMode: 'passthrough' | 'unified' | 'rejected'
  detail?: string
}): void {
  const parts = [
    input.path,
    input.proxyMode,
    input.providerId ? `provider=${input.providerId}` : null,
    input.protocol ? `protocol=${input.protocol}` : null,
    input.model ? `model=${input.model}` : null,
    input.detail || null
  ].filter(Boolean)
  console.log(`[Gateway] ${parts.join(' ')}`)
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (handleCors(req, res)) return

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
      const body = JSON.parse(raw) as OpenAIChatRequest & Record<string, unknown>
      const clientProtocol = clientProtocolForPath(effectivePath)!
      const route = routeModel(body.model, undefined)
      const log = createRequestLog({
        method: 'POST',
        path: effectivePath,
        protocol: 'chat',
        headers: req.headers,
        model: body.model,
        stream: body.stream,
        requestBody: body,
        promptPreview: buildPromptPreview(
          Array.isArray(body.messages)
            ? body.messages.map((m) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
              }))
            : []
        )
      })

      if (canPassthrough(clientProtocol, route.protocol)) {
        logGatewayRoute({
          path: effectivePath,
          model: body.model,
          providerId: route.provider.id,
          protocol: route.protocol,
          proxyMode: 'passthrough'
        })
        await handlePassthrough({
          clientProtocol,
          parsedBody: body,
          clientHeaders: req.headers,
          res,
          signal: abort.signal,
          log
        })
        return
      }

      if (bodyHasTools(body)) {
        const errMsg = crossProtocolToolsError(clientProtocol, route.protocol)
        logGatewayRoute({
          path: effectivePath,
          model: body.model,
          providerId: route.provider.id,
          protocol: route.protocol,
          proxyMode: 'rejected',
          detail: errMsg
        })
        finishRequestLog(log, 'error', { error: errMsg })
        sendError(res, 400, errMsg)
        return
      }

      logGatewayRoute({
        path: effectivePath,
        model: body.model,
        providerId: route.provider.id,
        protocol: route.protocol,
        proxyMode: 'unified'
      })
      const turn = openaiToUnified(body)
      await handleChatCompletions(turn, res, abort.signal, log)
    } catch (e) {
      if (!res.headersSent) {
        const msg = e instanceof Error ? e.message : 'Invalid request body'
        console.warn(`[Gateway] ${effectivePath} error: ${msg}`)
        sendError(res, 400, msg)
      }
    }
    return
  }

  if (req.method === 'POST' && effectivePath === '/v1/messages') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as AnthropicRequest & Record<string, unknown>
      const channel = isClaudeDesktop ? 'claudeDesktop' : 'claudeCli'
      const clientProtocol = clientProtocolForPath(effectivePath)!
      const route = routeModel(body.model, channel)
      const log = createRequestLog({
        method: 'POST',
        path: effectivePath,
        protocol: 'messages',
        headers: req.headers,
        model: body.model,
        stream: body.stream,
        requestBody: body,
        promptPreview: buildPromptPreview(
          Array.isArray(body.messages)
            ? body.messages.map((m) => ({
                role: m.role,
                content:
                  typeof m.content === 'string'
                    ? m.content
                    : Array.isArray(m.content)
                      ? m.content.map((c) => ('text' in c ? c.text : '')).join('')
                      : ''
              }))
            : []
        )
      })

      if (canPassthrough(clientProtocol, route.protocol)) {
        logGatewayRoute({
          path: effectivePath,
          model: body.model,
          providerId: route.provider.id,
          protocol: route.protocol,
          proxyMode: 'passthrough'
        })
        await handlePassthrough({
          clientProtocol,
          parsedBody: body,
          clientHeaders: req.headers,
          res,
          signal: abort.signal,
          log,
          channel
        })
        return
      }

      if (bodyHasTools(body)) {
        const errMsg = crossProtocolToolsError(clientProtocol, route.protocol)
        logGatewayRoute({
          path: effectivePath,
          model: body.model,
          providerId: route.provider.id,
          protocol: route.protocol,
          proxyMode: 'rejected',
          detail: errMsg
        })
        finishRequestLog(log, 'error', { error: errMsg })
        sendError(res, 400, errMsg)
        return
      }

      logGatewayRoute({
        path: effectivePath,
        model: body.model,
        providerId: route.provider.id,
        protocol: route.protocol,
        proxyMode: 'unified'
      })
      const turn = anthropicToUnified(body)
      await handleMessages(turn, res, abort.signal, log, channel)
    } catch (e) {
      if (!res.headersSent) {
        const msg = e instanceof Error ? e.message : 'Invalid request body'
        console.warn(`[Gateway] ${effectivePath} error: ${msg}`)
        sendError(res, 400, msg)
      }
    }
    return
  }

  if (req.method === 'POST' && effectivePath === '/v1/responses') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as ResponsesRequest & Record<string, unknown>
      const route = routeModel(body.model, 'codex')
      const log = createRequestLog({
        method: 'POST',
        path: effectivePath,
        protocol: 'responses',
        headers: req.headers,
        model: body.model,
        stream: body.stream,
        requestBody: body
      })

      if (bodyHasTools(body)) {
        const errMsg =
          'Responses 路径经 unified 重建会丢弃 tools。请使用支持同协议透传的 Provider，或去掉 tools 后重试。'
        logGatewayRoute({
          path: effectivePath,
          model: body.model,
          providerId: route.provider.id,
          protocol: route.protocol,
          proxyMode: 'rejected',
          detail: errMsg
        })
        finishRequestLog(log, 'error', { error: errMsg })
        sendError(res, 400, errMsg)
        return
      }

      logGatewayRoute({
        path: effectivePath,
        model: body.model,
        providerId: route.provider.id,
        protocol: route.protocol,
        proxyMode: 'unified'
      })
      await handleResponses(body, res, abort.signal, log, 'codex')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid request body'
      console.warn(`[Gateway] ${effectivePath} error: ${msg}`)
      sendError(res, 400, msg)
    }
    return
  }

  sendError(res, 404, `Not found: ${path}`)
}

export function getGatewayConfig(): GatewayConfig {
  syncConfigFromSettings()
  return { ...config }
}

export async function startGateway(
  overrides?: Partial<GatewayConfig>
): Promise<{ token: string; port: number }> {
  ensureLiveBackupTable()
  syncConfigFromSettings()

  if (server) stopGateway({ restoreTakeovers: false })

  if (overrides) {
    config = { ...config, ...overrides }
  }
  if (!config.token) {
    config.token = generateGatewayToken()
  }
  const listenOnce = async (): Promise<void> => {
    const nextServer = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error('[Gateway] unhandled error:', err)
        if (!res.headersSent) {
          sendError(res, 500, 'Internal server error')
        }
      })
    })
    server = nextServer

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException): void => {
        nextServer.off('listening', onListening)
        if (server === nextServer) server = null
        reject(error)
      }
      const onListening = (): void => {
        nextServer.off('error', onError)
        resolve()
      }
      nextServer.once('error', onError)
      nextServer.once('listening', onListening)
      nextServer.listen(config.port, config.host)
    })
  }

  try {
    await listenOnce()
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'EADDRINUSE') {
      const reclaimed = await reclaimGatewayPort(config.port)
      if (reclaimed.length > 0) {
        console.warn(
          `[Gateway] reclaimed port ${config.port} from pid(s) ${reclaimed.join(', ')}, retrying…`
        )
        try {
          await listenOnce()
        } catch (retryError) {
          config.enabled = false
          updateGatewaySettings({ enabled: false })
          const retryErr = retryError as NodeJS.ErrnoException
          const message =
            retryErr.code === 'EADDRINUSE'
              ? `Gateway 端口 ${config.host}:${config.port} 已被占用，请更换端口后重试。`
              : `Gateway 启动失败：${retryErr.message}`
          throw new Error(message, { cause: retryError })
        }
      } else {
        config.enabled = false
        updateGatewaySettings({ enabled: false })
        throw new Error(`Gateway 端口 ${config.host}:${config.port} 已被占用，请更换端口后重试。`, {
          cause: error
        })
      }
    } else {
      config.enabled = false
      updateGatewaySettings({ enabled: false })
      throw new Error(`Gateway 启动失败：${err.message}`, { cause: error })
    }
  }

  config.enabled = true
  saveGatewaySettings({
    ...loadGatewaySettings(),
    enabled: true,
    host: config.host,
    port: config.port,
    token: config.token
  })
  console.log(`[Gateway] listening on http://${config.host}:${config.port}`)

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
  return server?.listening === true
}

export async function maybeAutoStartGateway(): Promise<void> {
  ensureLiveBackupTable()
  const settings = ensureGatewayToken(loadGatewaySettings())
  if (settings.enabled) {
    try {
      await startGateway()
      // Preference flags survive quit; re-wire CLI/Desktop configs to this gateway.
      await reapplyPreferredTakeovers()
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

registerGatewayStarter(async () => {
  if (isGatewayRunning()) {
    const cfg = getGatewayConfig()
    return { token: cfg.token, port: cfg.port }
  }
  return await startGateway()
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
  fetchProviderModels,
  type ProviderFetchModelsResult,
  type ProviderRemoteModel
} from './provider-models'
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
