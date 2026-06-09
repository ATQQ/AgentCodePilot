import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Conversation, Message } from '@renderer/types'
import { mockConversations } from '@renderer/mock/data'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>(
    mockConversations.map((c) => ({
      id: c.id,
      title: c.title,
      agentId: 'claude-code',
      projectId: c.projectId,
      messages: [],
      createdAt: c.updatedAt,
      updatedAt: c.updatedAt
    }))
  )
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

  function createConversation(agentId: string, firstMessage: string, projectId?: string | null): string {
    const id = `conv-${Date.now()}`
    const now = new Date().toISOString()
    const title = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '')
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: firstMessage,
      createdAt: now
    }
    conversations.value.unshift({
      id,
      title,
      agentId,
      projectId: projectId ?? null,
      messages: [msg],
      createdAt: now,
      updatedAt: now
    })
    activeConversationId.value = id
    return id
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

  return {
    conversations,
    activeConversationId,
    activeConversation,
    conversationList,
    getConversationsByProject,
    setActive,
    createConversation,
    addMessage
  }
})
