/**
 * Codex /v1/responses → openai-chat upstream conversion handler.
 * Mirrors cc-switch's Responses↔Chat proxy path.
 */

import type { ServerResponse } from 'http'
import { joinUrl } from '../adapters/base'
import {
  chatCompletionToResponse,
  chatErrorToResponseError,
  ChatToResponsesStream,
  responsesToChatCompletions
} from '../codex-chat'
import { fetchWithHeadersTimeout } from '../fetch-timeout'
import { applyBodyDefaults, applyHeaderOverrides } from '../request-overrides'
import {
  appendLogEvent,
  buildUpstreamRequestLog,
  finishRequestLog,
  headersForLog,
  patchRequestLog,
  type GatewayRequestLog
} from '../request-log'
import { routeModel } from '../router'
import type { GatewayChannel, ResponsesRequest } from '../types'
import { writeJson, writeSseHeaders } from '../bridge/common'

export async function handleResponsesViaChat(
  body: ResponsesRequest & Record<string, unknown>,
  res: ServerResponse,
  signal?: AbortSignal,
  log?: GatewayRequestLog | null,
  channel: GatewayChannel = 'codex'
): Promise<void> {
  const route = routeModel(typeof body.model === 'string' ? body.model : '', channel)
  const { chatBody, toolContext } = responsesToChatCompletions({
    ...body,
    model: route.upstreamModel
  })

  const finalBody = applyBodyDefaults(chatBody, route.endpoint.bodyDefaults)
  const url = joinUrl(route.endpoint.baseUrl, '/v1/chat/completions')
  const stream = Boolean(finalBody.stream)

  const headers = applyHeaderOverrides(
    {
      'Content-Type': 'application/json',
      Accept: stream ? 'text/event-stream' : 'application/json',
      ...(route.endpoint.apiKey?.trim()
        ? { Authorization: `Bearer ${route.endpoint.apiKey.trim()}` }
        : {})
    },
    route.endpoint.headers
  )

  const bodyText = JSON.stringify(finalBody)
  let upstreamHost = url
  try {
    upstreamHost = new URL(url).host
  } catch {
    // keep raw
  }

  patchRequestLog(log ?? null, {
    providerId: route.provider.id,
    upstreamModel: route.upstreamModel,
    upstreamHost,
    proxyMode: 'convert',
    intercept: {
      mode: 'convert',
      inboundBytes: Buffer.byteLength(JSON.stringify(body), 'utf8'),
      upstreamBytes: Buffer.byteLength(bodyText, 'utf8'),
      rewritten: ['protocol', 'tools', 'messages'],
      note: 'Responses→Chat 转换（含 tools / tool_calls）'
    },
    upstreamRequest: buildUpstreamRequestLog({
      url,
      headers,
      body: bodyText
    })
  })
  appendLogEvent(
    log ?? null,
    'route',
    `provider=${route.provider.id} protocol=openai-chat model=${route.upstreamModel}（Responses↔Chat 转换）`
  )
  appendLogEvent(log ?? null, 'upstream', `POST ${upstreamHost} via openai-chat`)

  let response: Response
  try {
    response = await fetchWithHeadersTimeout(url, {
      method: 'POST',
      headers,
      body: bodyText,
      signal
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream fetch failed'
    appendLogEvent(log ?? null, 'error', msg)
    finishRequestLog(log ?? null, 'error', { error: msg })
    if (!res.headersSent) writeJson(res, 502, chatErrorToResponseError({ error: { message: msg } }))
    return
  }

  appendLogEvent(log ?? null, 'upstream_status', `HTTP ${response.status}`)
  patchRequestLog(log ?? null, {
    httpStatus: response.status,
    upstreamResponseHeaders: headersForLog(response.headers)
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    let errJson: unknown
    try {
      errJson = errText ? JSON.parse(errText) : undefined
    } catch {
      errJson = { error: { message: errText || `Upstream HTTP ${response.status}` } }
    }
    const mapped = chatErrorToResponseError(errJson)
    finishRequestLog(log ?? null, 'error', {
      error:
        typeof (mapped.error as { message?: string })?.message === 'string'
          ? (mapped.error as { message: string }).message
          : `Upstream HTTP ${response.status}`,
      responseBody: mapped
    })
    if (!res.headersSent) writeJson(res, response.status >= 400 ? response.status : 502, mapped)
    return
  }

  if (stream) {
    writeSseHeaders(res)
    const converter = new ChatToResponsesStream(toolContext)
    try {
      if (!response.body) throw new Error('Upstream stream body missing')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() ?? ''
        for (const line of parts) {
          const trimmed = line.trimEnd()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trimStart()
          if (!data || data === '[DONE]') continue
          try {
            const chunk = JSON.parse(data) as Record<string, unknown>
            for (const event of converter.handleChatChunk(chunk)) {
              res.write(event)
            }
          } catch {
            // skip malformed chunk
          }
        }
      }

      if (buffer.trim().startsWith('data:')) {
        const data = buffer.trim().slice(5).trimStart()
        if (data && data !== '[DONE]') {
          try {
            const chunk = JSON.parse(data) as Record<string, unknown>
            for (const event of converter.handleChatChunk(chunk)) {
              res.write(event)
            }
          } catch {
            // ignore
          }
        }
      }

      for (const event of converter.finish()) {
        res.write(event)
      }
      res.end()
      finishRequestLog(log ?? null, 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stream conversion failed'
      for (const event of converter.fail(msg)) {
        if (!res.writableEnded) res.write(event)
      }
      if (!res.writableEnded) res.end()
      finishRequestLog(log ?? null, 'error', { error: msg })
    }
    return
  }

  try {
    const json = (await response.json()) as Record<string, unknown>
    const converted = chatCompletionToResponse(json, toolContext)
    finishRequestLog(log ?? null, 'ok', { responseBody: converted })
    writeJson(res, 200, converted)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Response conversion failed'
    finishRequestLog(log ?? null, 'error', { error: msg })
    if (!res.headersSent) writeJson(res, 502, chatErrorToResponseError({ error: { message: msg } }))
  }
}
