<script setup lang="ts">
import { useAgentStore } from '@renderer/stores/agent.store'

const agentStore = useAgentStore()

const currentLabel = () => agentStore.currentAgent?.name || ''
</script>

<template>
  <div class="agent-selector">
    <el-dropdown trigger="click" @command="(v: string) => agentStore.selectAgent(v)">
      <button class="agent-btn">
        <span>{{ currentLabel() }}</span>
        <span class="chevron">&#x25BE;</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="agent in agentStore.agents"
            :key="agent.id"
            :command="agent.id"
            :disabled="!agent.enabled"
          >
            {{ agent.name }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.agent-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.agent-btn:hover {
  background: var(--btn-ghost-hover);
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
}
</style>
