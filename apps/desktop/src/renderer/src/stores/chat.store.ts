import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Attachment, Conversation, Message } from '@renderer/types'
import type { AgentEvent, AttachmentPayload } from '../../../preload/types'
import { useWorkspaceStore } from './workspace.store'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const streamingConversationIds = ref<Set<string>>(new Set())
  const waitingConversationIds = ref<Set<string>>(new Set())
  const queuedMessages = ref<{ conversationId: string; content: string; agentId: string }[]>([])

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) ?? null
  )

  const streamingConversationId = computed(() =>
    activeConversationId.value && streamingConversationIds.value.has(activeConversationId.value)
      ? activeConversationId.value
      : null
  )

  const isStreaming = computed(() => streamingConversationId.value !== null)

  function isConversationStreaming(conversationId: string): boolean {
    return streamingConversationIds.value.has(conversationId)
  }

  const currentQueuedMessages = computed(() =>
    queuedMessages.value.filter((m) => m.conversationId === activeConversationId.value)
  )

  const conversationList = computed(() =>
    [...conversations.value].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
  )

  const isWaiting = computed(() =>
    activeConversationId.value !== null && waitingConversationIds.value.has(activeConversationId.value)
  )

  function getConversationsByProject(projectId: string): Conversation[] {
    return conversations.value
      .filter((c) => c.projectId === projectId && !c.archived)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return a.updatedAt > b.updatedAt ? -1 : 1
      })
  }

  function getOrphanConversations(): Conversation[] {
    return conversations.value
      .filter((c) => !c.projectId && !c.archived)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return a.updatedAt > b.updatedAt ? -1 : 1
      })
  }

  async function loadConversations(projectId?: string | null): Promise<void> {
    const list = await window.agentAPI.conversations.list(projectId)
    for (const item of list) {
      const exists = conversations.value.find((c) => c.id === item.id)
      if (!exists) {
        conversations.value.push({
          id: item.id,
          title: item.title,
          agentId: item.agentId,
          projectId: item.projectId,
          cwd: item.cwd,
          pinned: item.pinned,
          archived: item.archived,
          messages: [],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        })
      }
    }
  }

  async function loadMessages(conversationId: string): Promise<void> {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return
    if (conv.messages.length > 0) return
    const msgs = await window.agentAPI.conversations.getMessages(conversationId)
    conv.messages = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      attachments: m.attachments as Attachment[] | undefined,
      usage: m.usage,
      debugInput: m.debugInput,
      debugOutput: m.debugOutput
    }))
  }

  function setActive(id: string | null): void {
    activeConversationId.value = id
    if (id) loadMessages(id)
  }

  async function createConversation(
    agentId: string,
    firstMessage: string,
    projectId?: string | null,
    attachments?: Attachment[]
  ): Promise<string> {
    const result = await window.agentAPI.chat.createConversation({
      agentId,
      firstMessage,
      projectId,
      attachments: toAttachmentPayloads(attachments)
    })

    const now = new Date().toISOString()
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: firstMessage,
      createdAt: now,
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    }
    conversations.value.unshift({
      id: result.id,
      title: result.title,
      agentId,
      projectId: projectId ?? null,
      cwd: result.cwd,
      messages: [msg],
      createdAt: now,
      updatedAt: now
    })
    activeConversationId.value = result.id
    waitingConversationIds.value.add(result.id)
    return result.id
  }

  function addMessage(conversationId: string, role: 'user' | 'assistant', content: string, attachments?: Attachment[]): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return
    const now = new Date().toISOString()
    conv.messages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      createdAt: now,
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    })
    conv.updatedAt = now
  }

  function toAttachmentPayloads(attachments?: Attachment[]): AttachmentPayload[] | undefined {
    if (!attachments || attachments.length === 0) return undefined
    return attachments.map((a) => {
      if (a.type === 'url') return { id: a.id, type: 'url' as const, url: a.url }
      return { id: a.id, type: a.type, name: a.name, path: a.path }
    })
  }

  async function sendMessage(
    conversationId: string,
    content: string,
    agentId: string,
    attachments?: Attachment[]
  ): Promise<void> {
    if (isConversationStreaming(conversationId)) {
      queuedMessages.value.push({ conversationId, content, agentId })
      return
    }
    addMessage(conversationId, 'user', content, attachments)
    waitingConversationIds.value.add(conversationId)
    const conv = conversations.value.find((c) => c.id === conversationId)
    const workspaceStore = useWorkspaceStore()
    const wsFolders = workspaceStore.currentWorkspace?.folders
    await window.agentAPI.chat.sendMessage({
      conversationId,
      content,
      agentId,
      cwd: conv?.cwd || workspaceStore.currentCwd,
      workspaceFolders: wsFolders && wsFolders.length > 1 ? [...wsFolders] : undefined,
      attachments: toAttachmentPayloads(attachments)
    })
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
    streamingConversationIds.value.delete(conversationId)
    flushQueueForConversation(conversationId)
  }

  function flushQueueForConversation(conversationId: string): void {
    const idx = queuedMessages.value.findIndex((m) => m.conversationId === conversationId)
    if (idx === -1) return
    const next = queuedMessages.value.splice(idx, 1)[0]
    addMessage(next.conversationId, 'user', next.content)
    waitingConversationIds.value.add(next.conversationId)
    const conv = conversations.value.find((c) => c.id === next.conversationId)
    const workspaceStore = useWorkspaceStore()
    const wsFolders = workspaceStore.currentWorkspace?.folders
    window.agentAPI.chat.sendMessage({
      conversationId: next.conversationId,
      content: next.content,
      agentId: next.agentId,
      cwd: conv?.cwd || workspaceStore.currentCwd,
      workspaceFolders: wsFolders && wsFolders.length > 1 ? [...wsFolders] : undefined
    })
  }

  function handleAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'message.started': {
        streamingConversationIds.value.add(event.conversationId)
        break
      }
      case 'message.delta': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        waitingConversationIds.value.delete(event.conversationId)
        let msg = conv.messages.find((m) => m.id === event.messageId)
        if (!msg) {
          msg = { id: event.messageId, role: 'assistant', content: '', createdAt: new Date().toISOString() }
          conv.messages.push(msg)
        }
        msg.content += event.delta
        break
      }
      case 'message.completed': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          conv.updatedAt = new Date().toISOString()
          const msg = conv.messages.find((m) => m.id === event.messageId)
          if (msg) {
            if (event.usage) msg.usage = event.usage
            if (event.debugInput) msg.debugInput = event.debugInput
            if (event.debugOutput) msg.debugOutput = event.debugOutput
          }
        }
        streamingConversationIds.value.delete(event.conversationId)
        flushQueueForConversation(event.conversationId)
        break
      }
      case 'message.error': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          addMessage(event.conversationId, 'assistant', `[Error] ${event.error}`)
        }
        waitingConversationIds.value.delete(event.conversationId)
        streamingConversationIds.value.delete(event.conversationId)
        flushQueueForConversation(event.conversationId)
        break
      }
    }
  }

  function togglePin(conversationId: string): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.pinned = !conv.pinned
      window.agentAPI.conversations.update({ id: conversationId, pinned: conv.pinned })
    }
  }

  function renameConversation(conversationId: string, title: string): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.title = title
      window.agentAPI.conversations.update({ id: conversationId, title })
    }
  }

  function archiveConversation(conversationId: string): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.archived = true
      window.agentAPI.conversations.update({ id: conversationId, archived: true })
      if (activeConversationId.value === conversationId) {
        activeConversationId.value = null
      }
    }
  }

  function deleteConversation(conversationId: string): void {
    conversations.value = conversations.value.filter((c) => c.id !== conversationId)
    window.agentAPI.conversations.delete(conversationId)
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null
    }
  }

  function getConversationAsMarkdown(conversationId: string): string {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return ''
    return conv.messages
      .map((m) => `## ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`)
      .join('\n\n---\n\n')
  }

  function initAgentEventListener(): () => void {
    return window.agentAPI.chat.onAgentEvent(handleAgentEvent)
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    streamingConversationId,
    streamingConversationIds,
    isStreaming,
    isWaiting,
    isConversationStreaming,
    currentQueuedMessages,
    conversationList,
    getConversationsByProject,
    getOrphanConversations,
    loadConversations,
    loadMessages,
    setActive,
    createConversation,
    addMessage,
    sendMessage,
    cancelQueuedMessage,
    stopConversation,
    togglePin,
    renameConversation,
    archiveConversation,
    deleteConversation,
    getConversationAsMarkdown,
    initAgentEventListener
  }
})
