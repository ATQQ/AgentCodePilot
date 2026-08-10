import type {
  AdapterEvent,
  BuiltUpstreamRequest,
  ProtocolEndpointConfig,
  UnifiedTurn
} from '../types'

export interface ProviderAdapter {
  readonly name: WireAdapterName
  buildRequest(
    turn: UnifiedTurn,
    endpoint: ProtocolEndpointConfig,
    upstreamModel: string
  ): BuiltUpstreamRequest
  parseStream(response: Response): AsyncGenerator<AdapterEvent>
  parseJson(response: Response): Promise<AdapterEvent[]>
}

export type WireAdapterName = 'openai-chat' | 'anthropic'

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  // Providers often ship a versioned root already (`.../v1`, Volces `.../v3`).
  // Adapters append `/v1/chat/completions` or `/v1/messages`; strip that leading
  // `/v1` so we get `.../v3/chat/completions` instead of `.../v3/v1/chat/completions`.
  if (/\/v\d+$/i.test(base) && /^\/v1(\/|$)/i.test(suffix)) {
    const rest = suffix.replace(/^\/v1/i, '')
    return `${base}${rest || '/'}`
  }
  return `${base}${suffix}`
}

export async function* parseSseLines(response: Response): AsyncGenerator<string> {
  if (!response.body) return
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
      if (trimmed.startsWith('data:')) {
        yield trimmed.slice(5).trimStart()
      }
    }
  }

  if (buffer.trim().startsWith('data:')) {
    yield buffer.trim().slice(5).trimStart()
  }
}
