import type { IncomingHttpHeaders, ServerResponse } from 'http'
import { Readable } from 'stream'
import { joinUrl } from './adapters/base'
import { fetchWithHeadersTimeout } from './fetch-timeout'
import { routeModel } from './router'
import {
  appendLogEvent,
  buildUpstreamRequestLog,
  finishRequestLog,
  headersForLog,
  patchRequestLog,
  type GatewayRequestLog
} from './request-log'
import { applyBodyDefaults, applyHeaderOverrides } from './request-overrides'
import type { AdapterUsage, GatewayChannel, ProtocolEndpointConfig, WireAdapter } from './types'
import { mapOpenAiUsage, mergeAnthropicUsage } from './usage'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length'
])

export function clientProtocolForPath(path: string): WireAdapter | null {
  if (path === '/v1/messages') return 'anthropic'
  if (path === '/v1/chat/completions') return 'openai-chat'
  if (path === '/v1/responses') return 'openai-responses'
  return null
}

export function canPassthrough(
  clientProtocol: WireAdapter,
  upstreamProtocol: WireAdapter
): boolean {
  return clientProtocol === upstreamProtocol
}

function upstreamPath(protocol: WireAdapter): string {
  if (protocol === 'anthropic') return '/v1/messages'
  if (protocol === 'openai-responses') return '/v1/responses'
  return '/v1/chat/completions'
}

function buildUpstreamHeaders(
  protocol: WireAdapter,
  endpoint: ProtocolEndpointConfig,
  clientHeaders: IncomingHttpHeaders,
  stream: boolean
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json'
  }

  const apiKey = endpoint.apiKey?.trim()
  if (protocol === 'anthropic') {
    if (apiKey) {
      headers['x-api-key'] = apiKey
      headers.Authorization = `Bearer ${apiKey}`
    }
    const version = headerValue(clientHeaders, 'anthropic-version')
    headers['anthropic-version'] = version || '2023-06-01'
    const beta = headerValue(clientHeaders, 'anthropic-beta')
    if (beta) headers['anthropic-beta'] = beta
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return applyHeaderOverrides(headers, endpoint.headers)
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers[name]
  if (Array.isArray(raw)) return raw[0]
  return typeof raw === 'string' ? raw : undefined
}

/**
 * Shallow-clone body JSON; replace model, then fill missing keys from bodyDefaults.
 * Client-provided fields always win over defaults.
 */
export function buildPassthroughBody(
  parsed: Record<string, unknown>,
  upstreamModel: string,
  bodyDefaults?: Record<string, unknown>
): string {
  const body = applyBodyDefaults({ ...parsed, model: upstreamModel }, bodyDefaults)
  return JSON.stringify(body)
}

function copyResponseHeaders(upstream: Response): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {
    'Access-Control-Allow-Origin': '*'
  }
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    out[key] = value
  })
  return out
}

function extractUsageFromPassthrough(
  protocol: WireAdapter,
  bodyText: string,
  stream: boolean
): AdapterUsage | undefined {
  if (!bodyText) return undefined
  try {
    if (!stream) {
      const json = JSON.parse(bodyText) as {
        usage?: Record<string, unknown>
      }
      if (!json.usage) return undefined
      if (protocol === 'anthropic') {
        return mergeAnthropicUsage(
          undefined,
          json.usage as Parameters<typeof mergeAnthropicUsage>[1]
        )
      }
      return mapOpenAiUsage(json.usage as Parameters<typeof mapOpenAiUsage>[0])
    }

    // Stream: scan SSE data lines for usage (last wins / merge)
    let usage: AdapterUsage | undefined
    for (const line of bodyText.split('\n')) {
      const trimmed = line.trimEnd()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trimStart()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          type?: string
          usage?: Record<string, unknown>
          message?: { usage?: Record<string, unknown> }
        }
        if (protocol === 'anthropic') {
          if (json.type === 'message_start' && json.message?.usage) {
            usage = mergeAnthropicUsage(usage, json.message.usage as never)
          }
          if (json.type === 'message_delta' && json.usage) {
            usage = mergeAnthropicUsage(usage, json.usage as never)
          }
        } else if (json.usage) {
          usage = mapOpenAiUsage(json.usage as never)
        }
      } catch {
        // skip malformed
      }
    }
    return usage
  } catch {
    return undefined
  }
}

/**
 * Same-protocol proxy: forward client JSON as-is (only swap model + auth),
 * pipe upstream response bytes back without rebuilding SSE/JSON.
 */
export async function handlePassthrough(input: {
  clientProtocol: WireAdapter
  parsedBody: Record<string, unknown>
  clientHeaders: IncomingHttpHeaders
  res: ServerResponse
  signal?: AbortSignal
  log?: GatewayRequestLog | null
  channel?: GatewayChannel
}): Promise<void> {
  const model = typeof input.parsedBody.model === 'string' ? input.parsedBody.model : ''
  const stream = Boolean(input.parsedBody.stream)
  const route = routeModel(model, input.channel)

  if (!canPassthrough(input.clientProtocol, route.protocol)) {
    throw new Error(
      `Passthrough requires matching protocols (client=${input.clientProtocol}, upstream=${route.protocol})`
    )
  }

  const url = joinUrl(route.endpoint.baseUrl, upstreamPath(route.protocol))
  const headers = buildUpstreamHeaders(route.protocol, route.endpoint, input.clientHeaders, stream)
  const body = buildPassthroughBody(
    input.parsedBody,
    route.upstreamModel,
    route.endpoint.bodyDefaults
  )
  const inboundBytes = Buffer.byteLength(JSON.stringify(input.parsedBody), 'utf8')
  const upstreamBytes = Buffer.byteLength(body, 'utf8')

  let upstreamHost = url
  try {
    upstreamHost = new URL(url).host
  } catch {
    // keep raw
  }

  const intercept = {
    mode: 'passthrough' as const,
    inboundBytes,
    upstreamBytes,
    rewritten: ['model', 'Authorization', 'x-api-key'],
    note: '同协议透传：请求/响应原样经网关中转，仅替换 model 与上游鉴权；tools / cache_control / content blocks 均保留'
  }

  patchRequestLog(input.log ?? null, {
    providerId: route.provider.id,
    upstreamModel: route.upstreamModel,
    upstreamHost,
    proxyMode: 'passthrough',
    intercept,
    upstreamRequest: buildUpstreamRequestLog({ url, headers, body })
  })
  appendLogEvent(input.log ?? null, 'intercept', `入站 ${inboundBytes} B → 网关拦截层（透传）`)
  appendLogEvent(
    input.log ?? null,
    'passthrough',
    `同协议 ${route.protocol}：仅改 model ${model} → ${route.upstreamModel}，上游 body ${upstreamBytes} B` +
      (Math.abs(upstreamBytes - inboundBytes) < 64
        ? '（与入站体量接近，未裁剪）'
        : `（入站 ${inboundBytes} B）`)
  )
  appendLogEvent(
    input.log ?? null,
    'upstream',
    `转发 POST ${upstreamHost}${upstreamPath(route.protocol)}`
  )

  let upstream: Response
  try {
    upstream = await fetchWithHeadersTimeout(url, {
      method: 'POST',
      headers,
      body,
      signal: input.signal
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream fetch failed'
    appendLogEvent(input.log ?? null, 'error', msg)
    console.warn(`[Gateway] upstream error host=${upstreamHost} mode=passthrough: ${msg}`)
    finishRequestLog(input.log ?? null, 'error', { error: msg })
    throw e
  }

  appendLogEvent(input.log ?? null, 'upstream_status', `上游 HTTP ${upstream.status}`)
  appendLogEvent(
    input.log ?? null,
    'pipe',
    stream ? '开始 pipe 上游 SSE → 客户端' : '开始 pipe 上游响应体 → 客户端'
  )
  console.log(`[Gateway] upstream HTTP ${upstream.status} host=${upstreamHost} mode=passthrough`)
  patchRequestLog(input.log ?? null, {
    httpStatus: upstream.status,
    upstreamResponseHeaders: headersForLog(upstream.headers)
  })

  const outHeaders = copyResponseHeaders(upstream)
  input.res.writeHead(upstream.status, outHeaders)

  const chunks: Buffer[] = []
  const shouldCapture = Boolean(input.log)

  if (!upstream.body) {
    input.res.end()
    finishRequestLog(input.log ?? null, upstream.ok ? 'ok' : 'error', {
      error: upstream.ok ? undefined : `Upstream ${upstream.status}`
    })
    return
  }

  const nodeStream = Readable.fromWeb(upstream.body as import('stream/web').ReadableStream)
  await new Promise<void>((resolve, reject) => {
    nodeStream.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      if (shouldCapture) chunks.push(buf)
      if (!input.res.write(buf)) {
        nodeStream.pause()
        input.res.once('drain', () => nodeStream.resume())
      }
    })
    nodeStream.on('end', () => {
      input.res.end()
      resolve()
    })
    nodeStream.on('error', (err) => {
      reject(err)
    })
    input.res.on('close', () => {
      if (!input.res.writableEnded) {
        nodeStream.destroy()
      }
    })
  })

  const responseBytes = chunks.reduce((n, c) => n + c.length, 0)
  const bodyText = Buffer.concat(chunks).toString('utf-8')
  const usage = extractUsageFromPassthrough(route.protocol, bodyText, stream)

  appendLogEvent(
    input.log ?? null,
    'pipe_done',
    `回传完成 ${responseBytes} B` + (usage ? ` · usage 已旁路解析` : '')
  )
  patchRequestLog(input.log ?? null, {
    intercept: { ...intercept, responseBytes }
  })

  finishRequestLog(input.log ?? null, upstream.ok ? 'ok' : 'error', {
    usage,
    responseBody: bodyText.slice(0, 200_000),
    error: upstream.ok ? undefined : `Upstream ${upstream.status}`
  })
}
