/**
 * Chat Completions SSE → Responses SSE.
 * Ported from cc-switch streaming_codex_chat.rs.
 */

import {
  canonicalizeToolArguments,
  extractReasoningFieldText,
  splitLeadingThinkBlock,
  stripLeadingThinkOpenTag
} from './common'
import {
  chatUsageToResponsesUsage,
  responseIdFromChatId,
  responseStatusFromFinishReason
} from './response'
import * as sse from './sse'
import {
  CodexToolContext,
  customToolInputFromChatArguments,
  responseToolCallItemFromChatName,
  responseToolCallItemIdFromChatName
} from './tools'

type InlineThinkMode = 'detecting' | 'reasoning' | 'text'

interface TextItemState {
  outputIndex?: number
  itemId: string
  text: string
  added: boolean
  done: boolean
}

interface ReasoningItemState {
  outputIndex?: number
  itemId: string
  text: string
  added: boolean
  done: boolean
}

interface ToolCallState {
  outputIndex?: number
  itemId: string
  callId: string
  name: string
  arguments: string
  reasoningContent: string
  added: boolean
  done: boolean
}

function emptyText(): TextItemState {
  return { itemId: '', text: '', added: false, done: false }
}

function emptyReasoning(): ReasoningItemState {
  return { itemId: '', text: '', added: false, done: false }
}

export class ChatToResponsesStream {
  private responseStarted = false
  private completed = false
  private responseId = 'resp_agent_desktop'
  private model = ''
  private createdAt = 0
  private nextOutputIndex = 0
  private text = emptyText()
  private reasoning = emptyReasoning()
  private inlineThink: { mode: InlineThinkMode; buffer: string } = {
    mode: 'detecting',
    buffer: ''
  }
  private tools = new Map<number, ToolCallState>()
  private nextToolIndexToAdd = 0
  private outputItems: Array<{ index: number; item: Record<string, unknown> }> = []
  private latestUsage?: Record<string, unknown>
  private finishReason?: string

  constructor(private toolContext: CodexToolContext = new CodexToolContext()) {}

  handleChatChunk(chunk: Record<string, unknown>): string[] {
    const events: string[] = []

    if (typeof chunk.id === 'string') this.responseId = responseIdFromChatId(chunk.id)
    if (typeof chunk.model === 'string' && chunk.model) this.model = chunk.model
    if (typeof chunk.created === 'number') this.createdAt = chunk.created

    events.push(...this.ensureResponseStarted())

    if (chunk.usage && typeof chunk.usage === 'object') {
      this.latestUsage = chatUsageToResponsesUsage(chunk.usage)
    }

    if (chunk.error) {
      events.push(...this.fail(`Upstream error: ${JSON.stringify(chunk.error)}`))
      return events
    }

    const choices = Array.isArray(chunk.choices) ? chunk.choices : []
    const choice = choices[0] as Record<string, unknown> | undefined
    if (!choice) return events

    const delta =
      choice.delta && typeof choice.delta === 'object' && !Array.isArray(choice.delta)
        ? (choice.delta as Record<string, unknown>)
        : undefined

    if (delta) {
      const reasoning = chatDeltaReasoningText(delta)
      if (reasoning) {
        events.push(...this.pushReasoningDelta(reasoning))
        this.appendReasoningToActiveTools(reasoning)
      }

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        events.push(...this.pushContentDelta(delta.content))
      }

      if (Array.isArray(delta.tool_calls)) {
        events.push(...this.flushInlineThinkAtBoundary())
        const reasoningForTool = this.currentReasoningText()
        events.push(...this.finalizeReasoning())
        for (const toolCall of delta.tool_calls) {
          if (!toolCall || typeof toolCall !== 'object') continue
          events.push(
            ...this.pushToolCallDelta(toolCall as Record<string, unknown>, reasoningForTool)
          )
        }
      }
    }

    if (typeof choice.finish_reason === 'string') {
      this.finishReason = choice.finish_reason
    }

    return events
  }

  finish(): string[] {
    if (this.completed) return []
    const events: string[] = []
    events.push(...this.flushInlineThinkAtBoundary())
    events.push(...this.finalizeReasoning())
    events.push(...this.finalizeText())
    events.push(...this.finalizeTools())

    const hasOutput =
      this.outputItems.length > 0 || this.text.text.length > 0 || this.reasoning.text.length > 0

    if (!this.finishReason && !hasOutput) {
      return this.fail('stream_truncated')
    }

    const status = responseStatusFromFinishReason(this.finishReason)
    const response = this.baseResponse(status, this.sortedOutputItems())
    if (status === 'incomplete') {
      response.incomplete_details = { reason: 'max_output_tokens' }
    }
    this.completed = true
    events.push(sse.responseCompleted(response))
    return events
  }

  fail(message: string): string[] {
    if (this.completed) return []
    this.completed = true
    const events = this.ensureResponseStarted()
    const response = this.baseResponse('failed', this.sortedOutputItems())
    response.error = { message, type: 'upstream_error', code: null }
    events.push(sse.responseFailed(response))
    return events
  }

  private ensureResponseStarted(): string[] {
    if (this.responseStarted) return []
    this.responseStarted = true
    const response = this.baseResponse('in_progress', [])
    return [sse.responseCreated(response), sse.responseInProgress(response)]
  }

  private baseResponse(status: string, output: Record<string, unknown>[]): Record<string, unknown> {
    return {
      id: this.responseId,
      object: 'response',
      created_at: this.createdAt || Math.floor(Date.now() / 1000),
      status,
      model: this.model,
      output,
      usage: this.latestUsage ?? {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      }
    }
  }

  private sortedOutputItems(): Record<string, unknown>[] {
    return [...this.outputItems].sort((a, b) => a.index - b.index).map((entry) => entry.item)
  }

  private nextOutputIndexValue(): number {
    const value = this.nextOutputIndex
    this.nextOutputIndex += 1
    return value
  }

  private pushReasoningDelta(delta: string): string[] {
    const events: string[] = []
    if (!this.reasoning.added) {
      const outputIndex = this.nextOutputIndexValue()
      const itemId = `rs_${this.responseId}`
      this.reasoning.outputIndex = outputIndex
      this.reasoning.itemId = itemId
      this.reasoning.added = true
      events.push(sse.reasoningItemAdded(outputIndex, itemId))
      events.push(sse.reasoningSummaryPartAdded(outputIndex, itemId))
    }
    this.reasoning.text += delta
    events.push(
      sse.reasoningSummaryTextDelta(this.reasoning.outputIndex ?? 0, this.reasoning.itemId, delta)
    )
    return events
  }

  private pushTextDelta(delta: string): string[] {
    const events: string[] = []
    if (!this.text.added) {
      const outputIndex = this.nextOutputIndexValue()
      const itemId = `${this.responseId}_msg`
      this.text.outputIndex = outputIndex
      this.text.itemId = itemId
      this.text.added = true
      events.push(sse.messageItemAdded(outputIndex, itemId))
      events.push(sse.messageContentPartAdded(outputIndex, itemId))
    }
    this.text.text += delta
    events.push(sse.outputTextDelta(this.text.outputIndex ?? 0, this.text.itemId, delta))
    return events
  }

  private currentReasoningText(): string | undefined {
    const text = this.reasoning.text.trim()
    return text.length > 0 ? text : undefined
  }

  private appendReasoningToActiveTools(reasoning: string): void {
    const trimmed = reasoning.trim()
    if (!trimmed) return
    for (const state of this.tools.values()) {
      if (!state.reasoningContent) state.reasoningContent = trimmed
    }
  }

  private pushContentDelta(delta: string): string[] {
    if (this.inlineThink.mode === 'text') {
      return [...this.finalizeReasoning(), ...this.pushTextDelta(delta)]
    }
    if (this.inlineThink.mode === 'detecting') {
      this.inlineThink.buffer += delta
      const decision = leadingThinkPrefixDecision(this.inlineThink.buffer)
      if (decision === 'need_more') return []
      if (decision === 'reasoning') {
        this.inlineThink.mode = 'reasoning'
        return this.drainCompleteInlineThink()
      }
      this.inlineThink.mode = 'text'
      const text = this.inlineThink.buffer
      this.inlineThink.buffer = ''
      return [...this.finalizeReasoning(), ...this.pushTextDelta(text)]
    }
    // reasoning
    this.inlineThink.buffer += delta
    return this.drainCompleteInlineThink()
  }

  private drainCompleteInlineThink(): string[] {
    const split = splitLeadingThinkBlock(this.inlineThink.buffer)
    if (!split) return []
    this.inlineThink.mode = 'text'
    this.inlineThink.buffer = ''
    const events: string[] = []
    if (split.reasoning) {
      events.push(...this.pushReasoningDelta(split.reasoning))
      events.push(...this.finalizeReasoning())
    }
    if (split.answer) events.push(...this.pushTextDelta(split.answer))
    return events
  }

  private flushInlineThinkAtBoundary(): string[] {
    if (this.inlineThink.mode === 'text') return []
    if (this.inlineThink.mode === 'detecting') {
      this.inlineThink.mode = 'text'
      const text = this.inlineThink.buffer
      this.inlineThink.buffer = ''
      if (!text) return []
      return [...this.finalizeReasoning(), ...this.pushTextDelta(text)]
    }
    const buffered = this.inlineThink.buffer
    this.inlineThink.buffer = ''
    this.inlineThink.mode = 'text'
    const split = splitLeadingThinkBlock(buffered)
    if (split) {
      const events: string[] = []
      if (split.reasoning) {
        events.push(...this.pushReasoningDelta(split.reasoning))
        events.push(...this.finalizeReasoning())
      }
      if (split.answer) events.push(...this.pushTextDelta(split.answer))
      return events
    }
    const reasoning = stripLeadingThinkOpenTag(buffered) ?? buffered
    if (!reasoning) return []
    return [...this.pushReasoningDelta(reasoning), ...this.finalizeReasoning()]
  }

  private pushToolCallDelta(toolCall: Record<string, unknown>, reasoning?: string): string[] {
    const chatIndex = typeof toolCall.index === 'number' ? toolCall.index : 0
    const idDelta = typeof toolCall.id === 'string' ? toolCall.id : undefined
    const fn =
      toolCall.function &&
      typeof toolCall.function === 'object' &&
      !Array.isArray(toolCall.function)
        ? (toolCall.function as Record<string, unknown>)
        : {}
    const nameDelta = typeof fn.name === 'string' ? fn.name : undefined
    const argsDelta = typeof fn.arguments === 'string' ? fn.arguments : ''

    let state = this.tools.get(chatIndex)
    if (!state) {
      state = {
        itemId: '',
        callId: '',
        name: '',
        arguments: '',
        reasoningContent: '',
        added: false,
        done: false
      }
      this.tools.set(chatIndex, state)
    }

    if (idDelta) state.callId = idDelta
    if (nameDelta) state.name = nameDelta
    if (argsDelta) state.arguments += argsDelta
    if (!state.reasoningContent && reasoning?.trim()) {
      state.reasoningContent = reasoning.trim()
    }

    const events: string[] = []
    const isCustom = this.toolContext.isCustomToolChatName(state.name)
    if (argsDelta && state.added && !isCustom && state.outputIndex !== undefined) {
      events.push(sse.functionCallArgumentsDelta(state.outputIndex, state.itemId, argsDelta))
    }
    events.push(...this.flushReadyToolCalls())
    return events
  }

  private flushReadyToolCalls(): string[] {
    const events: string[] = []
    for (;;) {
      const key = this.nextToolIndexToAdd
      const state = this.tools.get(key)
      if (!state) break
      if (state.added || state.done) {
        this.nextToolIndexToAdd += 1
        continue
      }
      if (!state.callId || !state.name) break

      const assigned = this.nextOutputIndexValue()
      state.added = true
      state.outputIndex = assigned
      state.itemId = responseToolCallItemIdFromChatName(state.callId, state.name, this.toolContext)
      const item = responseToolCallItemFromChatName(
        state.itemId,
        'in_progress',
        state.callId,
        state.name,
        '',
        state.reasoningContent || undefined,
        this.toolContext
      )
      events.push(sse.outputItemAdded(assigned, item))
      if (state.arguments && !this.toolContext.isCustomToolChatName(state.name)) {
        events.push(sse.functionCallArgumentsDelta(assigned, state.itemId, state.arguments))
      }
      this.nextToolIndexToAdd += 1
    }
    return events
  }

  private finalizeReasoning(): string[] {
    if (!this.reasoning.added || this.reasoning.done) return []
    this.reasoning.done = true
    const { events, item } = sse.reasoningClose(
      this.reasoning.outputIndex ?? 0,
      this.reasoning.itemId,
      this.reasoning.text
    )
    this.outputItems.push({ index: this.reasoning.outputIndex ?? 0, item })
    return events
  }

  private finalizeText(): string[] {
    if (!this.text.added || this.text.done) return []
    this.text.done = true
    const { events, item } = sse.messageClose(
      this.text.outputIndex ?? 0,
      this.text.itemId,
      this.text.text
    )
    this.outputItems.push({ index: this.text.outputIndex ?? 0, item })
    return events
  }

  private finalizeTools(): string[] {
    const events: string[] = []
    events.push(...this.flushReadyToolCalls())
    const keys = [...this.tools.keys()].sort((a, b) => a - b)
    for (const key of keys) {
      const state = this.tools.get(key)
      if (!state || state.done || !state.added || state.outputIndex === undefined) continue
      if (!state.name) continue
      state.done = true
      const args = canonicalizeToolArguments(state.arguments || '{}')
      const item = responseToolCallItemFromChatName(
        state.itemId,
        'completed',
        state.callId,
        state.name,
        args,
        state.reasoningContent || undefined,
        this.toolContext
      )
      if (this.toolContext.isCustomToolChatName(state.name)) {
        const input = customToolInputFromChatArguments(args)
        events.push(sse.customToolCallInputDone(state.outputIndex, state.itemId, input))
      } else {
        events.push(sse.functionCallArgumentsDone(state.outputIndex, state.itemId, args))
      }
      events.push(sse.outputItemDone(state.outputIndex, item))
      this.outputItems.push({ index: state.outputIndex, item })
    }
    return events
  }
}

function chatDeltaReasoningText(delta: Record<string, unknown>): string | undefined {
  return extractReasoningFieldText(delta)
}

type ThinkPrefixDecision = 'need_more' | 'reasoning' | 'text'

function leadingThinkPrefixDecision(buffer: string): ThinkPrefixDecision {
  const trimmedStart = buffer.trimStart()
  if (!trimmedStart) return 'need_more'
  if (trimmedStart.startsWith('<think>')) return 'reasoning'
  if ('<think>'.startsWith(trimmedStart) || trimmedStart.startsWith('<')) {
    // still could be forming the open tag
    if (trimmedStart.length < '<think>'.length && '<think>'.startsWith(trimmedStart)) {
      return 'need_more'
    }
  }
  return 'text'
}
