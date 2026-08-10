import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { Message } from '@renderer/types'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import { linkifyBrowserReferences } from '@renderer/utils/linkifyBrowserReferences'
import { partsRevisionKey } from '../../../shared/message-parts'

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

function assistantDisplayContent(msg: Message): string {
  if (msg.content.trim()) return msg.content
  if (!msg.parts?.length) return ''
  const thinkingTexts: string[] = []
  for (const part of msg.parts) {
    if (part.type === 'thinking' && part.content.trim()) {
      thinkingTexts.push(part.content)
    }
  }
  return thinkingTexts.join('\n')
}

function hasAssistantTimelineBody(msg: Message): boolean {
  if (msg.content.trim() || msg.toolCalls?.length) return true
  return (
    msg.parts?.some(
      (part) =>
        (part.type === 'thinking' && part.content.trim()) ||
        (part.type === 'text' && part.content.trim()) ||
        part.type === 'tool'
    ) ?? false
  )
}

export function buildMessageRevision(msg: Message, hasPendingApproval: boolean): string {
  return `${msg.content.length}:${msg.toolCalls?.length ?? 0}:${partsRevisionKey(msg.parts)}:${hasPendingApproval ? 1 : 0}:${msg.stopped ? 1 : 0}:${msg.error ? 1 : 0}`
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
  const displayContent = assistantDisplayContent(msg)

  if (displayContent.trim() || hasAssistantTimelineBody(msg)) {
    return {
      id: msg.id,
      kind: 'assistant-markdown',
      content: linkifyBrowserReferences(displayContent || msg.content || ' ', htmlBaseDirs),
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

  if (msg.parts?.length) {
    let height = 96
    const hasProcess = msg.parts.some(
      (part) => (part.type === 'thinking' && part.content.trim()) || part.type === 'tool'
    )
    // After stream ends, process collapses into one fold row.
    if (hasProcess && item.final !== false) {
      height += 32
      for (const part of msg.parts) {
        if (part.type === 'text') {
          height += Math.min(800, Math.max(1, part.content.split('\n').length) * 18)
        }
      }
    } else {
      for (const part of msg.parts) {
        if (part.type === 'thinking') {
          height += part.completed ? 28 : Math.min(240, 24 + part.content.split('\n').length * 16)
        } else if (part.type === 'tool') {
          height += 48
        } else if (part.type === 'text') {
          height += Math.min(800, Math.max(1, part.content.split('\n').length) * 18)
        }
      }
    }
    if (msg.stopped) height += 28
    if (msg.error) height += 28
    return Math.min(2400, height)
  }

  const displayContent = assistantDisplayContent(msg)
  const lines = Math.max(1, displayContent.split('\n').length || msg.content.split('\n').length)
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
