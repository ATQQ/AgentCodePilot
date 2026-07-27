import type { ServerResponse } from 'http'
import type { AnthropicResponse, GatewayChannel, UnifiedTurn } from '../types'
import { runUnifiedTurn } from '../upstream'
import { consumeEvents, writeJson, writeSseHeaders } from '../bridge/common'
import { finishRequestLog, type GatewayRequestLog } from '../request-log'
import { toAnthropicUsage } from '../usage'

export async function handleMessages(
  turn: UnifiedTurn,
  res: ServerResponse,
  signal?: AbortSignal,
  log?: GatewayRequestLog | null,
  channel?: GatewayChannel
): Promise<void> {
  const id = `msg_${Date.now().toString(36)}`
  const model = turn.model

  if (turn.stream) {
    writeSseHeaders(res)

    res.write(
      `event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: {
          id,
          type: 'message',
          role: 'assistant',
          content: [],
          model,
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      })}\n\n`
    )

    res.write(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      })}\n\n`
    )

    let full = ''
    try {
      const { usage } = await consumeEvents(runUnifiedTurn(turn, signal, log, channel), (delta) => {
        full += delta
        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: delta }
          })}\n\n`
        )
      })

      res.write(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: 'content_block_stop',
          index: 0
        })}\n\n`
      )

      // Full usage on message_delta (incl. input + cache) so clients that saw
      // zeros on message_start still get accurate billing fields.
      res.write(
        `event: message_delta\ndata: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: toAnthropicUsage(usage)
        })}\n\n`
      )

      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
      finishRequestLog(log ?? null, 'ok', { usage, responseBody: full })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Upstream error'
      res.write(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: `\n[Error: ${errMsg}]` }
        })}\n\n`
      )
      res.write(
        `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`
      )
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
      finishRequestLog(log ?? null, 'error', { error: errMsg })
    }
    res.end()
    return
  }

  try {
    let fullContent = ''
    const { usage } = await consumeEvents(runUnifiedTurn(turn, signal, log, channel), (delta) => {
      fullContent += delta
    })

    const response: AnthropicResponse = {
      id,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: fullContent }],
      model,
      stop_reason: 'end_turn',
      usage: toAnthropicUsage(usage)
    }
    writeJson(res, 200, response)
    finishRequestLog(log ?? null, 'ok', { usage, responseBody: fullContent })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Upstream error'
    writeJson(res, 500, {
      type: 'error',
      error: { type: 'api_error', message: errMsg }
    })
    finishRequestLog(log ?? null, 'error', { error: errMsg })
  }
}
