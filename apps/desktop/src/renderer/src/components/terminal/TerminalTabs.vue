<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useTerminalStore } from '@renderer/stores/terminal.store'
import { useChatStore } from '@renderer/stores/chat.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import TerminalView from './TerminalView.vue'
import TerminalFolderPicker from './TerminalFolderPicker.vue'
import ResizableSplit from '@renderer/components/layout/ResizableSplit.vue'

const terminalStore = useTerminalStore()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()

const showFolderPicker = ref(false)
const splitWidth = ref(400)
let initTimer: ReturnType<typeof setTimeout> | null = null
let initGeneration = 0

const terminalViewRefs = ref<Map<string, InstanceType<typeof TerminalView>>>(new Map())

function setTerminalRef(el: unknown, terminalId: string): void {
  if (el) {
    terminalViewRefs.value.set(terminalId, el as InstanceType<typeof TerminalView>)
  } else {
    terminalViewRefs.value.delete(terminalId)
  }
}

function refitActivePanes(): void {
  const tab = terminalStore.activeTab
  if (!tab) return
  for (const paneId of tab.panes) {
    terminalViewRefs.value.get(paneId)?.refit?.()
  }
}

async function init(): Promise<void> {
  const gen = ++initGeneration
  const scopeKey = terminalStore.currentScopeKey
  await terminalStore.ensureTerminals()
  if (gen !== initGeneration) return
  if (scopeKey && terminalStore.currentScopeKey !== scopeKey) return
  nextTick(() => refitActivePanes())
}

function scheduleInit(): void {
  if (initTimer) clearTimeout(initTimer)
  initTimer = setTimeout(() => {
    initTimer = null
    void init()
  }, 80)
}

onMounted(() => {
  void init()
})

watch(
  () => [
    chatStore.activeConversationId,
    chatStore.activeConversation?.projectId,
    workspaceStore.selectedProjectId
  ],
  scheduleInit
)

watch(
  () => terminalStore.activeTab?.id,
  () => {
    nextTick(() => refitActivePanes())
  }
)

async function onNewTab(): Promise<void> {
  if (terminalStore.needsFolderPicker()) {
    showFolderPicker.value = true
    return
  }
  await terminalStore.createTerminal()
  nextTick(() => refitActivePanes())
}

async function onFolderSelect(path: string): Promise<void> {
  showFolderPicker.value = false
  await terminalStore.createTerminal(path)
  nextTick(() => refitActivePanes())
}

function onFolderCancel(): void {
  showFolderPicker.value = false
}
</script>

<template>
  <div class="terminal-tabs">
    <div
      v-if="!terminalStore.currentScope.scopeKey || !terminalStore.currentScope.defaultCwd"
      class="empty-state"
    >
      <span>打开对话或选择工作空间以使用终端</span>
    </div>

    <template v-else>
      <div class="tab-bar elegant-scroll">
        <button
          v-for="tab in terminalStore.currentTabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: terminalStore.activeTab?.id === tab.id }"
          @click="void terminalStore.setActiveTab(tab.id)"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            class="tab-icon"
          >
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <polyline points="5,6 7.5,8 5,10" />
            <line x1="8" y1="10" x2="11" y2="10" />
          </svg>
          {{ tab.title }}
          <span class="close-tab" @click.stop="terminalStore.closeTab(tab.id)">×</span>
        </button>
        <button class="icon-btn" title="新建终端" @click="onNewTab">+</button>
        <button
          v-if="terminalStore.activeTab && terminalStore.activeTab.panes.length === 1"
          class="icon-btn"
          title="左右分屏"
          @click="terminalStore.splitActiveTab().then(() => nextTick(refitActivePanes))"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <line x1="8" y1="2" x2="8" y2="14" />
          </svg>
        </button>
      </div>

      <div class="terminal-wrapper">
        <div
          v-for="tab in terminalStore.currentTabs"
          v-show="terminalStore.activeTab?.id === tab.id && tab.panes.length > 0"
          :key="tab.id"
          class="tab-content"
        >
          <div class="split-container">
            <div
              class="split-pane-left"
              :class="{ 'is-full': tab.panes.length === 1 }"
              :style="tab.panes.length === 2 ? { width: `${splitWidth}px` } : undefined"
            >
              <TerminalView
                v-if="tab.panes[0]"
                :key="tab.panes[0]"
                :ref="(el) => setTerminalRef(el, tab.panes[0])"
                :terminal-id="tab.panes[0]"
                :active="terminalStore.activeTab?.id === tab.id"
              />
            </div>
            <ResizableSplit
              v-if="tab.panes.length === 2"
              direction="horizontal"
              :size="splitWidth"
              :min-size="160"
              :max-size="800"
              @update:size="splitWidth = $event"
            />
            <div v-if="tab.panes[1]" class="split-pane-right">
              <TerminalView
                :key="tab.panes[1]"
                :ref="(el) => setTerminalRef(el, tab.panes[1])"
                :terminal-id="tab.panes[1]"
                :active="terminalStore.activeTab?.id === tab.id"
              />
            </div>
          </div>
        </div>

        <div
          v-if="
            terminalStore.isInitializing ||
            (!terminalStore.activeTab && terminalStore.currentTabs.length === 0)
          "
          class="empty-state overlay"
        >
          正在启动终端…
        </div>
      </div>
    </template>

    <TerminalFolderPicker
      v-if="showFolderPicker"
      :folders="terminalStore.currentScope.workspaceFolders"
      @select="onFolderSelect"
      @cancel="onFolderCancel"
    />
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

.tab-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.close-tab {
  opacity: 0.5;
  font-size: 14px;
  line-height: 1;
}

.close-tab:hover {
  opacity: 1;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  height: 26px;
  min-width: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.icon-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.terminal-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.tab-content {
  height: 100%;
  overflow: hidden;
}

.split-container {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.split-pane-left {
  flex-shrink: 0;
  overflow: hidden;
  height: 100%;
  min-width: 0;
}

.split-pane-left.is-full {
  flex: 1;
  width: auto !important;
}

.split-pane-right {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  height: 100%;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}

.empty-state.overlay {
  position: absolute;
  inset: 0;
  background: var(--content-bg);
  z-index: 2;
}
</style>
