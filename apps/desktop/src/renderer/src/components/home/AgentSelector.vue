<script setup lang="ts">
import { computed } from 'vue'
import { useAgentStore } from '@renderer/stores/agent.store'
import claudeIcon from '@renderer/assets/claude-icon.svg'
import codexIcon from '@renderer/assets/codex-icon.svg'
import cursorIcon from '@renderer/assets/cursor-icon.svg'

const props = withDefaults(
  defineProps<{ compact?: boolean }>(),
  { compact: false }
)

const agentStore = useAgentStore()

const agentIcons: Record<string, string> = {
  'claude-code': claudeIcon,
  'codex': codexIcon,
  'cursor': cursorIcon
}

const currentIcon = computed(() => agentIcons[agentStore.selectedAgentId] || claudeIcon)

function getAgentIcon(id: string): string {
  return agentIcons[id] || claudeIcon
}
</script>

<template>
  <div class="agent-selector">
    <el-dropdown trigger="click" @command="(v: string) => agentStore.selectAgent(v)">
      <button class="agent-btn" :title="agentStore.currentAgent?.name">
        <img :src="currentIcon" class="agent-icon" width="16" height="16" alt="" />
        <span v-if="!props.compact">{{ agentStore.currentAgent?.name }}</span>
        <span v-if="!props.compact" class="chevron">&#x25BE;</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="agent in agentStore.agents"
            :key="agent.id"
            :command="agent.id"
            :disabled="!agent.enabled"
          >
            <img :src="getAgentIcon(agent.id)" class="dropdown-icon" width="14" height="14" alt="" />
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
  gap: 6px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.agent-btn:hover {
  background: var(--btn-ghost-hover);
}

.agent-icon {
  border-radius: 50%;
  flex-shrink: 0;
}

.dropdown-icon {
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
}
</style>
