<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue'
import AppSidebar from './AppSidebar.vue'
import SearchDialog from './SearchDialog.vue'

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
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchVisible.value = !searchVisible.value
  }
}

provide('openSearch', openSearch)
provide('toggleSidebar', toggleSidebar)

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="app-shell">
    <Transition name="sidebar-slide">
      <AppSidebar v-show="!sidebarCollapsed" />
    </Transition>
    <div class="main-content">
      <div class="main-drag-area">
        <button v-if="sidebarCollapsed" class="expand-sidebar-btn" @click="toggleSidebar" title="展开侧边栏">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <line x1="6" y1="3" x2="6" y2="13" />
          </svg>
        </button>
      </div>
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

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--content-bg);
}

.main-drag-area {
  height: var(--topbar-height);
  flex-shrink: 0;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  padding-left: var(--spacing-sm);
}

.expand-sidebar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s, color 0.15s;
}

.expand-sidebar-btn:hover {
  background: var(--btn-ghost-hover);
  color: var(--content-text);
}

.page-content {
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
