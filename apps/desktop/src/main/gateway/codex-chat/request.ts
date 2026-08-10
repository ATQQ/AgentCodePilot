/**
 * Responses → Chat Completions request conversion.
 * Ported from cc-switch transform_codex_chat.rs (responses_to_chat_completions*).
 */

import {
  appendReasoningContent,
  canonicalJsonString,
  canonicalizeJsonStringIfParseable,
  extractReasoningFieldText,
  extractReasoningSummaryText
} from './common'
import {
  buildCodexToolContextFromRequest,
  CUSTOM_TOOL_INPUT_FIELD,
  CodexToolContext,
  responsesToolChoiceToChat,
  TOOL_SEARCH_PROXY_NAME
} from './tools'

const EXTRA_CHAT_PASSTHROUGH_FIELDS = [
  'frequency_penalty',
  'logit_bias',
  'logprobs',
  'metadata',
  'n',
  'parallel_tool_calls',
  'presence_penalty',
  'response_format',
  'seed',
  'service_tier',
  'stop',
  'stream_options',
  'top_logprobs',
  'user'
] as const

export interface ResponsesToChatResult {
  chatBody: Record<string, unknown>
  toolContext: CodexToolContext
}

export function responsesToChatCompletions(body: Record<string, unknown>): ResponsesToChatResult {
  const toolContext = buildCodexToolContextFromRequest(body)
  const result: Record<string, unknown> = {}

  if (body.model !== undefined) result.model = body.model

  const messages: Record<string, unknown>[] = []
  if (body.instructions !== undefined) {
    const instructions = instructionText(body.instructions)
    if (instructions) messages.push({ role: 'system', content: instructions })
  }
  if (body.input !== undefined) {
    appendResponsesInputAsChatMessages(body.input, messages, toolContext)
  }
  result.messages = collapseSystemMessagesToHead(messages)

  const model = typeof body.model === 'string' ? body.model : ''
  if (body.max_output_tokens !== undefined) {
    if (isOpenAiOSeries(model)) result.max_completion_tokens = body.max_output_tokens
    else result.max_tokens = body.max_output_tokens
  }
  if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens
  if (body.max_completion_tokens !== undefined) {
    result.max_completion_tokens = body.max_completion_tokens
  }

  for (const key of ['temperature', 'top_p', 'stream'] as const) {
    if (body[key] !== undefined) result[key] = body[key]
  }

  applySimpleReasoningOptions(result, body, model)

  const tools = toolContext.chatToolsList()
  if (tools.length > 0) result.tools = tools

  if (body.tool_choice !== undefined) {
    result.tool_choice = responsesToolChoiceToChat(body.tool_choice, toolContext)
  }

  for (const key of EXTRA_CHAT_PASSTHROUGH_FIELDS) {
    if (body[key] !== undefined) result[key] = body[key]
  }

  const hasTools = Array.isArray(result.tools) && result.tools.length > 0
  if (!hasTools) {
    delete result.tool_choice
    delete result.parallel_tool_calls
  }

  injectOpenAiStreamIncludeUsage(result)

  return { chatBody: result, toolContext }
}

function instructionText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: string }).text === 'string'
        ) {
          return (part as { text: string }).text
        }
        return ''
      })
      .filter((s) => s.length > 0)
      .join('\n\n')
  }
  return typeof value === 'string' ? value : ''
}

function isOpenAiOSeries(model: string): boolean {
  const m = model.toLowerCase()
  return (
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    /(^|\/)o1\b/.test(m) ||
    /(^|\/)o3\b/.test(m) ||
    /(^|\/)o4\b/.test(m)
  )
}

function supportsReasoningEffort(model: string): boolean {
  const m = model.toLowerCase()
  return (
    isOpenAiOSeries(m) ||
    m.includes('gpt-5') ||
    m.includes('deepseek') ||
    m.includes('grok') ||
    m.includes('kimi') ||
    m.includes('moonshot')
  )
}

function applySimpleReasoningOptions(
  result: Record<string, unknown>,
  body: Record<string, unknown>,
  model: string
): void {
  if (!supportsReasoningEffort(model)) return
  const reasoning = body.reasoning
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return
  const effort = (reasoning as Record<string, unknown>).effort
  if (typeof effort === 'string' && effort.trim()) {
    const lowered = effort.trim().toLowerCase()
    if (lowered === 'none' || lowered === 'off' || lowered === 'disabled') return
    result.reasoning_effort = effort
  }
}

function injectOpenAiStreamIncludeUsage(result: Record<string, unknown>): void {
  if (result.stream !== true) return
  const existing =
    result.stream_options &&
    typeof result.stream_options === 'object' &&
    !Array.isArray(result.stream_options)
      ? ({ ...(result.stream_options as Record<string, unknown>) } as Record<string, unknown>)
      : {}
  if (existing.include_usage === undefined) existing.include_usage = true
  result.stream_options = existing
}

function collapseSystemMessagesToHead(
  messages: Record<string, unknown>[]
): Record<string, unknown>[] {
  const systemChunks: string[] = []
  const rest: Record<string, unknown>[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        systemChunks.push(msg.content)
      }
      continue
    }
    rest.push(msg)
  }
  if (systemChunks.length === 0) return rest
  return [{ role: 'system', content: systemChunks.join('\n\n') }, ...rest]
}

function appendResponsesInputAsChatMessages(
  input: unknown,
  messages: Record<string, unknown>[],
  toolContext: CodexToolContext
): void {
  const pendingToolCalls: Record<string, unknown>[] = []
  let pendingReasoning: string | undefined
  let lastAssistantIndex: number | undefined

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input })
    return
  }

  const items = Array.isArray(input) ? input : input && typeof input === 'object' ? [input] : []

  for (const item of items) {
    appendResponsesItemAsChatMessage(
      item,
      messages,
      pendingToolCalls,
      () => pendingReasoning,
      (v) => {
        pendingReasoning = v
      },
      () => lastAssistantIndex,
      (v) => {
        lastAssistantIndex = v
      },
      toolContext
    )
  }

  flushPendingToolCalls(
    messages,
    pendingToolCalls,
    () => pendingReasoning,
    (v) => {
      pendingReasoning = v
    },
    (v) => {
      lastAssistantIndex = v
    }
  )
  attachPendingReasoningToPreviousAssistant(messages, lastAssistantIndex, () => {
    const v = pendingReasoning
    pendingReasoning = undefined
    return v
  })
  backfillToolCallReasoningPlaceholders(messages)
}

function appendResponsesItemAsChatMessage(
  item: unknown,
  messages: Record<string, unknown>[],
  pendingToolCalls: Record<string, unknown>[],
  getPendingReasoning: () => string | undefined,
  setPendingReasoning: (v: string | undefined) => void,
  getLastAssistantIndex: () => number | undefined,
  setLastAssistantIndex: (v: number | undefined) => void,
  toolContext: CodexToolContext
): void {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return
  const obj = item as Record<string, unknown>
  const itemType = typeof obj.type === 'string' ? obj.type : undefined

  if (itemType === 'function_call') {
    appendUniquePendingReasoning(
      getPendingReasoning,
      setPendingReasoning,
      extractReasoningFieldText(obj)
    )
    pendingToolCalls.push(responsesFunctionCallToChatToolCall(obj, toolContext))
    return
  }
  if (itemType === 'custom_tool_call') {
    appendUniquePendingReasoning(
      getPendingReasoning,
      setPendingReasoning,
      extractReasoningFieldText(obj)
    )
    pendingToolCalls.push(responsesCustomToolCallToChatToolCall(obj))
    return
  }
  if (itemType === 'tool_search_call') {
    appendUniquePendingReasoning(
      getPendingReasoning,
      setPendingReasoning,
      extractReasoningFieldText(obj)
    )
    pendingToolCalls.push(responsesToolSearchCallToChatToolCall(obj))
    return
  }
  if (itemType === 'function_call_output') {
    flushPendingToolCalls(
      messages,
      pendingToolCalls,
      getPendingReasoning,
      setPendingReasoning,
      setLastAssistantIndex
    )
    const callId = typeof obj.call_id === 'string' ? obj.call_id : ''
    const output =
      typeof obj.output === 'string'
        ? canonicalizeJsonStringIfParseable(obj.output)
        : obj.output !== undefined
          ? canonicalJsonString(obj.output)
          : ''
    messages.push({ role: 'tool', tool_call_id: callId, content: output })
    return
  }
  if (itemType === 'custom_tool_call_output' || itemType === 'tool_search_output') {
    flushPendingToolCalls(
      messages,
      pendingToolCalls,
      getPendingReasoning,
      setPendingReasoning,
      setLastAssistantIndex
    )
    const callId = typeof obj.call_id === 'string' ? obj.call_id : ''
    messages.push({
      role: 'tool',
      tool_call_id: callId,
      content: canonicalJsonString(obj)
    })
    return
  }
  if (itemType === 'reasoning') {
    appendPendingReasoning(
      getPendingReasoning,
      setPendingReasoning,
      extractReasoningSummaryText(obj)
    )
    return
  }

  const isMessageLike =
    itemType === 'message' ||
    itemType === 'input_text' ||
    itemType === 'input_image' ||
    itemType === 'input_file' ||
    itemType === 'input_audio' ||
    obj.role !== undefined ||
    obj.content !== undefined

  if (!isMessageLike) {
    if (pendingToolCalls.length > 0) {
      flushPendingToolCalls(
        messages,
        pendingToolCalls,
        getPendingReasoning,
        setPendingReasoning,
        setLastAssistantIndex
      )
    }
    return
  }

  flushPendingToolCalls(
    messages,
    pendingToolCalls,
    getPendingReasoning,
    setPendingReasoning,
    setLastAssistantIndex
  )

  if (
    itemType === 'input_text' ||
    itemType === 'input_image' ||
    itemType === 'input_file' ||
    itemType === 'input_audio'
  ) {
    const role = responsesRoleToChatRole(typeof obj.role === 'string' ? obj.role : 'user')
    const message: Record<string, unknown> = {
      role,
      content: responsesContentToChatContent(role, [obj])
    }
    if (role === 'assistant') {
      attachPendingReasoningToAssistant(message, getPendingReasoning, setPendingReasoning)
      setLastAssistantIndex(messages.length)
      messages.push(message)
      return
    }
    attachPendingReasoningToPreviousAssistant(messages, getLastAssistantIndex(), () => {
      const v = getPendingReasoning()
      setPendingReasoning(undefined)
      return v
    })
    updateLastAssistantIndex(messages, message, setLastAssistantIndex)
    messages.push(message)
    return
  }

  const message = responsesMessageItemToChatMessage(
    obj,
    getPendingReasoning,
    setPendingReasoning,
    messages,
    getLastAssistantIndex()
  )
  updateLastAssistantIndex(messages, message, setLastAssistantIndex)
  messages.push(message)
}

function flushPendingToolCalls(
  messages: Record<string, unknown>[],
  pendingToolCalls: Record<string, unknown>[],
  getPendingReasoning: () => string | undefined,
  setPendingReasoning: (v: string | undefined) => void,
  setLastAssistantIndex: (v: number | undefined) => void
): void {
  if (pendingToolCalls.length === 0) return
  const message: Record<string, unknown> = {
    role: 'assistant',
    content: null,
    tool_calls: pendingToolCalls.splice(0, pendingToolCalls.length)
  }
  attachPendingReasoningToAssistant(message, getPendingReasoning, setPendingReasoning)
  setLastAssistantIndex(messages.length)
  messages.push(message)
}

function responsesMessageItemToChatMessage(
  item: Record<string, unknown>,
  getPendingReasoning: () => string | undefined,
  setPendingReasoning: (v: string | undefined) => void,
  messages: Record<string, unknown>[],
  lastAssistantIndex: number | undefined
): Record<string, unknown> {
  const role = typeof item.role === 'string' ? item.role : 'user'
  const chatRole = responsesRoleToChatRole(role)
  const content =
    item.content !== undefined ? responsesContentToChatContent(chatRole, item.content) : null
  const message: Record<string, unknown> = { role: chatRole, content }

  if (chatRole === 'assistant') {
    appendPendingReasoning(
      getPendingReasoning,
      setPendingReasoning,
      extractReasoningFieldText(item)
    )
    attachPendingReasoningToAssistant(message, getPendingReasoning, setPendingReasoning)
  } else {
    attachPendingReasoningToPreviousAssistant(messages, lastAssistantIndex, () => {
      const v = getPendingReasoning()
      setPendingReasoning(undefined)
      return v
    })
  }
  return message
}

function responsesRoleToChatRole(role: string): string {
  switch (role) {
    case 'system':
    case 'developer':
      return 'system'
    case 'assistant':
      return 'assistant'
    case 'tool':
      return 'tool'
    case 'user':
    case 'latest_reminder':
    default:
      return 'user'
  }
}

function updateLastAssistantIndex(
  messages: Record<string, unknown>[],
  message: Record<string, unknown>,
  setLastAssistantIndex: (v: number | undefined) => void
): void {
  if (message.role === 'assistant') setLastAssistantIndex(messages.length)
  else if (message.role !== 'tool') setLastAssistantIndex(undefined)
}

function appendPendingReasoning(
  getPendingReasoning: () => string | undefined,
  setPendingReasoning: (v: string | undefined) => void,
  reasoning: string | undefined
): void {
  const trimmed = reasoning?.trim()
  if (!trimmed) return
  const existing = getPendingReasoning()
  setPendingReasoning(existing && existing.length > 0 ? `${existing}\n\n${trimmed}` : trimmed)
}

function appendUniquePendingReasoning(
  getPendingReasoning: () => string | undefined,
  setPendingReasoning: (v: string | undefined) => void,
  reasoning: string | undefined
): void {
  const trimmed = reasoning?.trim()
  if (!trimmed) return
  const existing = getPendingReasoning()
  if (existing?.includes(trimmed)) return
  setPendingReasoning(existing && existing.length > 0 ? `${existing}\n\n${trimmed}` : trimmed)
}

function attachPendingReasoningToAssistant(
  message: Record<string, unknown>,
  getPendingReasoning: () => string | undefined,
  setPendingReasoning: (v: string | undefined) => void
): void {
  const reasoning = getPendingReasoning()
  setPendingReasoning(undefined)
  if (!reasoning?.trim()) return
  appendReasoningContent(message, reasoning)
}

function attachPendingReasoningToPreviousAssistant(
  messages: Record<string, unknown>[],
  lastAssistantIndex: number | undefined,
  takePending: () => string | undefined
): void {
  const reasoning = takePending()?.trim()
  if (!reasoning) return
  if (lastAssistantIndex === undefined) return
  const message = messages[lastAssistantIndex]
  if (!message || message.role !== 'assistant') return
  appendReasoningContent(message, reasoning)
}

function backfillToolCallReasoningPlaceholders(messages: Record<string, unknown>[]): void {
  for (const message of messages) {
    const isAssistantToolCall =
      message.role === 'assistant' &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0
    if (!isAssistantToolCall) continue
    const hasReasoning =
      typeof message.reasoning_content === 'string' && message.reasoning_content.trim().length > 0
    if (!hasReasoning) message.reasoning_content = 'tool call'
  }
}

function responsesContentToChatContent(role: string, content: unknown): unknown {
  void role
  if (content === null || typeof content === 'string') return content
  if (!Array.isArray(content)) return content

  const chatParts: Record<string, unknown>[] = []
  let hasNonText = false

  for (const part of content) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) continue
    const p = part as Record<string, unknown>
    const partType = typeof p.type === 'string' ? p.type : ''
    switch (partType) {
      case 'input_text':
      case 'output_text':
      case 'text':
        if (typeof p.text === 'string' && p.text.length > 0) {
          chatParts.push({ type: 'text', text: p.text })
        }
        break
      case 'refusal':
        if (typeof p.refusal === 'string' && p.refusal.length > 0) {
          chatParts.push({ type: 'text', text: p.refusal })
        }
        break
      case 'input_image':
        if (p.image_url !== undefined) {
          const imageUrl =
            p.image_url && typeof p.image_url === 'object'
              ? p.image_url
              : { url: typeof p.image_url === 'string' ? p.image_url : '' }
          chatParts.push({ type: 'image_url', image_url: imageUrl })
          hasNonText = true
        }
        break
      case 'input_file':
        chatParts.push({ type: 'file', file: p.file ?? p })
        hasNonText = true
        break
      case 'input_audio':
        if (p.input_audio !== undefined) {
          chatParts.push({ type: 'input_audio', input_audio: p.input_audio })
          hasNonText = true
        }
        break
      default:
        break
    }
  }

  if (!hasNonText) {
    return chatParts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('\n')
  }
  return chatParts
}

function responsesFunctionCallToChatToolCall(
  item: Record<string, unknown>,
  toolContext: CodexToolContext
): Record<string, unknown> {
  const callId =
    (typeof item.call_id === 'string' && item.call_id) ||
    (typeof item.id === 'string' && item.id) ||
    ''
  const name = typeof item.name === 'string' ? item.name : ''
  const namespace = typeof item.namespace === 'string' ? item.namespace : undefined
  const chatName = toolContext.chatNameForResponseFunction(name, namespace)
  const args =
    typeof item.arguments === 'string'
      ? item.arguments
      : item.arguments !== undefined
        ? canonicalJsonString(item.arguments)
        : '{}'
  return {
    id: callId,
    type: 'function',
    function: { name: chatName, arguments: args }
  }
}

function responsesCustomToolCallToChatToolCall(
  item: Record<string, unknown>
): Record<string, unknown> {
  const callId =
    (typeof item.call_id === 'string' && item.call_id) ||
    (typeof item.id === 'string' && item.id) ||
    ''
  const name = typeof item.name === 'string' ? item.name : ''
  const input = typeof item.input === 'string' ? item.input : canonicalJsonString(item.input ?? '')
  return {
    id: callId,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify({ [CUSTOM_TOOL_INPUT_FIELD]: input })
    }
  }
}

function responsesToolSearchCallToChatToolCall(
  item: Record<string, unknown>
): Record<string, unknown> {
  const callId =
    (typeof item.call_id === 'string' && item.call_id) ||
    (typeof item.id === 'string' && item.id) ||
    ''
  const args =
    typeof item.arguments === 'string'
      ? item.arguments
      : item.arguments !== undefined
        ? canonicalJsonString(item.arguments)
        : '{}'
  return {
    id: callId,
    type: 'function',
    function: { name: TOOL_SEARCH_PROXY_NAME, arguments: args }
  }
}
