<script setup lang="ts">
import { provide, defineAsyncComponent, watch, ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import SearchDialog from './SearchDialog.vue'
import TopBarControls from './TopBarControls.vue'
import ResizableSplit from './ResizableSplit.vue'
import { useUiStore } from '@renderer/stores/ui.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { useGitStore } from '@renderer/stores/git.store'
import { formatShortcutKey } from '@renderer/composables/useShortcutLabel'

const ExtensionPanel = defineAsyncComponent(() => import('./ExtensionPanel.vue'))
const BottomPanel = defineAsyncComponent(() => import('./BottomPanel.vue'))

const router = useRouter()
const route = useRoute()
const uiStore = useUiStore()
const layoutStore = useLayoutStore()
const gitStore = useGitStore()

watch(
  () => route.name,
  (name) => {
    layoutStore.setHomeRouteActive(name === 'home')
  },
  { immediate: true }
)

const needsGitPolling = computed(() => {
  if (layoutStore.homeRouteActive) return false
  return (
    layoutStore.showBottomTerminal ||
    (layoutStore.showExtensionPanel && layoutStore.activeExtensionTab === 'review')
  )
})

watch(
  needsGitPolling,
  (needs) => {
    if (needs) gitStore.startPolling()
    else gitStore.stopPolling()
  },
  { immediate: true }
)

watch(
  () => layoutStore.homeRouteActive,
  (home) => {
    if (!home) void gitStore.refreshStatus()
  },
  { immediate: true }
)

const maxRightPanelWidth = ref(Math.floor(window.innerWidth * 0.75))

function updateMaxRightPanelWidth(): void {
  maxRightPanelWidth.value = Math.floor(window.innerWidth * 0.75)
}

onMounted(() => {
  window.addEventListener('resize', updateMaxRightPanelWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateMaxRightPanelWidth)
})

provide('openSearch', () => uiStore.openSearch())
</script>

<template>
  <div class="app-shell">
    <!-- Fixed top bar -->
    <div class="window-controls">
      <div class="controls-drag-zone" />
      <div class="controls-actions">
        <button
          class="control-btn"
          :title="`收起/展开侧边栏 (${formatShortcutKey('s')})`"
          @click="uiStore.toggleSidebar()"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <line x1="6" y1="3" x2="6" y2="13" />
          </svg>
        </button>
        <button class="control-btn" title="后退" @click="router.back()">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="10,3 5,8 10,13" />
          </svg>
        </button>
        <button class="control-btn" title="前进" @click="router.forward()">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6,3 11,8 6,13" />
          </svg>
        </button>
      </div>

      <!-- Right side controls -->
      <div class="controls-right">
        <TopBarControls />
      </div>
    </div>

    <!-- Workbench body -->
    <div class="workbench-body">
      <!-- Left sidebar -->
      <Transition name="sidebar-slide">
        <AppSidebar v-show="!uiStore.sidebarCollapsed" />
      </Transition>

      <!-- Center column: main content + bottom panel -->
      <div class="center-column">
        <div class="page-content">
          <router-view />
        </div>

        <!-- Bottom panel (terminal) -->
        <Transition name="panel-slide-v">
          <Suspense v-if="layoutStore.showBottomTerminal">
            <BottomPanel />
          </Suspense>
        </Transition>
      </div>

      <!-- Right panel resizer + extension panel -->
      <template v-if="layoutStore.showExtensionPanel">
        <ResizableSplit
          direction="horizontal"
          invert
          :size="layoutStore.rightPanelWidth"
          :min-size="260"
          :max-size="maxRightPanelWidth"
          @update:size="layoutStore.rightPanelWidth = $event"
        />
        <div class="extension-wrapper" :style="{ width: `${layoutStore.rightPanelWidth}px` }">
          <Suspense>
            <ExtensionPanel />
          </Suspense>
        </div>
      </template>
    </div>

    <SearchDialog :visible="uiStore.searchVisible" @close="uiStore.closeSearch()" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.window-controls {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  z-index: 2000;
  -webkit-app-region: drag;
}

.controls-drag-zone {
  width: 76px;
  flex-shrink: 0;
}

.controls-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.controls-right {
  margin-left: auto;
  padding-right: 8px;
  -webkit-app-region: no-drag;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.control-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.workbench-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  padding-top: var(--topbar-height);
}

.center-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--content-bg);
  min-width: 0;
}

.page-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.extension-wrapper {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

/* Sidebar slide animation */
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: width 0.2s ease, min-width 0.2s ease, opacity 0.2s ease;
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  width: 0 !important;
  min-width: 0 !important;
  opacity: 0;
}

/* Bottom panel slide animation */
.panel-slide-v-enter-active,
.panel-slide-v-leave-active {
  transition: height 0.2s ease, opacity 0.2s ease;
}

.panel-slide-v-enter-from,
.panel-slide-v-leave-to {
  height: 0 !important;
  opacity: 0;
}
</style>
