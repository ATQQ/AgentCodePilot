import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'sidebar-layout'
export const SIDEBAR_MIN_WIDTH = 220
export const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_DEFAULT_WIDTH = 220

interface SidebarLayoutPersist {
  sidebarWidth: number
  sidebarCollapsed: boolean
}

function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)))
}

function loadPersist(): SidebarLayoutPersist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarLayoutPersist>
      const width =
        typeof parsed.sidebarWidth === 'number'
          ? clampSidebarWidth(parsed.sidebarWidth)
          : SIDEBAR_DEFAULT_WIDTH
      return {
        sidebarWidth: width,
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed)
      }
    }
  } catch {
    /* ignore */
  }
  return {
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    sidebarCollapsed: false
  }
}

export const useUiStore = defineStore('ui', () => {
  const persisted = loadPersist()
  const sidebarCollapsed = ref(persisted.sidebarCollapsed)
  const sidebarWidth = ref(persisted.sidebarWidth)
  const searchVisible = ref(false)

  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function persistLayout(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sidebarWidth: sidebarWidth.value,
        sidebarCollapsed: sidebarCollapsed.value
      } satisfies SidebarLayoutPersist)
    )
  }

  watch([sidebarWidth, sidebarCollapsed], () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persistLayout, 300)
  })

  function setSidebarWidth(width: number): void {
    sidebarWidth.value = clampSidebarWidth(width)
  }

  function collapseSidebar(): void {
    sidebarCollapsed.value = true
  }

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
    sidebarWidth,
    searchVisible,
    setSidebarWidth,
    collapseSidebar,
    toggleSidebar,
    openSearch,
    closeSearch,
    toggleSearch
  }
})
