import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AgentConfig } from '@renderer/types'
import { mockAgents } from '@renderer/mock/data'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<AgentConfig[]>(mockAgents)
  const selectedAgentId = ref<string>(mockAgents[0]?.id ?? '')

  const currentAgent = computed(() => agents.value.find((a) => a.id === selectedAgentId.value))

  function selectAgent(id: string): void {
    selectedAgentId.value = id
  }

  return { agents, selectedAgentId, currentAgent, selectAgent }
})
