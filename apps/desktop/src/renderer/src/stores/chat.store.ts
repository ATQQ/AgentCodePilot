import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Conversation, Message } from '@renderer/types'
import type { AgentEvent } from '../../../preload/types'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const streamingConversationId = ref<string | null>(null)
  const queuedMessages = ref<{ conversationId: string; content: string; agentId: string }[]>([])

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) ?? null
  )

  const isStreaming = computed(() => streamingConversationId.value !== null)

  const currentQueuedMessages = computed(() =>
    queuedMessages.value.filter((m) => m.conversationId === activeConversationId.value)
  )

  const conversationList = computed(() =>
    [...conversations.value].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
  )

  function getConversationsByProject(projectId: string): Conversation[] {
    return conversations.value
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
  }

  function setActive(id: string | null): void {
    activeConversationId.value = id
  }

  async function createConversation(
    agentId: string,
    firstMessage: string,
    projectId?: string | null
  ): Promise<string> {
    const result = await window.agentAPI.chat.createConversation({
      agentId,
      firstMessage,
      projectId
    })

    const now = new Date().toISOString()
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: firstMessage,
      createdAt: now
    }
    conversations.value.unshift({
      id: result.id,
      title: result.title,
      agentId,
      projectId: projectId ?? null,
      messages: [msg],
      createdAt: now,
      updatedAt: now
    })
    activeConversationId.value = result.id
    return result.id
  }

  function addMessage(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return
    const now = new Date().toISOString()
    conv.messages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      createdAt: now
    })
    conv.updatedAt = now
  }

  async function sendMessage(
    conversationId: string,
    content: string,
    agentId: string
  ): Promise<void> {
    if (isStreaming.value) {
      queuedMessages.value.push({ conversationId, content, agentId })
      return
    }
    addMessage(conversationId, 'user', content)
    await window.agentAPI.chat.sendMessage({ conversationId, content, agentId })
  }

  function cancelQueuedMessage(index: number): void {
    const msgs = currentQueuedMessages.value
    if (index < 0 || index >= msgs.length) return
    const target = msgs[index]
    const globalIdx = queuedMessages.value.indexOf(target)
    if (globalIdx !== -1) {
      queuedMessages.value.splice(globalIdx, 1)
    }
  }

  async function stopConversation(conversationId: string): Promise<void> {
    await window.agentAPI.chat.stop(conversationId)
    streamingConversationId.value = null
  }

  function flushQueue(): void {
    if (queuedMessages.value.length === 0) return
    const next = queuedMessages.value.shift()!
    addMessage(next.conversationId, 'user', next.content)
    window.agentAPI.chat.sendMessage({
      conversationId: next.conversationId,
      content: next.content,
      agentId: next.agentId
    })
  }

  function handleAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'message.started': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        streamingConversationId.value = event.conversationId
        conv.messages.push({
          id: event.messageId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString()
        })
        break
      }
      case 'message.delta': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        const msg = conv.messages.find((m) => m.id === event.messageId)
        if (msg) {
          msg.content += event.delta
        }
        break
      }
      case 'message.completed': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          conv.updatedAt = new Date().toISOString()
        }
        if (streamingConversationId.value === event.conversationId) {
          streamingConversationId.value = null
        }
        flushQueue()
        break
      }
      case 'message.error': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          addMessage(event.conversationId, 'assistant', `[Error] ${event.error}`)
        }
        if (streamingConversationId.value === event.conversationId) {
          streamingConversationId.value = null
        }
        flushQueue()
        break
      }
    }
  }

  function initAgentEventListener(): () => void {
    return window.agentAPI.chat.onAgentEvent(handleAgentEvent)
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    streamingConversationId,
    isStreaming,
    currentQueuedMessages,
    conversationList,
    getConversationsByProject,
    setActive,
    createConversation,
    addMessage,
    sendMessage,
    cancelQueuedMessage,
    stopConversation,
    initAgentEventListener
  }
})
