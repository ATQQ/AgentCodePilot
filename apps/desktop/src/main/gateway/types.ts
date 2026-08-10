export type WireAdapter = 'openai-chat' | 'anthropic' | 'openai-responses'

/** Protocol endpoint: address + key, plus optional request overrides. Models are provider-shared. */
export interface ProtocolEndpointConfig {
  baseUrl: string
  apiKey: string
  /** Custom headers merged over gateway defaults (explicitly overrides auth headers if set). */
  headers?: Record<string, string>
  /** Default body fields filled only when the request body lacks that key. */
  bodyDefaults?: Record<string, unknown>
}

export type ProtocolEndpointPublic = ProtocolEndpointConfig

/** Which upstream protocol each client channel should use. */
export interface ChannelProtocolBindings {
  claudeCli?: WireAdapter
  claudeDesktop?: WireAdapter
  codex?: WireAdapter
}

export type GatewayChannel = keyof ChannelProtocolBindings

export interface GatewayTakeoverFlags {
  claudeCli: boolean
  claudeDesktop: boolean
  codex: boolean
}

export interface GatewayLoggingSettings {
  /** Default false — process logs are not written until enabled. */
  enabled: boolean
  /** Separate HTTP viewer port (default 3457). */
  viewerPort: number
  /** Auto-open browser when enabling the viewer. */
  openBrowser: boolean
}

export interface GatewaySettings {
  enabled: boolean
  host: string
  port: number
  token: string
  defaultProviderId?: string
  /** Per-channel upstream protocol (openai-chat / anthropic / openai-responses). */
  channelProtocols: ChannelProtocolBindings
  takeover: GatewayTakeoverFlags
  logging: GatewayLoggingSettings
}

/** Runtime server config (subset used by http server). */
export interface GatewayConfig {
  enabled: boolean
  host: string
  port: number
  token: string
}

/**
 * Provider is global.
 * - models / defaultModel / modelMap: configured once for the provider
 * - protocols: baseUrl + apiKey (+ optional headers/bodyDefaults) per wire protocol
 * Channels select which protocol to use against the default provider.
 */
export interface GatewayProviderConfig {
  protocols: Partial<Record<WireAdapter, ProtocolEndpointConfig>>
  /** Preferred / primary protocol for display and legacy type field. */
  adapter: WireAdapter
  /** Convenience mirror of protocols[adapter].baseUrl */
  baseUrl: string
  /** Convenience mirror of protocols[adapter].apiKey */
  apiKey: string
  /** Shared model list for this provider. */
  models?: string[]
  /** Shared default model for this provider. */
  defaultModel?: string
  modelMap?: Record<string, string>
}

export interface GatewayProviderRecord {
  id: string
  name: string
  type: string
  /** When false, provider is hidden from selection and routing. Missing → true. */
  enabled: boolean
  config: GatewayProviderConfig
}

export interface GatewayProviderPublic {
  id: string
  name: string
  type: string
  enabled: boolean
  config: {
    adapter: WireAdapter
    baseUrl: string
    apiKey: string
    models?: string[]
    defaultModel?: string
    modelMap?: Record<string, string>
    hasApiKey: boolean
    protocols: Partial<Record<WireAdapter, ProtocolEndpointPublic & { hasApiKey: boolean }>>
  }
}

export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface UnifiedTurn {
  model: string
  systemPrompt?: string
  messages: UnifiedMessage[]
  stream: boolean
  temperature?: number
  maxTokens?: number
}

/** @deprecated Prefer UnifiedTurn */
export type UnifiedChatRequest = UnifiedTurn

/** Normalized token usage across wire protocols (cache fields optional). */
export interface AdapterUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export interface AdapterEvent {
  type: 'text_delta' | 'done' | 'error'
  text?: string
  error?: string
  usage?: AdapterUsage
  /** Upstream wire usage object as received (avoid truncating nested details). */
  rawUsage?: Record<string, unknown>
}

export interface BuiltUpstreamRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export interface RouteResult {
  provider: GatewayProviderRecord
  protocol: WireAdapter
  endpoint: ProtocolEndpointConfig
  upstreamModel: string
}

export type TakeoverApp = 'claude' | 'claude-desktop' | 'codex'

export interface TakeoverStatus {
  claudeCli: boolean
  claudeDesktop: boolean
  codex: boolean
  backedUpAt: Partial<Record<TakeoverApp, string>>
  proxyBaseUrl: string
  claudeDesktopSupported: boolean
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

export interface OpenAIChatUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: { cached_tokens: number }
}

export interface OpenAIChatResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: OpenAIChatChoice[]
  usage: OpenAIChatUsage
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

export interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: { type: 'text'; text: string }[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | null
  usage: AnthropicUsage
}

export interface ResponsesUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  input_tokens_details?: Record<string, unknown>
  output_tokens_details?: Record<string, unknown>
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface ResponsesInputItem {
  type?: string
  role?: string
  content?: string | Array<{ type?: string; text?: string }>
}

export interface ResponsesRequest {
  model: string
  input?: string | ResponsesInputItem[] | Record<string, unknown>
  instructions?: string | unknown
  stream?: boolean
  temperature?: number
  max_output_tokens?: number
  tools?: unknown[]
  tool_choice?: unknown
  parallel_tool_calls?: boolean
  reasoning?: unknown
  [key: string]: unknown
}
