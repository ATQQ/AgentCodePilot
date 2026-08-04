import type { ServerResponse } from 'http'
import type {
  GatewayChannel,
  ResponsesInputItem,
  ResponsesRequest,
  UnifiedMessage,
  UnifiedTurn
} from '../types'
import { routeModel } from '../router'
import { runUnifiedTurn } from '../upstream'
import { consumeEvents, writeJson, writeSseHeaders } from '../bridge/common'
import { appendLogEvent, finishRequestLog, type GatewayRequestLog } from '../request-log'
import { resolveResponsesUsage } from '../usage'

function extractText(content: ResponsesInputItem['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      if (typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
}

export function responsesToUnified(body: ResponsesRequest): UnifiedTurn {
  const messages: UnifiedMessage[] = []
  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input })
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      const role: UnifiedMessage['role'] =
        item.role === 'assistant' || item.role === 'system' || item.role === 'user'
          ? item.role
          : 'user'
      const content = extractText(item.content)
      if (!content && role !== 'user') continue
      messages.push({ role, content: content || '' })
    }
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hello' })
  }

  return {
    model: body.model,
    systemPrompt: typeof body.instructions === 'string' ? body.instructions : undefined,
    messages,
    stream: body.stream ?? false,
    temperature: body.temperature,
    maxTokens: body.max_output_tokens
  }
}

export async function handleResponses(
  body: ResponsesRequest,
  res: ServerResponse,
  signal?: AbortSignal,
  log?: GatewayRequestLog | null,
  channel: GatewayChannel = 'codex'
): Promise<void> {
  const turn = responsesToUnified(body)
  const id = `resp_${Date.now().toString(36)}`
  // Echo the upstream-facing model id (not providerId/modelId) so Codex usage stats match Claude.
  const route = routeModel(turn.model, channel)
  const model = route.upstreamModel

  if (turn.stream) {
    writeSseHeaders(res)

    res.write(
      `event: response.created\ndata: ${JSON.stringify({
        type: 'response.created',
        response: { id, object: 'response', model, status: 'in_progress' }
      })}\n\n`
    )
    res.write(
      `event: response.output_item.added\ndata: ${JSON.stringify({
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: `${id}_msg`, role: 'assistant', content: [] }
      })}\n\n`
    )
    res.write(
      `event: response.content_part.added\ndata: ${JSON.stringify({
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '' }
      })}\n\n`
    )

    let full = ''
    try {
      const { usage, rawUsage } = await consumeEvents(
        runUnifiedTurn(turn, signal, log, channel),
        (delta) => {
          full += delta
          res.write(
            `event: response.output_text.delta\ndata: ${JSON.stringify({
              type: 'response.output_text.delta',
              output_index: 0,
              content_index: 0,
              delta
            })}\n\n`
          )
        }
      )

      const responsesUsage = resolveResponsesUsage(usage, rawUsage)
      if (!responsesUsage) {
        appendLogEvent(
          log ?? null,
          'usage_missing',
          'usage 未解析到，未写入全 0（避免污染 Codex rollout）'
        )
      }

      res.write(
        `event: response.output_text.done\ndata: ${JSON.stringify({
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          text: full
        })}\n\n`
      )
      res.write(
        `event: response.content_part.done\ndata: ${JSON.stringify({
          type: 'response.content_part.done',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: full }
        })}\n\n`
      )
      res.write(
        `event: response.output_item.done\ndata: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            id: `${id}_msg`,
            role: 'assistant',
            content: [{ type: 'output_text', text: full }]
          }
        })}\n\n`
      )
      const completedResponse: Record<string, unknown> = {
        id,
        object: 'response',
        model,
        status: 'completed',
        output: [
          {
            type: 'message',
            id: `${id}_msg`,
            role: 'assistant',
            content: [{ type: 'output_text', text: full }]
          }
        ]
      }
      // Only attach usage when real — fabricated zeros pollute Codex token_count.
      if (responsesUsage) completedResponse.usage = responsesUsage
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: completedResponse
        })}\n\n`
      )
      finishRequestLog(log ?? null, 'ok', { usage, responseBody: full })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Upstream error'
      res.write(
        `event: response.failed\ndata: ${JSON.stringify({
          type: 'response.failed',
          response: {
            id,
            object: 'response',
            model,
            status: 'failed',
            error: { message: errMsg }
          }
        })}\n\n`
      )
      finishRequestLog(log ?? null, 'error', { error: errMsg })
    }
    res.end()
    return
  }

  try {
    let fullContent = ''
    const { usage, rawUsage } = await consumeEvents(
      runUnifiedTurn(turn, signal, log, channel),
      (delta) => {
        fullContent += delta
      }
    )
    const responsesUsage = resolveResponsesUsage(usage, rawUsage)
    if (!responsesUsage) {
      appendLogEvent(
        log ?? null,
        'usage_missing',
        'usage 未解析到，未写入全 0（避免污染 Codex rollout）'
      )
    }
    const bodyJson: Record<string, unknown> = {
      id,
      object: 'response',
      model,
      status: 'completed',
      output: [
        {
          type: 'message',
          id: `${id}_msg`,
          role: 'assistant',
          content: [{ type: 'output_text', text: fullContent }]
        }
      ]
    }
    if (responsesUsage) bodyJson.usage = responsesUsage
    writeJson(res, 200, bodyJson)
    finishRequestLog(log ?? null, 'ok', { usage, responseBody: fullContent })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Upstream error'
    writeJson(res, 500, {
      error: { message: errMsg, type: 'server_error' }
    })
    finishRequestLog(log ?? null, 'error', { error: errMsg })
  }
}
