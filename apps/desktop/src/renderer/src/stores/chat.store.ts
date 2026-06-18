import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Attachment, ApprovalRequest, Conversation, Message } from '@renderer/types'
import type { AgentEvent, AttachmentPayload, PlanReference } from '../../../preload/types'
import type { ApprovalLevel } from '@renderer/types'
import { useWorkspaceStore } from './workspace.store'
import { useModelStore } from './model.store'
import { useAgentStore } from './agent.store'
import { getToolCallFingerprint } from '@renderer/utils/toolCall'
import { attachmentFromPayload, enrichAttachment } from '@renderer/utils/localFile'

function formatAgentErrorMessage(error: string): string {
  if (/maximum number of turns|max_turns|回合上限/i.test(error)) {
    return '已达到单次 Agent 回合上限。如需继续，请发送「继续」或把任务拆小后重试。'
  }
  return error
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const streamingConversationIds = ref<Set<string>>(new Set())
  const waitingConversationIds = ref<Set<string>>(new Set())
  const pendingApprovals = ref<Map<string, ApprovalRequest>>(new Map())
  const queuedMessages = ref<{ conversationId: string; content: string; agentId: string; modelId?: string; planMode?: boolean; planRefs?: PlanReference[] }[]>([])
  const pendingAgentByConversation = ref<Map<string, string>>(new Map())
  const activeAssistantMessageIds = ref<Map<string, string>>(new Map())
  const thinkingStartedAtByConversation = ref<Map<string, number>>(new Map())
  const toolUseIdAliases = ref<Map<string, string>>(new Map())

  function touchConversationSet(setRef: typeof streamingConversationIds, mutate: (set: Set<string>) => void): void {
    mutate(setRef.value)
    setRef.value = new Set(setRef.value)
  }

  function addWaitingConversation(conversationId: string): void {
    touchConversationSet(waitingConversationIds, (set) => set.add(conversationId))
  }

  function removeWaitingConversation(conversationId: string): void {
    touchConversationSet(waitingConversationIds, (set) => set.delete(conversationId))
  }

  function addStreamingConversation(conversationId: string): void {
    touchConversationSet(streamingConversationIds, (set) => set.add(conversationId))
  }

  function removeStreamingConversation(conversationId: string): void {
    touchConversationSet(streamingConversationIds, (set) => set.delete(conversationId))
  }

  function clearActiveAssistantMessage(conversationId: string): void {
    const next = new Map(activeAssistantMessageIds.value)
    next.delete(conversationId)
    activeAssistantMessageIds.value = next
  }

  function setActiveAssistantMessage(conversationId: string, messageId: string): void {
    const next = new Map(activeAssistantMessageIds.value)
    next.set(conversationId, messageId)
    activeAssistantMessageIds.value = next
  }

  function isActiveAssistantMessage(conversationId: string, messageId: string): boolean {
    return activeAssistantMessageIds.value.get(conversationId) === messageId
  }

  function isConversationBusy(conversationId: string): boolean {
    return (
      streamingConversationIds.value.has(conversationId) ||
      waitingConversationIds.value.has(conversationId)
    )
  }

  function markThinkingStarted(conversationId: string): void {
    const next = new Map(thinkingStartedAtByConversation.value)
    if (!next.has(conversationId)) {
      next.set(conversationId, Date.now())
    }
    thinkingStartedAtByConversation.value = next
  }

  function clearThinkingStarted(conversationId: string): void {
    if (!thinkingStartedAtByConversation.value.has(conversationId)) return
    const next = new Map(thinkingStartedAtByConversation.value)
    next.delete(conversationId)
    thinkingStartedAtByConversation.value = next
  }

  function getThinkingElapsedSeconds(conversationId: string): number {
    const startedAt = thinkingStartedAtByConversation.value.get(conversationId)
    if (!startedAt) return 0
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  }

  function isConversationThinking(conversationId: string): boolean {
    if (isConversationBusy(conversationId)) return true
    const activeId = activeAssistantMessageIds.value.get(conversationId)
    if (!activeId) return false
    const conv = conversations.value.find((c) => c.id === conversationId)
    const msg = conv?.messages.find((m) => m.id === activeId)
    return (
      msg?.role === 'assistant' &&
      !msg.content.trim() &&
      !msg.toolCalls?.length &&
      !msg.stopped
    )
  }

  function reportSendFailure(conversationId: string, error: unknown): void {
    removeWaitingConversation(conversationId)
    removeStreamingConversation(conversationId)
    clearActiveAssistantMessage(conversationId)
    clearThinkingStarted(conversationId)
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return
    const pendingAgent = getPendingAgent(conversationId)
    const errMsg = formatAgentErrorMessage(error instanceof Error ? error.message : String(error))
    addMessage(conversationId, 'assistant', `[Error] ${errMsg}`)
    const lastMsg = conv.messages[conv.messages.length - 1]
    if (lastMsg?.role === 'assistant' && pendingAgent) {
      lastMsg.agentId = pendingAgent
    }
  }

  const activeConversation = computed(
    () => conversations.value.find((c) => c.id === activeConversationId.value) ?? null
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

  const isWaiting = computed(
    () =>
      activeConversationId.value !== null &&
      waitingConversationIds.value.has(activeConversationId.value)
  )

  const isStoppable = computed(
    () => isStreaming.value || isWaiting.value
  )

  const pendingApprovalConversationIds = computed(() => {
    const ids = new Set<string>()
    for (const req of pendingApprovals.value.values()) {
      if (req.status === 'pending') ids.add(req.conversationId)
    }
    return ids
  })

  function getPendingApprovalForMessage(messageId: string): ApprovalRequest | undefined {
    for (const req of pendingApprovals.value.values()) {
      if (req.messageId === messageId && req.status === 'pending') return req
    }
    return undefined
  }

  function hasPendingApproval(conversationId: string): boolean {
    return pendingApprovalConversationIds.value.has(conversationId)
  }

  function setPendingAgent(conversationId: string, agentId: string): void {
    const next = new Map(pendingAgentByConversation.value)
    next.set(conversationId, agentId)
    pendingAgentByConversation.value = next
  }

  function getPendingAgent(conversationId: string): string | undefined {
    return pendingAgentByConversation.value.get(conversationId)
  }

  function assignAgentToAssistantMessage(conversationId: string, message: Message): void {
    if (message.role !== 'assistant' || message.agentId) return
    const pendingAgent = getPendingAgent(conversationId)
    if (pendingAgent) {
      message.agentId = pendingAgent
    }
  }

  function getActiveAssistantMessageId(conversationId: string): string | undefined {
    return activeAssistantMessageIds.value.get(conversationId)
  }

  function ensureAssistantPlaceholder(conversationId: string, messageId: string): Message | undefined {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return undefined
    let msg = conv.messages.find((m) => m.id === messageId)
    if (!msg) {
      msg = {
        id: messageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString()
      }
      assignAgentToAssistantMessage(conversationId, msg)
      conv.messages.push(msg)
    }
    return msg
  }

  function resolveToolUseId(messageId: string, toolUseId: string): string {
    return toolUseIdAliases.value.get(`${messageId}:${toolUseId}`) ?? toolUseId
  }

  function aliasDuplicateToolCall(
    messageId: string,
    toolUseId: string,
    canonicalToolUseId: string
  ): void {
    if (toolUseId === canonicalToolUseId) return
    const next = new Map(toolUseIdAliases.value)
    next.set(`${messageId}:${toolUseId}`, canonicalToolUseId)
    toolUseIdAliases.value = next
  }

  function dedupeToolCallByFingerprint(
    message: Message,
    messageId: string,
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>
  ): void {
    const fingerprint = getToolCallFingerprint(toolName, input)
    if (!message.toolCalls?.length || fingerprint.endsWith(':{}')) return

    const resolvedId = resolveToolUseId(messageId, toolUseId)
    const duplicate = message.toolCalls.find(
      (t) =>
        t.toolUseId !== resolvedId &&
        resolveToolUseId(messageId, t.toolUseId) === t.toolUseId &&
        getToolCallFingerprint(t.toolName, t.input) === fingerprint
    )
    if (!duplicate) return

    aliasDuplicateToolCall(messageId, resolvedId, duplicate.toolUseId)
    message.toolCalls = message.toolCalls.filter((t) => t.toolUseId !== resolvedId)
  }

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

  function getArchivedConversations(): Conversation[] {
    return conversations.value
      .filter((c) => c.archived)
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
  }

  function mergeConversationItem(item: {
    id: string
    title: string
    agentId: string
    modelId?: string | null
    projectId: string | null
    cwd: string | null
    pinned: boolean
    archived: boolean
    approvalLevel?: 'request' | 'auto' | 'full'
    createdAt: string
    updatedAt: string
  }): void {
    const exists = conversations.value.find((c) => c.id === item.id)
    if (exists) {
      exists.title = item.title
      exists.pinned = item.pinned
      exists.archived = item.archived
      exists.approvalLevel = item.approvalLevel ?? 'auto'
      exists.modelId = item.modelId ?? exists.modelId
      exists.updatedAt = item.updatedAt
    } else {
      conversations.value.push({
        id: item.id,
        title: item.title,
        agentId: item.agentId,
        modelId: item.modelId ?? null,
        projectId: item.projectId,
        cwd: item.cwd,
        pinned: item.pinned,
        archived: item.archived,
        approvalLevel: item.approvalLevel ?? 'auto',
        messages: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })
    }
  }

  async function loadArchivedConversations(): Promise<void> {
    const list = await window.agentAPI.conversations.listArchived()
    for (const item of list) {
      mergeConversationItem(item)
    }
  }

  async function loadConversations(projectId?: string | null): Promise<void> {
    const list = await window.agentAPI.conversations.list(projectId)
    for (const item of list) {
      mergeConversationItem(item)
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
      agentId: m.agentId,
      planMode: m.planMode,
      planRefs: m.planRefs,
      attachments: m.attachments?.map((att) => enrichAttachment(att as Attachment)),
      usage: m.usage,
      debugInput: m.debugInput,
      debugOutput: m.debugOutput
    }))
  }

  function setActive(id: string | null): void {
    activeConversationId.value = id
    if (id) {
      loadMessages(id)
      const conv = conversations.value.find((c) => c.id === id)
      if (conv) {
        const agentStore = useAgentStore()
        agentStore.selectAgent(conv.agentId)
        setPendingAgent(id, conv.agentId)
      }
    }
  }

  async function createConversation(
    agentId: string,
    firstMessage: string,
    projectId?: string | null,
    attachments?: Attachment[],
    planMode?: boolean,
    modelId?: string
  ): Promise<string> {
    const modelStore = useModelStore()
    const resolvedModelId = modelId ?? modelStore.getEffectiveModelId()
    const result = await window.agentAPI.chat.createConversation({
      agentId,
      modelId: resolvedModelId,
      firstMessage,
      projectId,
      attachments: toAttachmentPayloads(attachments),
      planMode: planMode ?? false
    })

    const persistedAttachments =
      result.attachments?.map((att) => attachmentFromPayload(att)) ??
      (attachments && attachments.length > 0 ? attachments.map((att) => enrichAttachment(att)) : undefined)

    const now = new Date().toISOString()
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: firstMessage,
      createdAt: now,
      ...(planMode ? { planMode: true } : {}),
      attachments: persistedAttachments
    }
    conversations.value.unshift({
      id: result.id,
      title: result.title,
      agentId,
      modelId: resolvedModelId,
      projectId: projectId ?? null,
      cwd: result.cwd,
      approvalLevel: 'auto',
      messages: [msg],
      createdAt: now,
      updatedAt: now
    })
    activeConversationId.value = result.id
    clearActiveAssistantMessage(result.id)
    markThinkingStarted(result.id)
    addWaitingConversation(result.id)
    setPendingAgent(result.id, agentId)
    return result.id
  }

  function addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    attachments?: Attachment[],
    planMode?: boolean,
    planRefs?: PlanReference[]
  ): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv) return
    const now = new Date().toISOString()
    conv.messages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      createdAt: now,
      ...(planMode ? { planMode: true } : {}),
      ...(planRefs?.length ? { planRefs } : {}),
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    })
    conv.updatedAt = now
  }

  function toPlainPlanRefs(planRefs?: PlanReference[]): PlanReference[] | undefined {
    if (!planRefs?.length) return undefined
    return planRefs.map((ref) => ({ id: ref.id, title: ref.title }))
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
    attachments?: Attachment[],
    planMode?: boolean,
    planRefs?: PlanReference[]
  ): Promise<void> {
    const conv = conversations.value.find((c) => c.id === conversationId)
    const modelStore = useModelStore()
    const modelId = modelStore.getEffectiveModelId(conv?.modelId)
    const effectivePlanMode = planRefs?.length ? false : (planMode ?? false)
    if (isConversationBusy(conversationId)) {
      queuedMessages.value.push({
        conversationId,
        content,
        agentId,
        modelId,
        planMode: effectivePlanMode,
        planRefs: toPlainPlanRefs(planRefs)
      })
      return
    }
    setPendingAgent(conversationId, agentId)
    clearActiveAssistantMessage(conversationId)
    addMessage(conversationId, 'user', content, attachments, effectivePlanMode, toPlainPlanRefs(planRefs))
    markThinkingStarted(conversationId)
    addWaitingConversation(conversationId)
    const workspaceStore = useWorkspaceStore()
    const wsFolders = workspaceStore.currentWorkspace?.folders
    try {
      const result = await window.agentAPI.chat.sendMessage({
        conversationId,
        content,
        agentId,
        modelId,
        cwd: conv?.cwd || workspaceStore.currentCwd,
        workspaceFolders: wsFolders && wsFolders.length > 1 ? [...wsFolders] : undefined,
        attachments: toAttachmentPayloads(attachments),
        planMode: effectivePlanMode,
        planRefs: toPlainPlanRefs(planRefs)
      })
      setActiveAssistantMessage(conversationId, result.assistantMessageId)
      ensureAssistantPlaceholder(conversationId, result.assistantMessageId)
      if (result.attachments?.length && conv) {
        const lastUserMessage = [...conv.messages].reverse().find((m) => m.role === 'user')
        if (lastUserMessage) {
          lastUserMessage.attachments = result.attachments.map((att) => attachmentFromPayload(att))
        }
      }
    } catch (error) {
      reportSendFailure(conversationId, error)
    }
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
    removeWaitingConversation(conversationId)
    removeStreamingConversation(conversationId)
    clearActiveAssistantMessage(conversationId)
    clearThinkingStarted(conversationId)
    await window.agentAPI.chat.stop(conversationId)
  }

  function flushQueueForConversation(conversationId: string): void {
    const idx = queuedMessages.value.findIndex((m) => m.conversationId === conversationId)
    if (idx === -1) return
    const next = queuedMessages.value.splice(idx, 1)[0]
    setPendingAgent(next.conversationId, next.agentId)
    addMessage(next.conversationId, 'user', next.content, undefined, next.planMode, next.planRefs)
    clearActiveAssistantMessage(next.conversationId)
    markThinkingStarted(next.conversationId)
    addWaitingConversation(next.conversationId)
    const conv = conversations.value.find((c) => c.id === next.conversationId)
    const workspaceStore = useWorkspaceStore()
    const modelStore = useModelStore()
    const wsFolders = workspaceStore.currentWorkspace?.folders
    window.agentAPI.chat
      .sendMessage({
        conversationId: next.conversationId,
        content: next.content,
        agentId: next.agentId,
        modelId: next.modelId ?? modelStore.getEffectiveModelId(conv?.modelId),
        cwd: conv?.cwd || workspaceStore.currentCwd,
        workspaceFolders: wsFolders && wsFolders.length > 1 ? [...wsFolders] : undefined,
        planMode: next.planMode ?? false,
        planRefs: toPlainPlanRefs(next.planRefs)
      })
      .then((result) => {
        setActiveAssistantMessage(next.conversationId, result.assistantMessageId)
        ensureAssistantPlaceholder(next.conversationId, result.assistantMessageId)
      })
      .catch((error) => {
        reportSendFailure(next.conversationId, error)
      })
  }

  function handleAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'message.started': {
        setActiveAssistantMessage(event.conversationId, event.messageId)
        ensureAssistantPlaceholder(event.conversationId, event.messageId)
        addStreamingConversation(event.conversationId)
        removeWaitingConversation(event.conversationId)
        break
      }
      case 'message.delta': {
        if (!isActiveAssistantMessage(event.conversationId, event.messageId)) return
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        removeWaitingConversation(event.conversationId)
        const msg = ensureAssistantPlaceholder(event.conversationId, event.messageId)
        if (!msg) return
        msg.content += event.delta
        break
      }
      case 'message.completed': {
        const isCurrentRun = isActiveAssistantMessage(event.conversationId, event.messageId)
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          conv.updatedAt = new Date().toISOString()
          let msg = conv.messages.find((m) => m.id === event.messageId)
          if (event.stopped) {
            const stoppedText = '已手动终止 AI 回复'
            if (!msg) {
              msg = {
                id: event.messageId,
                role: 'assistant',
                content: stoppedText,
                createdAt: new Date().toISOString(),
                stopped: true
              }
              assignAgentToAssistantMessage(event.conversationId, msg)
              conv.messages.push(msg)
            } else {
              if (!msg.content.trim()) {
                msg.content = stoppedText
              }
              msg.stopped = true
            }
          }
          if (msg) {
            assignAgentToAssistantMessage(event.conversationId, msg)
            if (event.usage) msg.usage = event.usage
            if (event.debugInput) msg.debugInput = event.debugInput
            if (event.debugOutput) msg.debugOutput = event.debugOutput
            if (!event.stopped && msg.toolCalls) {
              for (const tc of msg.toolCalls) {
                if (tc.status === 'pending' || tc.status === 'running') {
                  tc.status = 'completed'
                }
              }
            }
          }
        }
        if (!isCurrentRun) break
        removeWaitingConversation(event.conversationId)
        removeStreamingConversation(event.conversationId)
        clearActiveAssistantMessage(event.conversationId)
        clearThinkingStarted(event.conversationId)
        flushQueueForConversation(event.conversationId)
        break
      }
      case 'message.error': {
        const hasActiveId = activeAssistantMessageIds.value.has(event.conversationId)
        const isCurrentRun =
          isActiveAssistantMessage(event.conversationId, event.messageId) ||
          (waitingConversationIds.value.has(event.conversationId) && !hasActiveId)
        if (!isCurrentRun) break
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          const pendingAgent = getPendingAgent(event.conversationId)
          addMessage(event.conversationId, 'assistant', `[Error] ${formatAgentErrorMessage(event.error)}`)
          const lastMsg = conv.messages[conv.messages.length - 1]
          if (lastMsg?.role === 'assistant' && pendingAgent) {
            lastMsg.agentId = pendingAgent
          }
        }
        removeWaitingConversation(event.conversationId)
        removeStreamingConversation(event.conversationId)
        clearActiveAssistantMessage(event.conversationId)
        clearThinkingStarted(event.conversationId)
        flushQueueForConversation(event.conversationId)
        break
      }
      case 'tool.started': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        let msg = conv.messages.find((m) => m.id === event.messageId)
        if (!msg) {
          msg = {
            id: event.messageId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString()
          }
          assignAgentToAssistantMessage(event.conversationId, msg)
          conv.messages.push(msg)
        }
        if (!msg.toolCalls) msg.toolCalls = []
        const existing = msg.toolCalls.find((t) => t.toolUseId === event.tool.toolUseId)
        if (!existing) {
          msg.toolCalls.push({ ...event.tool })
        }
        break
      }
      case 'tool.input_updated': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        const msg = conv.messages.find((m) => m.id === event.messageId)
        if (!msg?.toolCalls) return
        const resolvedToolUseId = resolveToolUseId(event.messageId, event.toolUseId)
        const tc = msg.toolCalls.find((t) => t.toolUseId === resolvedToolUseId)
        if (tc) {
          tc.input = event.input
          dedupeToolCallByFingerprint(
            msg,
            event.messageId,
            resolvedToolUseId,
            tc.toolName,
            event.input
          )
          const activeTool = msg.toolCalls.find((t) => t.toolUseId === resolvedToolUseId)
          if (activeTool?.status === 'pending') {
            const hasRunning = msg.toolCalls.some(
              (t) => t.toolUseId !== resolvedToolUseId && t.status === 'running'
            )
            if (!hasRunning) {
              activeTool.status = 'running'
            }
          }
        }
        break
      }
      case 'tool.progress': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        const msg = conv.messages.find((m) => m.id === event.messageId)
        if (!msg?.toolCalls) return
        const resolvedToolUseId = resolveToolUseId(event.messageId, event.toolUseId)
        const tc = msg.toolCalls.find((t) => t.toolUseId === resolvedToolUseId)
        if (tc) {
          tc.status = 'running'
          tc.elapsedSeconds = event.elapsedSeconds
        }
        break
      }
      case 'tool.completed': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (!conv) return
        const msg = conv.messages.find((m) => m.id === event.messageId)
        if (!msg?.toolCalls) return
        const resolvedToolUseId = resolveToolUseId(event.messageId, event.toolUseId)
        const tc = msg.toolCalls.find((t) => t.toolUseId === resolvedToolUseId)
        if (tc) {
          tc.status = 'completed'
          if (event.summary) tc.summary = event.summary
          const nextPending = msg.toolCalls.find((t) => t.status === 'pending')
          if (nextPending) {
            const hasRunning = msg.toolCalls.some((t) => t.status === 'running')
            if (!hasRunning) nextPending.status = 'running'
          }
        }
        break
      }
      case 'approval.requested': {
        const conv = conversations.value.find((c) => c.id === event.conversationId)
        if (conv) {
          let msg = conv.messages.find((m) => m.id === event.messageId)
          if (!msg) {
            msg = {
              id: event.messageId,
              role: 'assistant',
              content: '',
              createdAt: new Date().toISOString()
            }
            conv.messages.push(msg)
          }
        }
        const next = new Map(pendingApprovals.value)
        next.set(event.requestId, {
          requestId: event.requestId,
          conversationId: event.conversationId,
          messageId: event.messageId,
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          displayName: event.displayName,
          title: event.title,
          description: event.description,
          detail: event.detail,
          decisionReason: event.decisionReason,
          status: 'pending'
        })
        pendingApprovals.value = next
        removeWaitingConversation(event.conversationId)
        break
      }
      case 'approval.resolved': {
        const existing = pendingApprovals.value.get(event.requestId)
        if (existing) {
          const next = new Map(pendingApprovals.value)
          next.set(event.requestId, {
            ...existing,
            status: event.allowed ? 'allowed' : 'denied'
          })
          pendingApprovals.value = next
        }
        break
      }
    }
  }

  async function respondToApproval(
    requestId: string,
    allowed: boolean,
    scope: 'once' | 'conversation' = 'conversation'
  ): Promise<void> {
    await window.agentAPI.approval.respond({ requestId, allowed, scope })
  }

  async function setConversationApprovalLevel(
    conversationId: string,
    level: ApprovalLevel
  ): Promise<void> {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.approvalLevel = level
      await window.agentAPI.conversations.update({ id: conversationId, approvalLevel: level })
    }
  }

  async function setConversationModelId(conversationId: string, modelId: string): Promise<void> {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.modelId = modelId
      await window.agentAPI.conversations.update({ id: conversationId, modelId })
    }
  }

  function initApprovalNavigateListener(): () => void {
    return window.agentAPI.approval.onNavigate((conversationId) => {
      setActive(conversationId)
    })
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

  function unarchiveConversation(conversationId: string): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.archived = false
      window.agentAPI.conversations.update({ id: conversationId, archived: false })
    }
  }

  function deleteArchivedConversation(conversationId: string): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (!conv?.archived) return
    conversations.value = conversations.value.filter((c) => c.id !== conversationId)
    window.agentAPI.conversations.delete(conversationId)
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null
    }
  }

  async function deleteAllArchivedConversations(): Promise<void> {
    const archivedIds = conversations.value.filter((c) => c.archived).map((c) => c.id)
    conversations.value = conversations.value.filter((c) => !c.archived)
    await window.agentAPI.conversations.deleteAllArchived()
    if (activeConversationId.value && archivedIds.includes(activeConversationId.value)) {
      activeConversationId.value = null
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
    isStoppable,
    hasPendingApproval,
    pendingApprovalConversationIds,
    getPendingApprovalForMessage,
    pendingApprovals,
    isConversationStreaming,
    currentQueuedMessages,
    conversationList,
    getConversationsByProject,
    getOrphanConversations,
    getArchivedConversations,
    loadConversations,
    loadArchivedConversations,
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
    unarchiveConversation,
    deleteArchivedConversation,
    deleteAllArchivedConversations,
    deleteConversation,
    getConversationAsMarkdown,
    respondToApproval,
    setConversationApprovalLevel,
    setConversationModelId,
    initAgentEventListener,
    initApprovalNavigateListener,
    getPendingAgent,
    getActiveAssistantMessageId,
    getThinkingElapsedSeconds,
    isConversationThinking
  }
})
