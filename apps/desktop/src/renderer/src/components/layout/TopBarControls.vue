<script setup lang="ts">
import { useLayoutStore } from '@renderer/stores/layout.store'
import { useGitStore } from '@renderer/stores/git.store'
import EnvironmentInfoPopover from '@renderer/components/environment/EnvironmentInfoPopover.vue'

const layoutStore = useLayoutStore()
const gitStore = useGitStore()

function toggleEnvInfo(): void {
  layoutStore.toggleEnvInfo()
}

function toggleBottom(): void {
  layoutStore.toggleBottomPanel()
}

function toggleRight(): void {
  layoutStore.toggleRightPanel()
}
</script>

<template>
  <div class="topbar-right">
    <template v-if="layoutStore.showWorkbenchControls">
      <EnvironmentInfoPopover />

      <button
        class="topbar-btn env-btn"
        data-env-trigger
        :class="{ active: layoutStore.envInfoVisible || layoutStore.envInfoPinned }"
        :title="layoutStore.envInfoPinned ? '环境信息（已常驻）' : '环境信息'"
        @click="toggleEnvInfo"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="4" width="14" height="9" rx="1.5" />
          <path d="M4 4V2.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V4" />
          <circle cx="8" cy="8.5" r="1.2" />
        </svg>
        <span v-if="gitStore.status?.isRepo" class="env-badge">
          <span class="add">+{{ gitStore.status.additions }}</span>
          <span class="del">-{{ gitStore.status.deletions }}</span>
        </span>
      </button>

      <button
        class="topbar-btn"
        :class="{ active: layoutStore.showBottomTerminal }"
        title="终端 (⌘`)"
        @click="toggleBottom"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <line x1="2" y1="11" x2="14" y2="11" />
        </svg>
      </button>
    </template>

    <button
      v-if="layoutStore.showExtensionPanelControls"
      class="topbar-btn"
      :class="{ active: layoutStore.showExtensionPanel }"
      title="扩展栏 (⌘B)"
      @click="toggleRight"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="2" width="12" height="12" rx="1.5" />
        <line x1="10" y1="2" x2="10" y2="14" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.topbar-right {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.topbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.topbar-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.topbar-btn.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.env-btn {
  padding: 0 8px;
}

.env-badge {
  font-size: var(--font-size-xs);
  display: flex;
  gap: 4px;
}

.add {
  color: #16a34a;
}

.del {
  color: #dc2626;
}
</style>
