import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AgentConfig } from '@renderer/types'
import { useModelStore } from '@renderer/stores/model.store'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<AgentConfig[]>([])
  const selectedAgentId = ref<string>('')

  const currentAgent = computed(() => agents.value.find((a) => a.id === selectedAgentId.value))

  async function fetchAgents(): Promise<void> {
    const list = await window.agentAPI.agents.list()
    agents.value = list
    if (!selectedAgentId.value && list.length > 0) {
      selectedAgentId.value = list[0].id
    }
  }

  function selectAgent(id: string): void {
    selectedAgentId.value = id
    const modelStore = useModelStore()
    void modelStore.fetchCatalog(id)
  }

  function getAgentName(id: string): string {
    return agents.value.find((a) => a.id === id)?.name ?? id
  }

  return { agents, selectedAgentId, currentAgent, fetchAgents, selectAgent, getAgentName }
})
