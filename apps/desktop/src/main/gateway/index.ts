import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { randomBytes } from 'crypto'
import type { GatewayConfig, OpenAIChatRequest, UnifiedChatRequest, AnthropicRequest } from './types'
import { handleOpenAICompletion } from './openai-handler'
import { handleAnthropicMessages } from './anthropic-handler'

let server: Server | null = null
let config: GatewayConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 3456,
  token: ''
}

function generateToken(): string {
  return `agp-${randomBytes(24).toString('hex')}`
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

function sendError(res: ServerResponse, status: number, message: string, type = 'invalid_request_error'): void {
  sendJson(res, status, { error: { message, type, code: null } })
}

function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
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
  const apiKey = req.headers['x-api-key'] as string || ''
  if (auth.startsWith('Bearer ') && auth.slice(7) === config.token) return true
  if (apiKey === config.token) return true
  return false
}

function openaiToUnified(body: OpenAIChatRequest): UnifiedChatRequest {
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
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

function anthropicToUnified(body: AnthropicRequest): UnifiedChatRequest {
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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (handleCors(req, res)) return

  if (!validateToken(req)) {
    sendError(res, 401, 'Invalid or missing authentication token', 'authentication_error')
    return
  }

  const url = req.url || ''

  if (req.method === 'GET' && (url === '/v1/models' || url === '/v1/models/')) {
    sendJson(res, 200, {
      object: 'list',
      data: [
        { id: 'claude-code', object: 'model', created: Date.now(), owned_by: 'agent-desktop' }
      ]
    })
    return
  }

  if (req.method === 'POST' && url === '/v1/chat/completions') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as OpenAIChatRequest
      const unified = openaiToUnified(body)
      await handleOpenAICompletion(unified, res)
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : 'Invalid request body')
    }
    return
  }

  if (req.method === 'POST' && url === '/v1/messages') {
    try {
      const raw = await parseBody(req)
      const body = JSON.parse(raw) as AnthropicRequest
      const unified = anthropicToUnified(body)
      await handleAnthropicMessages(unified, res)
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : 'Invalid request body')
    }
    return
  }

  sendError(res, 404, `Not found: ${url}`)
}

export function getGatewayConfig(): GatewayConfig {
  return { ...config }
}

export function startGateway(overrides?: Partial<GatewayConfig>): { token: string; port: number } {
  if (server) stopGateway()

  if (overrides) {
    config = { ...config, ...overrides }
  }
  if (!config.token) {
    config.token = generateToken()
  }
  config.enabled = true

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

  return { token: config.token, port: config.port }
}

export function stopGateway(): void {
  if (server) {
    server.close()
    server = null
    config.enabled = false
    console.log('[Gateway] stopped')
  }
}

export function isGatewayRunning(): boolean {
  return server !== null && config.enabled
}
