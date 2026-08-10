import type { ServerResponse } from 'http'
import type { GatewayChannel, OpenAIChatResponse, OpenAIStreamChunk, UnifiedTurn } from '../types'
import { runUnifiedTurn } from '../upstream'
import { consumeEvents, writeJson, writeSseHeaders } from '../bridge/common'
import { finishRequestLog, type GatewayRequestLog } from '../request-log'
import { toOpenAiChatUsage } from '../usage'

export async function handleChatCompletions(
  turn: UnifiedTurn,
  res: ServerResponse,
  signal?: AbortSignal,
  log?: GatewayRequestLog | null,
  channel?: GatewayChannel
): Promise<void> {
  const id = `chatcmpl-${Date.now().toString(36)}`
  const created = Math.floor(Date.now() / 1000)
  const model = turn.model

  if (turn.stream) {
    writeSseHeaders(res)

    const roleChunk: OpenAIStreamChunk = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    }
    res.write(`data: ${JSON.stringify(roleChunk)}\n\n`)

    const sendChunk = (content: string, finishReason: string | null = null): void => {
      const chunk: OpenAIStreamChunk = {
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: content ? { content } : {},
            finish_reason: finishReason as 'stop' | 'length' | null
          }
        ]
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }

    let full = ''
    try {
      const { usage } = await consumeEvents(runUnifiedTurn(turn, signal, log, channel), (delta) => {
        full += delta
        sendChunk(delta)
      })
      if (usage) {
        const usageChunk = {
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: null }],
          usage: toOpenAiChatUsage(usage)
        }
        res.write(`data: ${JSON.stringify(usageChunk)}\n\n`)
      }
      sendChunk('', 'stop')
      res.write('data: [DONE]\n\n')
      finishRequestLog(log ?? null, 'ok', { usage, responseBody: full })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Upstream error'
      sendChunk(`\n[Error: ${errMsg}]`, 'stop')
      res.write('data: [DONE]\n\n')
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

    const response: OpenAIChatResponse = {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: fullContent },
          finish_reason: 'stop'
        }
      ],
      usage: toOpenAiChatUsage(usage)
    }
    writeJson(res, 200, response)
    finishRequestLog(log ?? null, 'ok', { usage, responseBody: fullContent })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Upstream error'
    writeJson(res, 500, { error: { message: errMsg, type: 'server_error', code: null } })
    finishRequestLog(log ?? null, 'error', { error: errMsg })
  }
}
