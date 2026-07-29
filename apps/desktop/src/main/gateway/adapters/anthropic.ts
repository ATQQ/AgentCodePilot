import type {
  AdapterEvent,
  BuiltUpstreamRequest,
  ProtocolEndpointConfig,
  UnifiedTurn
} from '../types'
import { joinUrl, parseSseLines, type ProviderAdapter } from './base'
import { mergeAnthropicUsage, mergeAnthropicWireUsage } from '../usage'

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

type AnthropicWireUsage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  [key: string]: unknown
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
      let rawUsage: Record<string, unknown> | undefined
      for await (const data of parseSseLines(response)) {
        if (!data) continue
        try {
          const json = JSON.parse(data) as {
            type?: string
            delta?: { type?: string; text?: string }
            usage?: AnthropicWireUsage
            message?: { usage?: AnthropicWireUsage }
          }
          if (json.type === 'content_block_delta' && json.delta?.text) {
            yield { type: 'text_delta', text: json.delta.text }
          }
          if (json.type === 'message_start' && json.message?.usage) {
            usage = mergeAnthropicUsage(usage, json.message.usage)
            rawUsage = mergeAnthropicWireUsage(
              rawUsage,
              json.message.usage as Record<string, unknown>
            )
          }
          if (json.type === 'message_delta' && json.usage) {
            // message_delta values are cumulative — overwrite, do not add
            usage = mergeAnthropicUsage(usage, json.usage)
            rawUsage = mergeAnthropicWireUsage(rawUsage, json.usage as Record<string, unknown>)
          }
        } catch {
          // skip
        }
      }
      yield { type: 'done', usage, rawUsage }
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
          usage?: AnthropicWireUsage
        }
        const content = (json.content ?? [])
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!)
          .join('')
        const events: AdapterEvent[] = []
        if (content) events.push({ type: 'text_delta', text: content })
        const rawUsage = json.usage ? (json.usage as Record<string, unknown>) : undefined
        events.push({
          type: 'done',
          usage: json.usage ? mergeAnthropicUsage(undefined, json.usage) : undefined,
          rawUsage
        })
        return events
      } catch {
        return [{ type: 'error', error: 'Invalid upstream JSON response' }]
      }
    }
  }
}
