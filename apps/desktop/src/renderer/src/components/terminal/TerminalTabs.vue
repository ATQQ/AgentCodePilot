<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useTerminalStore } from '@renderer/stores/terminal.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import TerminalView from './TerminalView.vue'

const props = defineProps<{
  embedded?: boolean
}>()

const terminalStore = useTerminalStore()
const workspaceStore = useWorkspaceStore()

async function init(): Promise<void> {
  const pid = workspaceStore.selectedProjectId
  const cwd = workspaceStore.currentCwd
  if (!pid || !cwd) return
  await terminalStore.ensureTerminals(pid, cwd)
}

onMounted(init)

watch(() => workspaceStore.selectedProjectId, init)
</script>

<template>
  <div class="terminal-tabs">
    <div v-if="!workspaceStore.selectedProjectId || !workspaceStore.currentCwd" class="empty-state">
      <span>请先选择项目</span>
    </div>

    <template v-else>
      <div class="tab-bar">
        <button
          v-for="t in terminalStore.currentTerminals"
          :key="t.id"
          class="tab-item"
          :class="{ active: terminalStore.activeTerminal?.id === t.id }"
          @click="terminalStore.setActive(t.id)"
        >
          {{ t.title }}
          <span
            class="close-tab"
            @click.stop="terminalStore.killTerminal(t.id)"
          >×</span>
        </button>
        <button class="new-tab" title="新建终端" @click="terminalStore.createTerminal()">+</button>
      </div>

      <div v-if="terminalStore.activeTerminal" class="terminal-wrapper">
        <TerminalView :key="terminalStore.activeTerminal.id" :terminal-id="terminalStore.activeTerminal.id" />
      </div>
      <div v-else class="empty-state">正在启动终端…</div>
    </template>
  </div>
</template>

<style scoped>
.terminal-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 34px;
  padding: 0 8px;
  border-bottom: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  flex-shrink: 0;
  overflow-x: auto;
  -webkit-app-region: no-drag;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
}

.tab-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.tab-item.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.close-tab {
  opacity: 0.5;
  font-size: 14px;
  line-height: 1;
}

.close-tab:hover {
  opacity: 1;
}

.new-tab {
  padding: 0 8px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.new-tab:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.terminal-wrapper {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}
</style>
