import type { AdapterUsage, AnthropicUsage, OpenAIChatUsage, ResponsesUsage } from './types'

/** Map Anthropic wire usage (partial/null fields) into AdapterUsage, merging over previous. */
export function mergeAnthropicUsage(
  prev: AdapterUsage | undefined,
  raw: {
    input_tokens?: number | null
    output_tokens?: number | null
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
): AdapterUsage {
  const next: AdapterUsage = {
    inputTokens: prev?.inputTokens ?? 0,
    outputTokens: prev?.outputTokens ?? 0,
    cacheReadTokens: prev?.cacheReadTokens,
    cacheCreationTokens: prev?.cacheCreationTokens
  }
  if (raw.input_tokens != null) next.inputTokens = raw.input_tokens
  if (raw.output_tokens != null) next.outputTokens = raw.output_tokens
  if (raw.cache_read_input_tokens != null) next.cacheReadTokens = raw.cache_read_input_tokens
  if (raw.cache_creation_input_tokens != null) {
    next.cacheCreationTokens = raw.cache_creation_input_tokens
  }
  return next
}

export function mapOpenAiUsage(raw: {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
}): AdapterUsage {
  const cached = raw.prompt_tokens_details?.cached_tokens
  return {
    inputTokens: raw.prompt_tokens ?? 0,
    outputTokens: raw.completion_tokens ?? 0,
    ...(cached != null ? { cacheReadTokens: cached } : {})
  }
}

export function toAnthropicUsage(usage: AdapterUsage | undefined): AnthropicUsage {
  const out: AnthropicUsage = {
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0
  }
  if (usage?.cacheCreationTokens != null) {
    out.cache_creation_input_tokens = usage.cacheCreationTokens
  }
  if (usage?.cacheReadTokens != null) {
    out.cache_read_input_tokens = usage.cacheReadTokens
  }
  return out
}

export function toOpenAiChatUsage(usage: AdapterUsage | undefined): OpenAIChatUsage {
  const input = usage?.inputTokens ?? 0
  const output = usage?.outputTokens ?? 0
  const out: OpenAIChatUsage = {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: input + output
  }
  if (usage?.cacheReadTokens != null) {
    out.prompt_tokens_details = { cached_tokens: usage.cacheReadTokens }
  }
  return out
}

/** Codex requires total_tokens; optionally include cached_tokens when present. */
export function toResponsesUsage(usage: AdapterUsage | undefined): ResponsesUsage {
  const input_tokens = usage?.inputTokens ?? 0
  const output_tokens = usage?.outputTokens ?? 0
  const out: ResponsesUsage = {
    input_tokens,
    output_tokens,
    total_tokens: input_tokens + output_tokens
  }
  if (usage?.cacheReadTokens != null) {
    out.input_tokens_details = { cached_tokens: usage.cacheReadTokens }
  }
  return out
}
