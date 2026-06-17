import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useChatStore } from './chat.store'
import { useWorkspaceStore } from './workspace.store'
import { useLayoutStore } from './layout.store'

export interface PanelFolderOption {
  path: string
  label: string
}

export const usePanelContextStore = defineStore('panelContext', () => {
  const selectedFolderPath = ref<string | null>(null)

  const chatStore = useChatStore()
  const workspaceStore = useWorkspaceStore()
  const layoutStore = useLayoutStore()

  const activeConversation = computed(() => chatStore.activeConversation)

  const conversationWorkspace = computed(() => {
    const projectId = activeConversation.value?.projectId
    if (!projectId) return null
    return workspaceStore.workspaces.find((w) => w.id === projectId) ?? null
  })

  const isWorkspaceContext = computed(() => conversationWorkspace.value !== null)

  const availableFolders = computed<PanelFolderOption[]>(() => {
    const ws = conversationWorkspace.value
    if (!ws) return []
    return ws.folders.map((path) => {
      const project = workspaceStore.projects.find((p) => p.path === path)
      const label = project?.name ?? path.split('/').pop() ?? path
      return { path, label }
    })
  })

  function resolveDefaultFolder(): string | null {
    const ws = conversationWorkspace.value
    if (ws && ws.folders.length > 0) {
      const convCwd = activeConversation.value?.cwd
      if (convCwd && ws.folders.includes(convCwd)) return convCwd
      return ws.folders[0]
    }

    const projectId = activeConversation.value?.projectId
    if (projectId) {
      const project = workspaceStore.projects.find((p) => p.id === projectId)
      if (project) return project.path
    }

    if (activeConversation.value?.cwd) return activeConversation.value.cwd
    return workspaceStore.currentCwd ?? null
  }

  const effectivePanelCwd = computed<string | undefined>(() => {
    if (layoutStore.homeRouteActive) return undefined
    if (isWorkspaceContext.value) {
      return selectedFolderPath.value ?? availableFolders.value[0]?.path
    }
    return resolveDefaultFolder() ?? undefined
  })

  function selectFolder(path: string): void {
    selectedFolderPath.value = path
  }

  function resetFolderSelection(): void {
    selectedFolderPath.value = resolveDefaultFolder()
  }

  watch(
    () => [
      chatStore.activeConversationId,
      activeConversation.value?.projectId,
      activeConversation.value?.cwd
    ],
    () => {
      resetFolderSelection()
    },
    { immediate: true }
  )

  return {
    selectedFolderPath,
    effectivePanelCwd,
    isWorkspaceContext,
    availableFolders,
    selectFolder,
    resetFolderSelection
  }
})
