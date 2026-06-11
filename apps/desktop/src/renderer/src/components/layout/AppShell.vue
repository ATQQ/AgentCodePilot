<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { useRouter } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import SearchDialog from './SearchDialog.vue'

const router = useRouter()
const searchVisible = ref(false)
const sidebarCollapsed = ref(false)

function openSearch(): void {
  searchVisible.value = true
}

function closeSearch(): void {
  searchVisible.value = false
}

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function handleGlobalKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
    e.preventDefault()
    searchVisible.value = !searchVisible.value
  }
}

provide('openSearch', openSearch)

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="app-shell">
    <div class="window-controls">
      <div class="controls-drag-zone"></div>
      <div class="controls-actions">
        <button class="control-btn" @click="toggleSidebar" title="收起/展开侧边栏">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <line x1="6" y1="3" x2="6" y2="13" />
          </svg>
        </button>
        <button class="control-btn" @click="router.back()" title="后退">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="10,3 5,8 10,13" />
          </svg>
        </button>
        <button class="control-btn" @click="router.forward()" title="前进">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6,3 11,8 6,13" />
          </svg>
        </button>
      </div>
    </div>
    <Transition name="sidebar-slide">
      <AppSidebar v-show="!sidebarCollapsed" />
    </Transition>
    <div class="main-content">
      <div class="page-content">
        <router-view />
      </div>
    </div>
    <SearchDialog :visible="searchVisible" @close="closeSearch" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
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

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--content-bg);
}

.page-content {
  padding-top: var(--topbar-height);
  flex: 1;
  overflow: auto;
}

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
</style>
