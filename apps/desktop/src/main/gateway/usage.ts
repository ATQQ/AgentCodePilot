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

/** Merge Anthropic wire usage objects (message_start + message_delta), overwriting fields. */
export function mergeAnthropicWireUsage(
  prev: Record<string, unknown> | undefined,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(prev ?? {}) }
  for (const [key, value] of Object.entries(raw)) {
    if (value != null) next[key] = value
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

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Convert upstream Chat/Responses/Anthropic-shaped usage into Codex Responses usage.
 * Preserves nested detail objects (cc-switch chat_usage_to_responses_usage).
 * Returns undefined when raw is missing — never fabricates all-zero usage for Codex.
 */
export function chatWireUsageToResponsesUsage(
  raw: Record<string, unknown> | undefined
): ResponsesUsage | undefined {
  if (!raw) return undefined

  const input_tokens = asNumber(raw.prompt_tokens) ?? asNumber(raw.input_tokens) ?? 0
  const output_tokens = asNumber(raw.completion_tokens) ?? asNumber(raw.output_tokens) ?? 0
  const total_tokens = asNumber(raw.total_tokens) ?? input_tokens + output_tokens

  const out: ResponsesUsage = {
    input_tokens,
    output_tokens,
    total_tokens
  }

  const promptDetails = asObject(raw.prompt_tokens_details) ?? asObject(raw.input_tokens_details)
  if (promptDetails) {
    out.input_tokens_details = { ...promptDetails }
  }

  const completionDetails = asObject(raw.completion_tokens_details)
  const outputDetails = asObject(raw.output_tokens_details)
  if (completionDetails) {
    out.output_tokens_details = { ...completionDetails }
  } else if (outputDetails) {
    out.output_tokens_details = { ...outputDetails }
  }

  const cacheRead = asNumber(raw.cache_read_input_tokens)
  if (cacheRead != null) out.cache_read_input_tokens = cacheRead

  const cacheCreation = asNumber(raw.cache_creation_input_tokens)
  if (cacheCreation != null) out.cache_creation_input_tokens = cacheCreation

  // If Anthropic-style cache fields exist but nested details do not, mirror into details.
  if (!out.input_tokens_details && (cacheRead != null || cacheCreation != null)) {
    out.input_tokens_details = {
      ...(cacheRead != null ? { cached_tokens: cacheRead } : {}),
      ...(cacheCreation != null ? { cache_write_tokens: cacheCreation } : {})
    }
  }

  return out
}

/**
 * Map normalized AdapterUsage to Responses usage.
 * Returns undefined when usage is missing — Codex needs total_tokens when usage
 * is present, not fabricated zeros that pollute rollout token_count.
 */
export function toResponsesUsage(usage: AdapterUsage | undefined): ResponsesUsage | undefined {
  if (!usage) return undefined
  const input_tokens = usage.inputTokens
  const output_tokens = usage.outputTokens
  const out: ResponsesUsage = {
    input_tokens,
    output_tokens,
    total_tokens: input_tokens + output_tokens
  }
  if (usage.cacheReadTokens != null || usage.cacheCreationTokens != null) {
    out.input_tokens_details = {
      ...(usage.cacheReadTokens != null ? { cached_tokens: usage.cacheReadTokens } : {}),
      ...(usage.cacheCreationTokens != null
        ? { cache_write_tokens: usage.cacheCreationTokens }
        : {})
    }
  }
  if (usage.cacheReadTokens != null) {
    out.cache_read_input_tokens = usage.cacheReadTokens
  }
  if (usage.cacheCreationTokens != null) {
    out.cache_creation_input_tokens = usage.cacheCreationTokens
  }
  return out
}

/** Prefer raw wire conversion; fall back to normalized AdapterUsage. */
export function resolveResponsesUsage(
  usage: AdapterUsage | undefined,
  rawUsage: Record<string, unknown> | undefined
): ResponsesUsage | undefined {
  return chatWireUsageToResponsesUsage(rawUsage) ?? toResponsesUsage(usage)
}
