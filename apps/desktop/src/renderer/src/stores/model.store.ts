import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AgentModelOption, ModelCatalogSource } from '@renderer/types'
import { DEFAULT_CLAUDE_MODEL_ID } from '@renderer/constants/claude-models'

export const useModelStore = defineStore('model', () => {
  const activeAgentId = ref('claude-code')
  const models = ref<AgentModelOption[]>([])
  const discoveredModels = ref<AgentModelOption[]>([])
  const defaultModelId = ref(DEFAULT_CLAUDE_MODEL_ID)
  const catalogSource = ref<ModelCatalogSource>('fallback')
  const discoveredSource = ref<ModelCatalogSource>('fallback')
  const loading = ref(false)

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

  return {
    models,
    discoveredModels,
    defaultModelId,
    catalogSource,
    discoveredSource,
    loading,
    activeAgentId,
    fetchCatalog,
    getEffectiveModelId,
    getModelName,
    selectDefaultModel,
    saveAgentConfig,
    resetToDiscovered
  }
})
