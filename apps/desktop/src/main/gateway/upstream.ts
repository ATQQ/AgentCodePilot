import { resolveAdapter } from './adapters'
import { routeModel } from './router'
import {
  appendLogEvent,
  buildUpstreamRequestLog,
  headersForLog,
  patchRequestLog,
  type GatewayRequestLog
} from './request-log'
import type { AdapterEvent, GatewayChannel, UnifiedTurn } from './types'

export async function* runUnifiedTurn(
  turn: UnifiedTurn,
  signal?: AbortSignal,
  log?: GatewayRequestLog | null,
  channel?: GatewayChannel
): AsyncGenerator<AdapterEvent> {
  const { provider, protocol, endpoint, upstreamModel } = routeModel(turn.model, channel)
  patchRequestLog(log ?? null, {
    providerId: provider.id,
    upstreamModel
  })
  appendLogEvent(
    log ?? null,
    'route',
    `provider=${provider.id} protocol=${protocol} model=${upstreamModel}`
  )

  const adapter = resolveAdapter(protocol)
  const request = adapter.buildRequest(turn, endpoint, upstreamModel)

  let upstreamHost = request.url
  try {
    upstreamHost = new URL(request.url).host
  } catch {
    // keep raw
  }
  patchRequestLog(log ?? null, {
    upstreamHost,
    upstreamRequest: buildUpstreamRequestLog(request)
  })
  appendLogEvent(log ?? null, 'upstream', `POST ${upstreamHost} via ${protocol}`)

  let response: Response
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream fetch failed'
    appendLogEvent(log ?? null, 'error', msg)
    yield { type: 'error', error: msg }
    return
  }

  appendLogEvent(log ?? null, 'upstream_status', `HTTP ${response.status}`)
  patchRequestLog(log ?? null, {
    httpStatus: response.status,
    upstreamResponseHeaders: headersForLog(response.headers)
  })

  if (turn.stream) {
    yield* adapter.parseStream(response)
  } else {
    const events = await adapter.parseJson(response)
    for (const event of events) yield event
  }
}

export async function collectTurnText(
  turn: UnifiedTurn,
  signal?: AbortSignal,
  log?: GatewayRequestLog | null,
  channel?: GatewayChannel
): Promise<{ text: string; usage?: AdapterEvent['usage'] }> {
  let text = ''
  let usage: AdapterEvent['usage']
  for await (const event of runUnifiedTurn({ ...turn, stream: false }, signal, log, channel)) {
    if (event.type === 'text_delta' && event.text) text += event.text
    if (event.type === 'error') throw new Error(event.error || 'Upstream error')
    if (event.type === 'done') usage = event.usage
  }
  return { text, usage }
}
