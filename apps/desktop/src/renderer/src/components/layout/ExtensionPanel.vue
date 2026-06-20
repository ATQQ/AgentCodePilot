<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLayoutStore } from '@renderer/stores/layout.store'

const { t } = useI18n()

const DiffView = defineAsyncComponent(
  () => import('@renderer/components/workspace/DiffViewer.vue')
)
const TerminalTabs = defineAsyncComponent(
  () => import('@renderer/components/terminal/TerminalTabs.vue')
)
const BrowserView = defineAsyncComponent(
  () => import('@renderer/components/workspace/BrowserView.vue')
)
const FileTree = defineAsyncComponent(
  () => import('@renderer/components/workspace/FileTree.vue')
)
const PlansPanel = defineAsyncComponent(
  () => import('@renderer/components/plans/PlansPanel.vue')
)

import FolderSwitcher from './FolderSwitcher.vue'

const layoutStore = useLayoutStore()

interface TabDef {
  id: typeof layoutStore.activeExtensionTab
  label: string
  icon: string
}

const tabs: TabDef[] = [
  { id: 'review', label: '审查', icon: 'review' },
  { id: 'files', label: '文件', icon: 'files' },
  { id: 'plans', label: t('plans.tabLabel'), icon: 'plans' },
  { id: 'browser', label: '浏览器', icon: 'browser' },
  { id: 'terminal', label: '终端', icon: 'terminal' }
]

const isTerminalTab = computed(() => layoutStore.activeExtensionTab === 'terminal')
</script>

<template>
  <div class="extension-panel">
    <div class="tab-bar elegant-scroll">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: layoutStore.activeExtensionTab === tab.id }"
        @click="layoutStore.openExtensionTab(tab.id)"
      >
        <!-- Review -->
        <svg v-if="tab.icon === 'review'" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="1" width="12" height="14" rx="1.5" />
          <line x1="5" y1="5" x2="11" y2="5" />
          <line x1="5" y1="8" x2="11" y2="8" />
          <line x1="5" y1="11" x2="8" y2="11" />
        </svg>
        <!-- Terminal -->
        <svg v-else-if="tab.icon === 'terminal'" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <polyline points="5,6 7.5,8 5,10" />
          <line x1="8" y1="10" x2="11" y2="10" />
        </svg>
        <!-- Browser -->
        <svg v-else-if="tab.icon === 'browser'" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5" />
          <line x1="1" y1="6" x2="15" y2="6" />
          <circle cx="4" cy="4" r="1" fill="currentColor" stroke="none" />
          <circle cx="7" cy="4" r="1" fill="currentColor" stroke="none" />
        </svg>
        <!-- Files -->
        <svg v-else-if="tab.icon === 'files'" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4a1 1 0 0 1 1-1h3.586a1 1 0 0 1 .707.293L8.707 4.7A1 1 0 0 0 9.414 5H13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" />
        </svg>
        <!-- Plans -->
        <svg v-else-if="tab.icon === 'plans'" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="1" width="12" height="14" rx="1.5" />
          <line x1="5" y1="5" x2="11" y2="5" />
          <line x1="5" y1="8" x2="11" y2="8" />
          <line x1="5" y1="11" x2="9" y2="11" />
          <circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" />
        </svg>
        <span>{{ tab.label }}</span>
      </button>
      <div class="tab-spacer" />
      <button class="close-btn" title="关闭扩展栏" @click="layoutStore.closeRightPanel()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="1" y1="1" x2="11" y2="11" />
          <line x1="11" y1="1" x2="1" y2="11" />
        </svg>
      </button>
    </div>

    <FolderSwitcher />

    <div class="panel-content">
      <Suspense>
        <DiffView v-if="layoutStore.activeExtensionTab === 'review'" />
        <TerminalTabs v-else-if="isTerminalTab" embedded />
        <BrowserView v-else-if="layoutStore.activeExtensionTab === 'browser'" />
        <FileTree v-else-if="layoutStore.activeExtensionTab === 'files'" />
        <PlansPanel v-else-if="layoutStore.activeExtensionTab === 'plans'" />
      </Suspense>
    </div>
  </div>
</template>

<style scoped>
.extension-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--content-bg);
  border-left: 1px solid var(--sidebar-border);
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  border-bottom: 1px solid var(--sidebar-border);
  padding: 0 4px;
  flex-shrink: 0;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-app-region: no-drag;
  /* Keep horizontal scrollbar from shifting tab buttons vertically */
  padding-bottom: 4px;
  margin-bottom: -4px;
  box-sizing: border-box;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.tab-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.tab-btn.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.tab-spacer {
  flex: 1;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  flex-shrink: 0;
}

.close-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
