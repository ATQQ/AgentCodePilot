import { ServerResponse } from 'http'
import type { UnifiedChatRequest, OpenAIChatResponse, OpenAIStreamChunk } from './types'
import { runAgentForGateway } from './agent-bridge'

export async function handleOpenAICompletion(
  req: UnifiedChatRequest,
  res: ServerResponse
): Promise<void> {
  const id = `chatcmpl-${Date.now().toString(36)}`
  const created = Math.floor(Date.now() / 1000)
  const model = req.model || 'claude-code'

  if (req.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

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

    // Send initial role chunk
    const roleChunk: OpenAIStreamChunk = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    }
    res.write(`data: ${JSON.stringify(roleChunk)}\n\n`)

    try {
      await runAgentForGateway(req, (delta) => {
        sendChunk(delta)
      })
      sendChunk('', 'stop')
      res.write('data: [DONE]\n\n')
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Agent error'
      sendChunk(`\n[Error: ${errMsg}]`, 'stop')
      res.write('data: [DONE]\n\n')
    }
    res.end()
  } else {
    try {
      let fullContent = ''
      await runAgentForGateway(req, (delta) => {
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
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(JSON.stringify(response))
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Agent error'
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(JSON.stringify({ error: { message: errMsg, type: 'server_error', code: null } }))
    }
  }
}
