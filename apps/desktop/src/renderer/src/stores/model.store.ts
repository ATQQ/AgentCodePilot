import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AgentModelOption, ModelCatalogResult, ModelCatalogSource } from '@renderer/types'
import { DEFAULT_CLAUDE_MODEL_ID } from '@renderer/constants/claude-models'
import i18n from '@renderer/i18n'

const MODEL_SELECTOR_AGENTS = ['claude-code', 'codex', 'cursor'] as const

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

  async function fetchCatalog(agentId = 'claude-code', forceRefresh = false): Promise<void> {
    activeAgentId.value = agentId
    loading.value = true
    try {
      const catalog = await window.agentAPI.agents.listModels(agentId, forceRefresh)
      models.value = catalog.models
      discoveredModels.value = catalog.discoveredModels
      defaultModelId.value = catalog.defaultModelId
      catalogSource.value = catalog.source
      discoveredSource.value = catalog.discoveredSource
    } finally {
      loading.value = false
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
    models.value = catalog.models
    discoveredModels.value = catalog.discoveredModels
    defaultModelId.value = catalog.defaultModelId
    catalogSource.value = catalog.source
    discoveredSource.value = catalog.discoveredSource
  }

  async function saveAgentConfig(
    config: {
      defaultModelId?: string
      models?: AgentModelOption[]
    },
    agentId = activeAgentId.value
  ): Promise<void> {
    const catalog = await window.agentAPI.agents.updateConfig(agentId, config)
    models.value = catalog.models
    discoveredModels.value = catalog.discoveredModels
    defaultModelId.value = catalog.defaultModelId
    catalogSource.value = catalog.source
    discoveredSource.value = catalog.discoveredSource
  }

  async function resetToDiscovered(agentId = activeAgentId.value): Promise<void> {
    const config = await window.agentAPI.agents.getConfig(agentId)
    await saveAgentConfig({
      defaultModelId: config.defaultModelId,
      models: []
    })
  }

  function applyCatalog(agentId: string, catalog: ModelCatalogResult): void {
    activeAgentId.value = agentId
    models.value = catalog.models
    discoveredModels.value = catalog.discoveredModels
    defaultModelId.value = catalog.defaultModelId
    catalogSource.value = catalog.source
    discoveredSource.value = catalog.discoveredSource
  }

  function resolveModelAfterRefresh(
    conversationModelId: string | null | undefined,
    catalog: ModelCatalogResult,
    hasAssistantMessages: boolean
  ): string {
    if (hasAssistantMessages) {
      if (
        conversationModelId &&
        catalog.models.some((model) => model.id === conversationModelId)
      ) {
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

    try {
      await fetchCatalog(agentId, false)
      if (catalogSource.value === 'app-config') {
        return
      }

      const displayedBefore = getDisplayedModel(conversationModelId)

      const catalog = await window.agentAPI.agents.listModels(agentId, true)
      if (!catalog.discoveredModels.length || catalog.discoveredSource === 'fallback') {
        // Keep cached catalog when discovery is unavailable.
      } else {
        applyCatalog(agentId, catalog)
      }

      const { useChatStore } = await import('./chat.store')
      const chatStore = useChatStore()
      if (chatStore.activeConversationId !== conversationId) {
        return
      }

      await chatStore.loadMessages(conversationId)
      if (chatStore.activeConversationId !== conversationId) return

      const conv = chatStore.conversations.find((item) => item.id === conversationId)
      const hasAssistantMessages =
        conv?.messages.some((message) => message.role === 'assistant') ?? false
      const effectiveCatalog: ModelCatalogResult =
        catalog.discoveredModels.length && catalog.discoveredSource !== 'fallback'
          ? catalog
          : {
              agentId,
              models: models.value,
              discoveredModels: discoveredModels.value,
              defaultModelId: defaultModelId.value,
              source: catalogSource.value,
              discoveredSource: discoveredSource.value
            }

      const targetModelId = resolveModelAfterRefresh(
        conversationModelId,
        effectiveCatalog,
        hasAssistantMessages
      )

      if (conv && conv.modelId !== targetModelId) {
        await chatStore.setConversationModelId(conversationId, targetModelId)
      }

      if (chatStore.activeConversationId !== conversationId) return

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
    getEffectiveModelId,
    getModelName,
    selectDefaultModel,
    saveAgentConfig,
    resetToDiscovered,
    refreshCatalogForConversation
  }
})
