import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Conversation, Message } from '@renderer/types'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) ?? null
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

  async function sendMessage(conversationId: string, content: string): Promise<void> {
    addMessage(conversationId, 'user', content)

    const reply = await window.agentAPI.chat.sendMessage({ conversationId, content })

    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return
    conv.messages.push(reply)
    conv.updatedAt = reply.createdAt
  }

  async function stopConversation(conversationId: string): Promise<void> {
    await window.agentAPI.chat.stop(conversationId)
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    conversationList,
    getConversationsByProject,
    setActive,
    createConversation,
    addMessage,
    sendMessage,
    stopConversation
  }
})
