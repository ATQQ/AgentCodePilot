import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'sidebar-collapse'

export type SidebarSection = 'workspaces' | 'projects' | 'conversations'

interface SidebarCollapsePersist {
  collapsedSections: string[]
  collapsedProjects: string[]
}

function loadPersist(): SidebarCollapsePersist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SidebarCollapsePersist
  } catch {
    /* ignore */
  }
  return { collapsedSections: [], collapsedProjects: [] }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

export const useSidebarStore = defineStore('sidebar', () => {
  const persisted = loadPersist()
  const collapsedSections = ref<Set<string>>(new Set(persisted.collapsedSections))
  const collapsedProjects = ref<Set<string>>(new Set(persisted.collapsedProjects))

  function persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collapsedSections: [...collapsedSections.value],
        collapsedProjects: [...collapsedProjects.value]
      })
    )
  }

  watch(
    [collapsedSections, collapsedProjects],
    () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(persist, 300)
    },
    { deep: true }
  )

  function toggleProjectCollapse(projId: string): void {
    const next = new Set(collapsedProjects.value)
    if (next.has(projId)) next.delete(projId)
    else next.add(projId)
    collapsedProjects.value = next
  }

  function isProjectCollapsed(projId: string): boolean {
    return collapsedProjects.value.has(projId)
  }

  function toggleSectionCollapse(section: SidebarSection): void {
    const next = new Set(collapsedSections.value)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    collapsedSections.value = next
  }

  function isSectionCollapsed(section: SidebarSection): boolean {
    return collapsedSections.value.has(section)
  }

  return {
    collapsedSections,
    collapsedProjects,
    toggleProjectCollapse,
    isProjectCollapsed,
    toggleSectionCollapse,
    isSectionCollapsed
  }
})
