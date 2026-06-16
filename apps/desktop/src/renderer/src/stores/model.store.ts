import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AgentModelOption, ModelCatalogSource } from '@renderer/types'
import { DEFAULT_CLAUDE_MODEL_ID } from '@renderer/constants/claude-models'

export const useModelStore = defineStore('model', () => {
  const models = ref<AgentModelOption[]>([])
  const discoveredModels = ref<AgentModelOption[]>([])
  const defaultModelId = ref(DEFAULT_CLAUDE_MODEL_ID)
  const catalogSource = ref<ModelCatalogSource>('fallback')
  const discoveredSource = ref<ModelCatalogSource>('fallback')
  const loading = ref(false)

  async function fetchCatalog(agentId = 'claude-code', forceRefresh = false): Promise<void> {
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

  async function selectDefaultModel(modelId: string): Promise<void> {
    if (!models.value.some((model) => model.id === modelId)) return
    const config = await window.agentAPI.agents.getConfig('claude-code')
    const catalog = await window.agentAPI.agents.updateConfig('claude-code', {
      ...config,
      defaultModelId: modelId
    })
    models.value = catalog.models
    discoveredModels.value = catalog.discoveredModels
    defaultModelId.value = catalog.defaultModelId
    catalogSource.value = catalog.source
    discoveredSource.value = catalog.discoveredSource
  }

  async function saveAgentConfig(config: {
    defaultModelId?: string
    models?: AgentModelOption[]
  }): Promise<void> {
    const catalog = await window.agentAPI.agents.updateConfig('claude-code', config)
    models.value = catalog.models
    discoveredModels.value = catalog.discoveredModels
    defaultModelId.value = catalog.defaultModelId
    catalogSource.value = catalog.source
    discoveredSource.value = catalog.discoveredSource
  }

  async function resetToDiscovered(): Promise<void> {
    const config = await window.agentAPI.agents.getConfig('claude-code')
    await saveAgentConfig({
      defaultModelId: config.defaultModelId,
      models: []
    })
  }

  return {
    models,
    discoveredModels,
    defaultModelId,
    catalogSource,
    discoveredSource,
    loading,
    fetchCatalog,
    getEffectiveModelId,
    getModelName,
    selectDefaultModel,
    saveAgentConfig,
    resetToDiscovered
  }
})
