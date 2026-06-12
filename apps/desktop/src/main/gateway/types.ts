export interface GatewayConfig {
  enabled: boolean
  host: string
  port: number
  token: string
}

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIChatRequest {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface OpenAIChatChoice {
  index: number
  message: { role: 'assistant'; content: string }
  finish_reason: 'stop' | 'length' | null
}

export interface OpenAIChatResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: OpenAIChatChoice[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface OpenAIStreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: {
    index: number
    delta: { role?: 'assistant'; content?: string }
    finish_reason: 'stop' | 'length' | null
  }[]
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | { type: 'text'; text: string }[]
}

export interface AnthropicRequest {
  model: string
  messages: AnthropicMessage[]
  system?: string
  max_tokens: number
  temperature?: number
  stream?: boolean
}

export interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: { type: 'text'; text: string }[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | null
  usage: { input_tokens: number; output_tokens: number }
}

export interface UnifiedChatRequest {
  model: string
  systemPrompt?: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  stream: boolean
  temperature?: number
  maxTokens?: number
}
