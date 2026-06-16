import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)
  const searchVisible = ref(false)

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function openSearch(): void {
    searchVisible.value = true
  }

  function closeSearch(): void {
    searchVisible.value = false
  }

  function toggleSearch(): void {
    searchVisible.value = !searchVisible.value
  }

  return {
    sidebarCollapsed,
    searchVisible,
    toggleSidebar,
    openSearch,
    closeSearch,
    toggleSearch
  }
})
