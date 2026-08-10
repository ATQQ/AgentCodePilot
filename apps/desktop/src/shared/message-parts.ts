import type { MessagePart } from '../preload/types'

export function completeOpenThinking(parts: MessagePart[]): void {
  const last = parts[parts.length - 1]
  if (last?.type === 'thinking' && !last.completed) {
    last.completed = true
  }
}

export function appendThinkingDelta(parts: MessagePart[], delta: string): void {
  if (!delta) return
  const last = parts[parts.length - 1]
  if (last?.type === 'thinking' && !last.completed) {
    last.content += delta
    return
  }
  parts.push({ type: 'thinking', content: delta, completed: false })
}

export function appendTextDelta(parts: MessagePart[], delta: string): void {
  if (!delta) return
  completeOpenThinking(parts)
  const last = parts[parts.length - 1]
  if (last?.type === 'text') {
    last.content += delta
    return
  }
  parts.push({ type: 'text', content: delta })
}

export function appendToolPart(parts: MessagePart[], toolUseId: string): void {
  completeOpenThinking(parts)
  const exists = parts.some((p) => p.type === 'tool' && p.toolUseId === toolUseId)
  if (exists) return
  parts.push({ type: 'tool', toolUseId })
}

export function finalizeMessageParts(parts: MessagePart[]): MessagePart[] {
  completeOpenThinking(parts)
  return parts.map((part) => {
    if (part.type === 'thinking') {
      return { ...part, completed: true }
    }
    return { ...part }
  })
}

export function textContentFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.content)
    .join('')
}

export function partsRevisionKey(parts: MessagePart[] | undefined): string {
  if (!parts?.length) return '0'
  let key = `${parts.length}`
  for (const part of parts) {
    if (part.type === 'thinking') {
      key += `:th${part.content.length}${part.completed ? 'c' : 'o'}`
    } else if (part.type === 'text') {
      key += `:tx${part.content.length}`
    } else {
      key += `:tl${part.toolUseId.slice(-6)}`
    }
  }
  return key
}
