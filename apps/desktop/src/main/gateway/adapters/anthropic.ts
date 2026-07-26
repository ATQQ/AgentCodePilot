import type {
  AdapterEvent,
  BuiltUpstreamRequest,
  ProtocolEndpointConfig,
  UnifiedTurn
} from '../types'
import { joinUrl, parseSseLines, type ProviderAdapter } from './base'

function toAnthropicMessages(
  turn: UnifiedTurn
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const msg of turn.messages) {
    if (msg.role === 'system') continue
    messages.push({ role: msg.role, content: msg.content })
  }
  // Anthropic requires alternating roles starting with user
  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hello' })
  }
  return messages
}

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    name: 'anthropic',

    buildRequest(
      turn: UnifiedTurn,
      endpoint: ProtocolEndpointConfig,
      upstreamModel: string
    ): BuiltUpstreamRequest {
      const body: Record<string, unknown> = {
        model: upstreamModel,
        messages: toAnthropicMessages(turn),
        max_tokens: turn.maxTokens ?? 4096,
        stream: turn.stream
      }
      if (turn.systemPrompt) body.system = turn.systemPrompt
      if (turn.temperature !== undefined) body.temperature = turn.temperature

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: turn.stream ? 'text/event-stream' : 'application/json',
        'anthropic-version': '2023-06-01'
      }
      // Native Anthropic uses x-api-key; many coding-plan gateways (e.g. Volces)
      // expect Authorization: Bearer like Claude Code's ANTHROPIC_AUTH_TOKEN.
      const apiKey = endpoint.apiKey?.trim()
      if (apiKey) {
        headers['x-api-key'] = apiKey
        headers.Authorization = `Bearer ${apiKey}`
      }

      return {
        url: joinUrl(endpoint.baseUrl, '/v1/messages'),
        headers,
        body: JSON.stringify(body)
      }
    },

    async *parseStream(response: Response): AsyncGenerator<AdapterEvent> {
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        yield {
          type: 'error',
          error: `Upstream ${response.status}: ${text.slice(0, 500) || response.statusText}`
        }
        return
      }

      let usage: AdapterEvent['usage']
      for await (const data of parseSseLines(response)) {
        if (!data) continue
        try {
          const json = JSON.parse(data) as {
            type?: string
            delta?: { type?: string; text?: string }
            usage?: { input_tokens?: number; output_tokens?: number }
            message?: { usage?: { input_tokens?: number; output_tokens?: number } }
          }
          if (json.type === 'content_block_delta' && json.delta?.text) {
            yield { type: 'text_delta', text: json.delta.text }
          }
          if (json.type === 'message_start' && json.message?.usage) {
            usage = {
              inputTokens: json.message.usage.input_tokens ?? 0,
              outputTokens: json.message.usage.output_tokens ?? 0
            }
          }
          if (json.type === 'message_delta' && json.usage) {
            usage = {
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: json.usage.output_tokens ?? usage?.outputTokens ?? 0
            }
          }
        } catch {
          // skip
        }
      }
      yield { type: 'done', usage }
    },

    async parseJson(response: Response): Promise<AdapterEvent[]> {
      const text = await response.text()
      if (!response.ok) {
        return [
          {
            type: 'error',
            error: `Upstream ${response.status}: ${text.slice(0, 500) || response.statusText}`
          }
        ]
      }
      try {
        const json = JSON.parse(text) as {
          content?: Array<{ type?: string; text?: string }>
          usage?: { input_tokens?: number; output_tokens?: number }
        }
        const content = (json.content ?? [])
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!)
          .join('')
        const events: AdapterEvent[] = []
        if (content) events.push({ type: 'text_delta', text: content })
        events.push({
          type: 'done',
          usage: json.usage
            ? {
                inputTokens: json.usage.input_tokens ?? 0,
                outputTokens: json.usage.output_tokens ?? 0
              }
            : undefined
        })
        return events
      } catch {
        return [{ type: 'error', error: 'Invalid upstream JSON response' }]
      }
    }
  }
}
