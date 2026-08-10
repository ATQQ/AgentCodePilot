import type {
  AdapterEvent,
  BuiltUpstreamRequest,
  ProtocolEndpointConfig,
  UnifiedTurn
} from '../types'
import { applyBodyDefaults, applyHeaderOverrides } from '../request-overrides'
import { joinUrl, parseSseLines, type ProviderAdapter } from './base'
import { mapOpenAiUsage } from '../usage'

function toOpenAiMessages(turn: UnifiedTurn): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = []
  if (turn.systemPrompt) {
    messages.push({ role: 'system', content: turn.systemPrompt })
  }
  for (const msg of turn.messages) {
    if (msg.role === 'system') {
      messages.push({ role: 'system', content: msg.content })
    } else {
      messages.push({ role: msg.role, content: msg.content })
    }
  }
  return messages
}

type OpenAiWireUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: Record<string, unknown> | null
  completion_tokens_details?: Record<string, unknown> | null
}

export function createOpenAiChatAdapter(): ProviderAdapter {
  return {
    name: 'openai-chat',

    buildRequest(
      turn: UnifiedTurn,
      endpoint: ProtocolEndpointConfig,
      upstreamModel: string
    ): BuiltUpstreamRequest {
      const body: Record<string, unknown> = {
        model: upstreamModel,
        messages: toOpenAiMessages(turn),
        stream: turn.stream
      }
      if (turn.stream) {
        // OpenAI-compatible upstreams omit usage on SSE unless asked (cc-switch same inject).
        body.stream_options = { include_usage: true }
      }
      if (turn.temperature !== undefined) body.temperature = turn.temperature
      if (turn.maxTokens !== undefined) body.max_tokens = turn.maxTokens

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: turn.stream ? 'text/event-stream' : 'application/json'
      }
      if (endpoint.apiKey?.trim()) {
        headers.Authorization = `Bearer ${endpoint.apiKey.trim()}`
      }

      return {
        url: joinUrl(endpoint.baseUrl, '/v1/chat/completions'),
        headers: applyHeaderOverrides(headers, endpoint.headers),
        body: JSON.stringify(applyBodyDefaults(body, endpoint.bodyDefaults))
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
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
            usage?: OpenAiWireUsage
          }
          const content = json.choices?.[0]?.delta?.content
          if (content) yield { type: 'text_delta', text: content }
          if (json.usage) {
            rawUsage = json.usage as Record<string, unknown>
            usage = mapOpenAiUsage(json.usage)
          }
        } catch {
          // skip malformed chunk
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
          choices?: Array<{ message?: { content?: string } }>
          usage?: OpenAiWireUsage
        }
        const content = json.choices?.[0]?.message?.content ?? ''
        const events: AdapterEvent[] = []
        if (content) events.push({ type: 'text_delta', text: content })
        const rawUsage = json.usage ? (json.usage as Record<string, unknown>) : undefined
        events.push({
          type: 'done',
          usage: json.usage ? mapOpenAiUsage(json.usage) : undefined,
          rawUsage
        })
        return events
      } catch {
        return [{ type: 'error', error: 'Invalid upstream JSON response' }]
      }
    }
  }
}
