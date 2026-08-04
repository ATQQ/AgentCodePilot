/** Shared helpers ported from cc-switch codex_chat_common.rs */

import { createHash } from 'crypto'

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

export function extractReasoningFieldText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const obj = value as Record<string, unknown>

  for (const key of ['reasoning_content', 'reasoning'] as const) {
    const text = obj[key]
    if (typeof text === 'string' && text.length > 0) return text
  }

  if (obj.reasoning && typeof obj.reasoning === 'object' && !Array.isArray(obj.reasoning)) {
    const reasoning = obj.reasoning as Record<string, unknown>
    for (const key of ['content', 'text', 'summary'] as const) {
      const text = reasoning[key]
      if (typeof text === 'string' && text.length > 0) return text
    }
  }

  if (obj.reasoning_details !== undefined) {
    const text = extractReasoningDetailsText(obj.reasoning_details)
    if (text) return text
  }

  return undefined
}

function extractReasoningDetailsText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined
  if (Array.isArray(value)) {
    const text = value
      .map(extractReasoningDetailPartText)
      .filter((t): t is string => Boolean(t && t.length > 0))
      .join('\n\n')
    return text.length > 0 ? text : undefined
  }
  if (value && typeof value === 'object') {
    return extractReasoningDetailPartText(value)
  }
  return undefined
}

function extractReasoningDetailPartText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const obj = value as Record<string, unknown>
  for (const key of ['text', 'content', 'summary'] as const) {
    const text = obj[key]
    if (typeof text === 'string' && text.length > 0) return text
  }
  if (Array.isArray(obj.parts)) {
    const text = obj.parts
      .map(extractReasoningDetailPartText)
      .filter((t): t is string => Boolean(t && t.length > 0))
      .join('\n\n')
    return text.length > 0 ? text : undefined
  }
  return undefined
}

export function extractReasoningSummaryText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const obj = value as Record<string, unknown>

  for (const key of ['reasoning_content', 'content', 'text'] as const) {
    const text = obj[key]
    if (typeof text === 'string' && text.length > 0) return text
  }

  const summary = obj.summary
  if (typeof summary === 'string') return summary.length > 0 ? summary : undefined
  if (!Array.isArray(summary)) return undefined

  const text = summary
    .map((part) => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const p = part as Record<string, unknown>
      return (
        (typeof p.text === 'string' && p.text) || (typeof p.content === 'string' && p.content) || ''
      )
    })
    .filter((t) => t.length > 0)
    .join('\n\n')
  return text.length > 0 ? text : undefined
}

export function appendReasoningContent(
  message: Record<string, unknown>,
  reasoning: string
): boolean {
  const trimmed = reasoning.trim()
  if (!trimmed) return false
  const existing = message.reasoning_content
  if (typeof existing === 'string' && existing.length > 0) {
    message.reasoning_content = `${existing}\n\n${trimmed}`
  } else {
    message.reasoning_content = trimmed
  }
  return true
}

export function splitLeadingThinkBlock(text: string): { reasoning: string; answer: string } | null {
  const leadingWsLen = text.length - text.trimStart().length
  const afterWs = text.slice(leadingWsLen)
  if (!afterWs.startsWith(THINK_OPEN_TAG)) return null

  const bodyStart = leadingWsLen + THINK_OPEN_TAG.length
  const closeRelative = text.slice(bodyStart).indexOf(THINK_CLOSE_TAG)
  if (closeRelative < 0) return null
  const closeStart = bodyStart + closeRelative
  const answerStart = closeStart + THINK_CLOSE_TAG.length

  return {
    reasoning: text.slice(bodyStart, closeStart).trim(),
    answer: text.slice(answerStart).replace(/^[\r\n\t ]+/, '')
  }
}

export function stripLeadingThinkOpenTag(text: string): string | null {
  const leadingWsLen = text.length - text.trimStart().length
  const afterWs = text.slice(leadingWsLen)
  if (!afterWs.startsWith(THINK_OPEN_TAG)) return null
  return afterWs.slice(THINK_OPEN_TAG.length).trim()
}

export function canonicalizeJsonStringIfParseable(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value))
  } catch {
    return value
  }
}

export function canonicalJsonString(value: unknown): string {
  if (typeof value === 'string') return canonicalizeJsonStringIfParseable(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function canonicalizeToolArguments(args: string): string {
  return canonicalizeJsonStringIfParseable(args)
}

export function responseFunctionCallItem(input: {
  itemId: string
  status: string
  callId: string
  name: string
  arguments: string
  namespace?: string
  reasoning?: string
}): Record<string, unknown> {
  const item: Record<string, unknown> = {
    id: input.itemId,
    type: 'function_call',
    status: input.status,
    call_id: input.callId,
    name: input.name,
    arguments: input.arguments
  }
  if (input.namespace) item.namespace = input.namespace
  if (input.reasoning?.trim()) item.reasoning_content = input.reasoning.trim()
  return item
}

export function shortSha256Hex(input: string, length = 8): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length)
}
