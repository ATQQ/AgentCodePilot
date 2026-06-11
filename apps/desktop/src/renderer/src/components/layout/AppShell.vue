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
      <div class="main-drag-area"></div>
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
