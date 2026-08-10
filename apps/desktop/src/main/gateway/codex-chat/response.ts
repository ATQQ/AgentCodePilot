/**
 * Chat Completions → Responses (non-streaming) conversion.
 * Ported from cc-switch transform_codex_chat.rs chat_completion_to_response*.
 */

import {
  canonicalizeToolArguments,
  extractReasoningFieldText,
  splitLeadingThinkBlock
} from './common'
import {
  CodexToolContext,
  responseToolCallItemFromChatName,
  responseToolCallItemIdFromChatName
} from './tools'

export function responseIdFromChatId(id?: string): string {
  if (!id) return `resp_${Date.now().toString(36)}`
  if (id.startsWith('resp_')) return id
  if (id.startsWith('chatcmpl-') || id.startsWith('chatcmpl_')) {
    return `resp_${id.replace(/^chatcmpl[-_]/, '')}`
  }
  return `resp_${id}`
}

export function responseStatusFromFinishReason(reason?: string | null): 'incomplete' | 'completed' {
  return reason === 'length' ? 'incomplete' : 'completed'
}

export function chatUsageToResponsesUsage(usage: unknown): Record<string, unknown> {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    }
  }
  const u = usage as Record<string, unknown>
  const input =
    typeof u.prompt_tokens === 'number'
      ? u.prompt_tokens
      : typeof u.input_tokens === 'number'
        ? u.input_tokens
        : 0
  const output =
    typeof u.completion_tokens === 'number'
      ? u.completion_tokens
      : typeof u.output_tokens === 'number'
        ? u.output_tokens
        : 0
  const total = typeof u.total_tokens === 'number' ? u.total_tokens : input + output

  const result: Record<string, unknown> = {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total
  }

  const details =
    u.prompt_tokens_details && typeof u.prompt_tokens_details === 'object'
      ? (u.prompt_tokens_details as Record<string, unknown>)
      : undefined
  if (typeof details?.cached_tokens === 'number') {
    result.input_tokens_details = { cached_tokens: details.cached_tokens }
    result.cache_read_input_tokens = details.cached_tokens
  }

  const outDetails =
    u.completion_tokens_details && typeof u.completion_tokens_details === 'object'
      ? (u.completion_tokens_details as Record<string, unknown>)
      : undefined
  if (typeof outDetails?.reasoning_tokens === 'number') {
    result.output_tokens_details = { reasoning_tokens: outDetails.reasoning_tokens }
  }

  return result
}

export function chatErrorToResponseError(body?: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const err = (body as Record<string, unknown>).error
    if (err && typeof err === 'object' && !Array.isArray(err)) {
      const e = err as Record<string, unknown>
      return {
        error: {
          message: typeof e.message === 'string' ? e.message : 'Upstream error',
          type: typeof e.type === 'string' ? e.type : 'upstream_error',
          code: e.code ?? null,
          param: e.param ?? null
        }
      }
    }
    if (typeof err === 'string') {
      return { error: { message: err, type: 'upstream_error', code: null, param: null } }
    }
  }
  return {
    error: { message: 'Upstream error', type: 'upstream_error', code: null, param: null }
  }
}

export function chatCompletionToResponse(
  body: Record<string, unknown>,
  toolContext: CodexToolContext = new CodexToolContext()
): Record<string, unknown> {
  const choices = Array.isArray(body.choices) ? body.choices : []
  if (choices.length === 0) throw new Error('No choices in chat response')
  const choice = choices[0] as Record<string, unknown>
  const message =
    choice.message && typeof choice.message === 'object' && !Array.isArray(choice.message)
      ? (choice.message as Record<string, unknown>)
      : null
  if (!message) throw new Error('No message in chat choice')

  const responseId = responseIdFromChatId(typeof body.id === 'string' ? body.id : undefined)
  const model = typeof body.model === 'string' ? body.model : ''
  const createdAt = typeof body.created === 'number' ? body.created : 0
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined

  const reasoning = chatReasoningText(message)
  const output: Record<string, unknown>[] = []
  const reasoningItem = chatReasoningToResponseOutputItem(reasoning, responseId)
  if (reasoningItem) output.push(reasoningItem)
  const messageItem = chatMessageToResponseOutputItem(message, responseId)
  if (messageItem) output.push(messageItem)
  output.push(...chatToolCallsToResponseOutputItems(message, reasoning, toolContext))

  const response: Record<string, unknown> = {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    status: responseStatusFromFinishReason(finishReason),
    model,
    output,
    usage: chatUsageToResponsesUsage(body.usage)
  }
  if (finishReason === 'length') {
    response.incomplete_details = { reason: 'max_output_tokens' }
  }
  return response
}

function chatReasoningText(message: Record<string, unknown>): string | undefined {
  const fromField = extractReasoningFieldText(message)
  if (fromField) return fromField
  if (typeof message.content === 'string') {
    const split = splitLeadingThinkBlock(message.content)
    if (split && split.reasoning.length > 0) return split.reasoning
  }
  return undefined
}

function chatReasoningToResponseOutputItem(
  reasoning: string | undefined,
  responseId: string
): Record<string, unknown> | undefined {
  if (!reasoning || !reasoning.trim()) return undefined
  return {
    id: `rs_${responseId}`,
    type: 'reasoning',
    summary: [{ type: 'summary_text', text: reasoning }]
  }
}

function chatMessageToResponseOutputItem(
  message: Record<string, unknown>,
  responseId: string
): Record<string, unknown> | undefined {
  const content: Record<string, unknown>[] = []

  if (typeof message.content === 'string') {
    const split = splitLeadingThinkBlock(message.content)
    const text = split ? split.answer : message.content
    if (text.length > 0) {
      content.push({ type: 'output_text', text, annotations: [] })
    }
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      const partType = typeof p.type === 'string' ? p.type : ''
      if ((partType === 'text' || partType === 'output_text') && typeof p.text === 'string') {
        if (p.text.length > 0) content.push({ type: 'output_text', text: p.text, annotations: [] })
      } else if (partType === 'refusal' && typeof p.refusal === 'string' && p.refusal.length > 0) {
        content.push({ type: 'refusal', refusal: p.refusal })
      }
    }
  }

  if (typeof message.refusal === 'string' && message.refusal.length > 0) {
    content.push({ type: 'refusal', refusal: message.refusal })
  }

  if (content.length === 0) return undefined
  return {
    id: `${responseId}_msg`,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content
  }
}

function chatToolCallsToResponseOutputItems(
  message: Record<string, unknown>,
  reasoning: string | undefined,
  toolContext: CodexToolContext
): Record<string, unknown>[] {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
  const output: Record<string, unknown>[] = []
  for (const toolCall of toolCalls) {
    if (!toolCall || typeof toolCall !== 'object') continue
    const tc = toolCall as Record<string, unknown>
    const fn =
      tc.function && typeof tc.function === 'object' && !Array.isArray(tc.function)
        ? (tc.function as Record<string, unknown>)
        : {}
    const name = typeof fn.name === 'string' ? fn.name : ''
    if (!name) continue
    const callId = (typeof tc.id === 'string' && tc.id) || `call_${output.length}`
    const argsRaw = typeof fn.arguments === 'string' ? fn.arguments : '{}'
    const args = canonicalizeToolArguments(argsRaw)
    const itemId = responseToolCallItemIdFromChatName(callId, name, toolContext)
    output.push(
      responseToolCallItemFromChatName(
        itemId,
        'completed',
        callId,
        name,
        args,
        reasoning,
        toolContext
      )
    )
  }
  return output
}
