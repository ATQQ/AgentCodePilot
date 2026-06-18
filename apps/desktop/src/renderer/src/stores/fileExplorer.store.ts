import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { FileEntry } from '@renderer/types'
import { usePanelContextStore } from './panelContext.store'
import { useSettingsStore } from './settings.store'
import { resolveFileKind } from '@renderer/utils/fileKind'

export const useFileExplorerStore = defineStore('fileExplorer', () => {
  const expandedDirs = ref<Set<string>>(new Set())
  const childrenCache = ref<Record<string, FileEntry[]>>({})
  const filter = ref('')
  const openFilePath = ref<string | null>(null)
  const openTabs = ref<string[]>([])
  const fileContent = ref('')
  const fileLoading = ref(false)
  const editMode = ref(false)
  const dirtyContent = ref('')
  const fileReadError = ref<string | null>(null)
  const forceTextRead = ref(false)

  const panelContext = usePanelContextStore()

  const workspaceRoots = computed(() => {
    if (panelContext.isWorkspaceContext && panelContext.availableFolders.length > 0) {
      return panelContext.availableFolders.map((f) => f.path)
    }
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return []
    return [cwd]
  })

  const treeRoot = computed(() => panelContext.effectivePanelCwd)

  const filteredTree = computed(() => {
    const root = treeRoot.value
    if (!root) return []
    const q = filter.value.trim().toLowerCase()
    const entries = childrenCache.value[root] ?? []
    if (!q) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(q))
  })

  async function loadDir(dirPath: string): Promise<FileEntry[]> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return []
    const entries = await window.agentAPI.file.list(dirPath, roots)
    childrenCache.value[dirPath] = entries
    return entries
  }

  async function ensureRootLoaded(): Promise<void> {
    const root = treeRoot.value
    if (!root) return
    if (!childrenCache.value[root]) {
      await loadDir(root)
      expandedDirs.value.add(root)
    }
  }

  async function toggleDir(dirPath: string): Promise<void> {
    if (expandedDirs.value.has(dirPath)) {
      expandedDirs.value.delete(dirPath)
    } else {
      expandedDirs.value.add(dirPath)
      if (!childrenCache.value[dirPath]) {
        await loadDir(dirPath)
      }
    }
  }

  function isExpanded(dirPath: string): boolean {
    return expandedDirs.value.has(dirPath)
  }

  async function openFile(path: string, options?: { asText?: boolean }): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return

    const settingsStore = useSettingsStore()
    const asText = options?.asText ?? false
    const kind = resolveFileKind(path, settingsStore.filePreview, asText)

    openFilePath.value = path
    if (!openTabs.value.includes(path)) {
      openTabs.value = [...openTabs.value, path]
    }
    fileReadError.value = null
    forceTextRead.value = asText
    editMode.value = false

    if (kind === 'unsupported') {
      fileContent.value = ''
      dirtyContent.value = ''
      fileLoading.value = false
      return
    }

    if (kind === 'image') {
      fileContent.value = ''
      dirtyContent.value = ''
      fileLoading.value = false
      return
    }

    fileLoading.value = true
    try {
      const content = await window.agentAPI.file.read(path, roots)
      fileContent.value = content
      dirtyContent.value = content
    } catch (err) {
      fileContent.value = ''
      dirtyContent.value = ''
      fileReadError.value = err instanceof Error ? err.message : '无法读取文件'
    } finally {
      fileLoading.value = false
    }
  }

  async function readFileAsText(path: string): Promise<void> {
    await openFile(path, { asText: true })
  }

  function closeTab(path: string): void {
    openTabs.value = openTabs.value.filter((p) => p !== path)
    if (openFilePath.value === path) {
      openFilePath.value = openTabs.value[openTabs.value.length - 1] ?? null
      if (openFilePath.value) {
        void openFile(openFilePath.value)
      } else {
        fileContent.value = ''
        dirtyContent.value = ''
        fileReadError.value = null
        editMode.value = false
      }
    }
  }

  function closeOtherTabs(keepPath: string): void {
    openTabs.value = [keepPath]
    if (openFilePath.value !== keepPath) {
      void openFile(keepPath)
    }
  }

  function closeAllTabs(): void {
    openTabs.value = []
    openFilePath.value = null
    fileContent.value = ''
    dirtyContent.value = ''
    fileReadError.value = null
    editMode.value = false
  }

  function selectTab(path: string): void {
    if (openFilePath.value !== path) {
      void openFile(path)
    }
  }

  async function saveFile(): Promise<boolean> {
    const path = openFilePath.value
    const roots = workspaceRoots.value
    if (!path || roots.length === 0) return false

    await window.agentAPI.file.write(path, dirtyContent.value, roots)
    fileContent.value = dirtyContent.value
    return true
  }

  async function deleteFile(path: string): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    await window.agentAPI.file.delete(path, roots)
    if (openFilePath.value === path) {
      openFilePath.value = null
      openTabs.value = openTabs.value.filter((p) => p !== path)
      fileContent.value = ''
      dirtyContent.value = ''
      fileReadError.value = null
      forceTextRead.value = false
    }
    const parent = path.replace(/[/\\][^/\\]+$/, '')
    delete childrenCache.value[parent]
    await loadDir(parent || treeRoot.value!)
  }

  async function copyFile(srcPath: string, destPath: string): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    await window.agentAPI.file.copy(srcPath, destPath, roots)
    const parent = destPath.replace(/[/\\][^/\\]+$/, '')
    delete childrenCache.value[parent]
    await loadDir(parent)
  }

  function setEditMode(enabled: boolean): void {
    editMode.value = enabled
    if (!enabled) {
      dirtyContent.value = fileContent.value
    }
  }

  function clearCache(): void {
    childrenCache.value = {}
    expandedDirs.value.clear()
    openTabs.value = []
    fileContent.value = ''
    dirtyContent.value = ''
    editMode.value = false
    fileReadError.value = null
    forceTextRead.value = false
  }

  watch(
    () => panelContext.effectivePanelCwd,
    async () => {
      clearCache()
      await ensureRootLoaded()
    }
  )

  return {
    filter,
    openFilePath,
    openTabs,
    fileContent,
    dirtyContent,
    fileLoading,
    editMode,
    fileReadError,
    forceTextRead,
    filteredTree,
    treeRoot,
    childrenCache,
    workspaceRoots,
    ensureRootLoaded,
    loadDir,
    toggleDir,
    isExpanded,
    openFile,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    selectTab,
    readFileAsText,
    saveFile,
    deleteFile,
    copyFile,
    setEditMode,
    clearCache
  }
})
