import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  AgentModelOption,
  GatewayProviderPublicPayload,
  GatewaySettingsPayload,
  ModelCatalogResult,
  ModelCatalogSource
} from '../../../preload/types'
import { DEFAULT_CLAUDE_MODEL_ID } from '@renderer/constants/claude-models'
import i18n from '@renderer/i18n'
import { useAgentStore } from './agent.store'
import { useChatStore } from './chat.store'

const MODEL_SELECTOR_AGENTS = ['claude-code', 'codex'] as const

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
  const gatewayEnabled = ref(false)
  const gatewayProviders = ref<GatewayProviderPublicPayload[]>([])
  const gatewaySettings = ref<GatewaySettingsPayload | null>(null)
  const selectedProviderByAgent = ref<Record<string, string>>({})
  const selectedModelByAgent = ref<Record<string, string>>({})
  const switchNotice = ref<{ from: string; to: string } | null>(null)
  let switchNoticeTimer: ReturnType<typeof setTimeout> | null = null
  const catalogByAgent = new Map<string, AgentCatalogSnapshot>()
  let catalogFetchGeneration = 0
  let refreshGeneration = 0

  type GatewayProtocol = 'openai-chat' | 'anthropic'

  function gatewayProtocolForAgent(agentId: string): GatewayProtocol {
    if (agentId === 'codex') {
      return gatewaySettings.value?.channelProtocols.codex ?? 'openai-chat'
    }
    return gatewaySettings.value?.channelProtocols.claudeCli ?? 'anthropic'
  }

  function getGatewayProvidersForAgent(
    agentId = activeAgentId.value
  ): GatewayProviderPublicPayload[] {
    const protocol = gatewayProtocolForAgent(agentId)
    return gatewayProviders.value.filter((provider) => {
      const endpoint = provider.config.protocols[protocol]
      return Boolean(endpoint?.baseUrl)
    })
  }

  function providerModels(provider: GatewayProviderPublicPayload): AgentModelOption[] {
    const ids = [...(provider.config.models ?? [])]
    if (provider.config.defaultModel && !ids.includes(provider.config.defaultModel)) {
      ids.unshift(provider.config.defaultModel)
    }
    return ids.map((id) => ({ id, name: id, description: provider.name }))
  }

  function resolveGatewaySelection(
    agentId: string,
    conversationProviderId?: string | null,
    conversationModelId?: string | null
  ): { providerId: string; modelId: string } | null {
    const available = getGatewayProvidersForAgent(agentId)
    const preferredProviderId =
      conversationProviderId ||
      selectedProviderByAgent.value[agentId] ||
      gatewaySettings.value?.defaultProviderId
    const provider = available.find((item) => item.id === preferredProviderId) ?? available[0]
    if (!provider) return null
    const availableModels = providerModels(provider)
    // Prefer conversation → in-memory user pick → provider default → first model.
    // Without selectedModelByAgent, cascader changes snap back to provider.defaultModel
    // whenever there is no conversation model yet (e.g. home empty state).
    const preferredModelId =
      conversationModelId ||
      selectedModelByAgent.value[agentId] ||
      (activeAgentId.value === agentId ? defaultModelId.value : undefined)
    const model =
      availableModels.find((item) => item.id === preferredModelId) ??
      availableModels.find((item) => item.id === provider.config.defaultModel) ??
      availableModels[0]
    if (!model) return null
    return { providerId: provider.id, modelId: model.id }
  }

  function applyGatewaySelection(agentId: string, providerId: string, modelId: string): void {
    const provider = getGatewayProvidersForAgent(agentId).find((item) => item.id === providerId)
    if (!provider) return
    const nextModels = providerModels(provider)
    if (!nextModels.some((item) => item.id === modelId)) return
    activeAgentId.value = agentId
    selectedProviderByAgent.value = {
      ...selectedProviderByAgent.value,
      [agentId]: providerId
    }
    selectedModelByAgent.value = {
      ...selectedModelByAgent.value,
      [agentId]: modelId
    }
    models.value = nextModels
    discoveredModels.value = nextModels
    defaultModelId.value = modelId
    catalogSource.value = 'app-config'
    discoveredSource.value = 'app-config'
  }

  async function refreshGatewayProviders(agentId = activeAgentId.value): Promise<boolean> {
    const [settings, providers] = await Promise.all([
      window.agentAPI.gateway.getSettings(),
      window.agentAPI.providers.list()
    ])
    gatewaySettings.value = settings
    gatewayEnabled.value = settings.enabled
    gatewayProviders.value = providers
    if (!settings.enabled) return false
    const selection = resolveGatewaySelection(agentId)
    if (selection) {
      applyGatewaySelection(agentId, selection.providerId, selection.modelId)
    } else {
      activeAgentId.value = agentId
      models.value = []
      discoveredModels.value = []
      defaultModelId.value = ''
    }
    return true
  }

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
    loading.value = true

    try {
      const usesGateway = await refreshGatewayProviders(agentId)
      if (usesGateway) {
        if (generation === catalogFetchGeneration) {
          loading.value = false
        }
        return
      }
    } catch {
      gatewayEnabled.value = false
      if (generation !== catalogFetchGeneration) {
        return
      }
    }

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

  function getEffectiveGatewaySelection(
    conversationProviderId?: string | null,
    conversationModelId?: string | null,
    agentId = activeAgentId.value
  ): { providerId: string; modelId: string } | null {
    return resolveGatewaySelection(agentId, conversationProviderId, conversationModelId)
  }

  function selectGatewayProviderModel(agentId: string, providerId: string, modelId: string): void {
    applyGatewaySelection(agentId, providerId, modelId)
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
    conversationModelId?: string | null,
    conversationProviderId?: string | null
  ): Promise<void> {
    if (!MODEL_SELECTOR_AGENTS.includes(agentId as (typeof MODEL_SELECTOR_AGENTS)[number])) {
      return
    }

    const generation = ++refreshGeneration

    try {
      if (await refreshGatewayProviders(agentId)) {
        if (generation !== refreshGeneration) return
        if (!isConversationRefreshContext(conversationId, agentId)) return
        const selection = resolveGatewaySelection(
          agentId,
          conversationProviderId,
          conversationModelId
        )
        if (!selection) return
        applyGatewaySelection(agentId, selection.providerId, selection.modelId)
        const chatStore = useChatStore()
        const conv = chatStore.conversations.find((item) => item.id === conversationId)
        if (
          conv &&
          (conv.providerId !== selection.providerId || conv.modelId !== selection.modelId)
        ) {
          const before = `${conv.providerId ?? ''}/${conv.modelId ?? ''}`
          await chatStore.setConversationProviderModel(
            conversationId,
            selection.providerId,
            selection.modelId
          )
          showSwitchNotice(before, `${selection.providerId}/${selection.modelId}`)
        }
        return
      }

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
    gatewayEnabled,
    gatewayProviders,
    gatewaySettings,
    selectedProviderByAgent,
    selectedModelByAgent,
    switchNotice,
    activeAgentId,
    fetchCatalog,
    activateAgentCatalog,
    getEffectiveModelId,
    getEffectiveGatewaySelection,
    getGatewayProvidersForAgent,
    getModelName,
    refreshGatewayProviders,
    selectGatewayProviderModel,
    selectDefaultModel,
    saveAgentConfig,
    resetToDiscovered,
    refreshCatalogForConversation
  }
})
