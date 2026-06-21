import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { Message } from '@renderer/types'

export type ChatTimelineKind = 'assistant-markdown' | 'assistant-empty' | 'user'

export interface ChatTimelineItem {
  id: string
  kind: ChatTimelineKind
  content?: string
  text?: string
  final?: boolean
  revision?: string
  message: Message
}

export function buildMessageRevision(msg: Message, hasPendingApproval: boolean): string {
  return `${msg.content.length}:${msg.toolCalls?.length ?? 0}:${hasPendingApproval ? 1 : 0}:${msg.stopped ? 1 : 0}`
}

export function mapMessageToTimelineItem(
  msg: Message,
  isMessageStreaming: (id: string) => boolean,
  hasPendingApproval: (id: string) => boolean
): ChatTimelineItem {
  if (msg.role === 'user') {
    return {
      id: msg.id,
      kind: 'user',
      text: msg.content,
      message: msg,
      revision: buildMessageRevision(msg, false)
    }
  }

  const pending = hasPendingApproval(msg.id)
  const revision = buildMessageRevision(msg, pending)
  const final = !isMessageStreaming(msg.id)

  if (msg.content.trim()) {
    return {
      id: msg.id,
      kind: 'assistant-markdown',
      content: msg.content,
      final,
      revision,
      message: msg
    }
  }

  return {
    id: msg.id,
    kind: 'assistant-empty',
    final,
    revision,
    message: msg
  }
}

export function estimateTimelineItemHeight(item: ChatTimelineItem): number {
  const msg = item.message

  if (msg.role === 'user') {
    let height = 72
    if (msg.attachments?.length) {
      height += 80 * msg.attachments.length
    }
    const lines = msg.content.split('\n').length
    return Math.min(1200, height + lines * 20)
  }

  const lines = Math.max(1, msg.content.split('\n').length)
  let height = Math.min(2400, 96 + lines * 18)
  if (msg.toolCalls?.length) {
    height += 48 * msg.toolCalls.length
  }
  if (msg.stopped) height += 28
  return height
}

export function layoutWidthBucket(width: number): number {
  const buckets = [0, 80, 180, 360, 640, 960, 1280]
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (width >= buckets[i]!) return buckets[i]!
  }
  return 0
}

export function useChatTimelineItems(options: {
  messages: MaybeRefOrGetter<Message[] | undefined>
  isMessageStreaming: (messageId: string) => boolean
  hasPendingApproval: (messageId: string) => boolean
}): ComputedRef<ChatTimelineItem[]> {
  return computed(() => {
    const messages = toValue(options.messages) ?? []
    return messages.map((msg) =>
      mapMessageToTimelineItem(msg, options.isMessageStreaming, options.hasPendingApproval)
    )
  })
}
