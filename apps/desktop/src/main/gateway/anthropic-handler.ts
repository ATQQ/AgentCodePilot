import { ServerResponse } from 'http'
import type { UnifiedChatRequest, AnthropicResponse } from './types'
import { runAgentForGateway } from './agent-bridge'

export async function handleAnthropicMessages(
  req: UnifiedChatRequest,
  res: ServerResponse
): Promise<void> {
  const id = `msg_${Date.now().toString(36)}`
  const model = req.model || 'claude-code'

  if (req.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    // Send message_start
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

    // Send content_block_start
    res.write(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      })}\n\n`
    )

    try {
      await runAgentForGateway(req, (delta) => {
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

      res.write(
        `event: message_delta\ndata: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 0 }
        })}\n\n`
      )

      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Agent error'
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
    }
    res.end()
  } else {
    try {
      let fullContent = ''
      await runAgentForGateway(req, (delta) => {
        fullContent += delta
      })

      const response: AnthropicResponse = {
        id,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: fullContent }],
        model,
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 }
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
      res.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: errMsg }
        })
      )
    }
  }
}
