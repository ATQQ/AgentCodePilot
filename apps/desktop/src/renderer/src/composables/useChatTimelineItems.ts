import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { Message } from '@renderer/types'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import { linkifyBrowserReferences } from '@renderer/utils/linkifyBrowserReferences'

export type ChatTimelineKind = 'assistant-markdown' | 'assistant-empty' | 'user'

export const USER_MESSAGE_COLLAPSE_LINE_THRESHOLD = 6
export const USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 280
export const USER_MESSAGE_COLLAPSED_LINES = 6

export function isLongUserMessage(content: string): boolean {
  return (
    content.split('\n').length > USER_MESSAGE_COLLAPSE_LINE_THRESHOLD ||
    content.length > USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD
  )
}

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
  return `${msg.content.length}:${msg.toolCalls?.length ?? 0}:${hasPendingApproval ? 1 : 0}:${msg.stopped ? 1 : 0}:${msg.error ? 1 : 0}`
}

export function mapMessageToTimelineItem(
  msg: Message,
  isMessageStreaming: (id: string) => boolean,
  hasPendingApproval: (id: string) => boolean,
  isUserMessageExpanded?: (id: string) => boolean,
  htmlBaseDirs: string[] = []
): ChatTimelineItem {
  if (msg.role === 'user') {
    const expanded = isUserMessageExpanded?.(msg.id) ?? false
    return {
      id: msg.id,
      kind: 'user',
      text: msg.content,
      message: msg,
      revision: `${buildMessageRevision(msg, false)}:exp=${expanded ? 1 : 0}`
    }
  }

  const pending = hasPendingApproval(msg.id)
  const revision = buildMessageRevision(msg, pending)
  const final = !isMessageStreaming(msg.id)

  if (msg.content.trim()) {
    return {
      id: msg.id,
      kind: 'assistant-markdown',
      content: linkifyBrowserReferences(msg.content, htmlBaseDirs),
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

export function estimateTimelineItemHeight(item: ChatTimelineItem, expanded = false): number {
  const msg = item.message

  if (msg.role === 'user') {
    let height = 72
    if (msg.attachments?.length) {
      height += 80 * msg.attachments.length
    }
    const lines = msg.content.split('\n').length
    const long = isLongUserMessage(msg.content)
    if (long && !expanded) {
      return height + USER_MESSAGE_COLLAPSED_LINES * 20 + 28
    }
    return Math.min(1200, height + lines * 20)
  }

  const lines = Math.max(1, msg.content.split('\n').length)
  let height = Math.min(2400, 96 + lines * 18)
  if (msg.toolCalls?.length) {
    height += 48 * msg.toolCalls.length
  }
  if (msg.stopped) height += 28
  if (msg.error) height += 28
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
  isUserMessageExpanded?: (messageId: string) => boolean
}): ComputedRef<ChatTimelineItem[]> {
  const panelContextStore = usePanelContextStore()

  return computed(() => {
    const messages = toValue(options.messages) ?? []
    const htmlBaseDirs = panelContextStore.availableFolders.length
      ? panelContextStore.availableFolders.map((folder) => folder.path)
      : panelContextStore.effectivePanelCwd
        ? [panelContextStore.effectivePanelCwd]
        : []
    return messages.map((msg) =>
      mapMessageToTimelineItem(
        msg,
        options.isMessageStreaming,
        options.hasPendingApproval,
        options.isUserMessageExpanded,
        htmlBaseDirs
      )
    )
  })
}
