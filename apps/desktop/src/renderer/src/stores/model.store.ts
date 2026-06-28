import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AgentModelOption, ModelCatalogResult, ModelCatalogSource } from '@renderer/types'
import { DEFAULT_CLAUDE_MODEL_ID } from '@renderer/constants/claude-models'
import i18n from '@renderer/i18n'
import { useAgentStore } from './agent.store'
import { useChatStore } from './chat.store'

const MODEL_SELECTOR_AGENTS = ['claude-code', 'codex', 'cursor'] as const

type AgentCatalogSnapshot = {
  models: AgentModelOption[]
  discoveredModels: AgentModelOption[]
  defaultModelId: string
  catalogSource: ModelCatalogSource
  discoveredSource: ModelCatalogSource
}

export const useModelStore = defineStore('model', () => {
  const activeAgentId = ref('claude-code')
  const models = ref<AgentModelOption[]>([])
  const discoveredModels = ref<AgentModelOption[]>([])
  const defaultModelId = ref(DEFAULT_CLAUDE_MODEL_ID)
  const catalogSource = ref<ModelCatalogSource>('fallback')
  const discoveredSource = ref<ModelCatalogSource>('fallback')
  const loading = ref(false)
  const switchNotice = ref<{ from: string; to: string } | null>(null)
  let switchNoticeTimer: ReturnType<typeof setTimeout> | null = null
  const catalogByAgent = new Map<string, AgentCatalogSnapshot>()
  let catalogFetchGeneration = 0
  let refreshGeneration = 0

  function snapshotFromCatalog(catalog: ModelCatalogResult): AgentCatalogSnapshot {
    return {
      models: catalog.models,
      discoveredModels: catalog.discoveredModels,
      defaultModelId: catalog.defaultModelId,
      catalogSource: catalog.source,
      discoveredSource: catalog.discoveredSource
    }
  }

  function rememberCatalog(agentId: string, catalog: ModelCatalogResult): AgentCatalogSnapshot {
    const snapshot = snapshotFromCatalog(catalog)
    catalogByAgent.set(agentId, snapshot)
    return snapshot
  }

  function applyCatalogSnapshot(agentId: string, snapshot: AgentCatalogSnapshot): void {
    activeAgentId.value = agentId
    models.value = snapshot.models
    discoveredModels.value = snapshot.discoveredModels
    defaultModelId.value = snapshot.defaultModelId
    catalogSource.value = snapshot.catalogSource
    discoveredSource.value = snapshot.discoveredSource
  }

  function isAgentCatalogContext(agentId: string): boolean {
    return useAgentStore().selectedAgentId === agentId
  }

  function isConversationRefreshContext(conversationId: string, agentId: string): boolean {
    const chatStore = useChatStore()
    return chatStore.activeConversationId === conversationId && isAgentCatalogContext(agentId)
  }

  async function loadCatalog(agentId: string, forceRefresh: boolean): Promise<ModelCatalogResult> {
    const catalog = await window.agentAPI.agents.listModels(agentId, forceRefresh)
    rememberCatalog(agentId, catalog)
    return catalog
  }

  function activateAgentCatalog(agentId: string): void {
    activeAgentId.value = agentId
    const cached = catalogByAgent.get(agentId)
    if (cached) {
      applyCatalogSnapshot(agentId, cached)
      return
    }
    models.value = []
    discoveredModels.value = []
  }

  async function fetchCatalog(agentId = 'claude-code', forceRefresh = false): Promise<void> {
    const generation = ++catalogFetchGeneration

    const cached = catalogByAgent.get(agentId)
    if (cached && isAgentCatalogContext(agentId)) {
      applyCatalogSnapshot(agentId, cached)
    } else if (isAgentCatalogContext(agentId)) {
      activeAgentId.value = agentId
      models.value = []
      discoveredModels.value = []
    }

    loading.value = true
    try {
      const catalog = await loadCatalog(agentId, forceRefresh)
      if (generation !== catalogFetchGeneration) return
      if (!isAgentCatalogContext(agentId)) return
      applyCatalogSnapshot(agentId, snapshotFromCatalog(catalog))
    } finally {
      if (generation === catalogFetchGeneration) {
        loading.value = false
      }
    }
  }

  function getEffectiveModelId(conversationModelId?: string | null): string {
    if (conversationModelId && models.value.some((model) => model.id === conversationModelId)) {
      return conversationModelId
    }
    return defaultModelId.value
  }

  function getModelName(modelId: string): string {
    return models.value.find((model) => model.id === modelId)?.name ?? modelId
  }

  function getDisplayedModel(conversationModelId?: string | null): {
    modelId: string
    modelName: string
  } {
    const modelId = getEffectiveModelId(conversationModelId)
    return { modelId, modelName: getModelName(modelId) }
  }

  function hasDisplayedModelChanged(
    before: { modelId: string; modelName: string },
    after: { modelId: string; modelName: string }
  ): boolean {
    return before.modelId !== after.modelId || before.modelName !== after.modelName
  }

  function showSwitchNotice(from: string, to: string): void {
    switchNotice.value = { from, to }
    if (switchNoticeTimer) clearTimeout(switchNoticeTimer)
    switchNoticeTimer = setTimeout(() => {
      switchNotice.value = null
      switchNoticeTimer = null
    }, 4000)
  }

  function notifyModelUpdated(
    before: { modelId: string; modelName: string },
    after: { modelId: string; modelName: string }
  ): void {
    showSwitchNotice(before.modelName, after.modelName)
    ElMessage({
      type: 'info',
      customClass: 'model-refresh-message',
      message: i18n.global.t('modelSelector.configModelChanged'),
      duration: 4000,
      offset: 72,
      showClose: false
    })
  }

  async function selectDefaultModel(modelId: string, agentId = activeAgentId.value): Promise<void> {
    if (!models.value.some((model) => model.id === modelId)) return
    const config = await window.agentAPI.agents.getConfig(agentId)
    const catalog = await window.agentAPI.agents.updateConfig(agentId, {
      ...config,
      defaultModelId: modelId
    })
    applyCatalog(agentId, catalog)
  }

  async function saveAgentConfig(
    config: {
      defaultModelId?: string
      models?: AgentModelOption[]
    },
    agentId = activeAgentId.value
  ): Promise<void> {
    const catalog = await window.agentAPI.agents.updateConfig(agentId, config)
    applyCatalog(agentId, catalog)
  }

  async function resetToDiscovered(agentId = activeAgentId.value): Promise<void> {
    const config = await window.agentAPI.agents.getConfig(agentId)
    await saveAgentConfig({
      defaultModelId: config.defaultModelId,
      models: []
    })
  }

  function applyCatalog(agentId: string, catalog: ModelCatalogResult): void {
    rememberCatalog(agentId, catalog)
    if (isAgentCatalogContext(agentId)) {
      applyCatalogSnapshot(agentId, snapshotFromCatalog(catalog))
    }
  }

  function resolveModelAfterRefresh(
    conversationModelId: string | null | undefined,
    catalog: ModelCatalogResult,
    hasAssistantMessages: boolean
  ): string {
    if (hasAssistantMessages) {
      if (conversationModelId && catalog.models.some((model) => model.id === conversationModelId)) {
        return conversationModelId
      }
      return catalog.defaultModelId
    }
    return catalog.defaultModelId
  }

  async function refreshCatalogForConversation(
    conversationId: string,
    agentId: string,
    conversationModelId?: string | null
  ): Promise<void> {
    if (!MODEL_SELECTOR_AGENTS.includes(agentId as (typeof MODEL_SELECTOR_AGENTS)[number])) {
      return
    }

    const generation = ++refreshGeneration

    try {
      const cachedCatalog = await loadCatalog(agentId, false)
      if (generation !== refreshGeneration) return
      if (!isConversationRefreshContext(conversationId, agentId)) return

      applyCatalogSnapshot(agentId, snapshotFromCatalog(cachedCatalog))
      if (cachedCatalog.source === 'app-config') {
        return
      }

      const displayedBefore = getDisplayedModel(conversationModelId)

      const catalog = await loadCatalog(agentId, true)
      if (generation !== refreshGeneration) return
      if (!isConversationRefreshContext(conversationId, agentId)) return

      if (catalog.discoveredModels.length && catalog.discoveredSource !== 'fallback') {
        applyCatalogSnapshot(agentId, snapshotFromCatalog(catalog))
      }

      const chatStore = useChatStore()
      if (!isConversationRefreshContext(conversationId, agentId)) {
        return
      }

      await chatStore.loadMessages(conversationId)
      if (!isConversationRefreshContext(conversationId, agentId)) return

      const conv = chatStore.conversations.find((item) => item.id === conversationId)
      const hasAssistantMessages =
        conv?.messages.some((message) => message.role === 'assistant') ?? false
      const effectiveSnapshot =
        catalog.discoveredModels.length && catalog.discoveredSource !== 'fallback'
          ? snapshotFromCatalog(catalog)
          : (catalogByAgent.get(agentId) ?? snapshotFromCatalog(cachedCatalog))
      const effectiveCatalog: ModelCatalogResult = {
        agentId,
        models: effectiveSnapshot.models,
        discoveredModels: effectiveSnapshot.discoveredModels,
        defaultModelId: effectiveSnapshot.defaultModelId,
        source: effectiveSnapshot.catalogSource,
        discoveredSource: effectiveSnapshot.discoveredSource
      }

      const targetModelId = resolveModelAfterRefresh(
        conversationModelId,
        effectiveCatalog,
        hasAssistantMessages
      )

      if (conv && conv.modelId !== targetModelId) {
        await chatStore.setConversationModelId(conversationId, targetModelId)
      }

      if (!isConversationRefreshContext(conversationId, agentId)) return

      const displayedAfter = getDisplayedModel(conv?.modelId)

      if (hasDisplayedModelChanged(displayedBefore, displayedAfter)) {
        notifyModelUpdated(displayedBefore, displayedAfter)
      }
    } catch {
      // Keep existing catalog when refresh fails.
    }
  }

  return {
    models,
    discoveredModels,
    defaultModelId,
    catalogSource,
    discoveredSource,
    loading,
    switchNotice,
    activeAgentId,
    fetchCatalog,
    activateAgentCatalog,
    getEffectiveModelId,
    getModelName,
    selectDefaultModel,
    saveAgentConfig,
    resetToDiscovered,
    refreshCatalogForConversation
  }
})
