import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { FileEntry } from '@renderer/types'
import { usePanelContextStore } from './panelContext.store'
import { useSettingsStore } from './settings.store'
import { resolveFileKind } from '@renderer/utils/fileKind'
import {
  getBaseName,
  getParentDir,
  isDescendantOrSelf,
  joinWorkspacePath,
  remapPathPrefix
} from '@renderer/utils/workspacePath'

export type FileClipboardMode = 'copy' | 'cut'

export interface FileClipboardEntry {
  path: string
  mode: FileClipboardMode
}

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
  const previewLanguageOverride = ref<string | null>(null)
  const textReadOverrides = ref<Record<string, { language: string }>>({})
  const fileTreeOpenBeforeEdit = ref(false)
  const fileSaveToken = ref(0)
  const fileClipboard = ref<FileClipboardEntry | null>(null)

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

  async function openFile(
    path: string,
    options?: { asText?: boolean; language?: string }
  ): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return

    const settingsStore = useSettingsStore()
    if (options?.asText) {
      textReadOverrides.value[path] = {
        language: options.language ?? textReadOverrides.value[path]?.language ?? 'plaintext'
      }
    }

    const override = textReadOverrides.value[path]
    const asText = options?.asText ?? Boolean(override)
    const kind = resolveFileKind(path, settingsStore.filePreview, asText)

    openFilePath.value = path
    if (!openTabs.value.includes(path)) {
      openTabs.value = [...openTabs.value, path]
    }
    fileReadError.value = null
    forceTextRead.value = asText
    previewLanguageOverride.value = override?.language ?? options?.language ?? null
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

  async function readFileAsText(path: string, language = 'plaintext'): Promise<void> {
    await openFile(path, { asText: true, language })
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
    fileSaveToken.value += 1
    void notifyWorkspaceMutation()
    return true
  }

  async function invalidateAndReload(parentDir: string): Promise<void> {
    delete childrenCache.value[parentDir]
    await loadDir(parentDir)
  }

  async function refreshExpandedDirs(): Promise<void> {
    const root = treeRoot.value
    if (!root) return
    const dirs = [...expandedDirs.value]
    await Promise.all(dirs.map((dir) => loadDir(dir)))
  }

  function notifyWorkspaceMutation(): void {
    void import('./git.store').then(({ useGitStore }) => {
      void useGitStore().refreshStatus({ silent: true })
    })
  }

  function closeTabsUnderPath(path: string): void {
    const normalized = path.replace(/[/\\]+$/, '')
    const toClose = openTabs.value.filter(
      (tab) =>
        tab === normalized || tab.startsWith(`${normalized}/`) || tab.startsWith(`${normalized}\\`)
    )
    for (const tab of toClose) {
      closeTab(tab)
    }
  }

  function remapOpenPaths(oldPath: string, newPath: string): void {
    const nextTabs = openTabs.value.map((tab) => remapPathPrefix(tab, oldPath, newPath))
    openTabs.value = [...new Set(nextTabs)]
    if (openFilePath.value) {
      openFilePath.value = remapPathPrefix(openFilePath.value, oldPath, newPath)
    }
    const nextOverrides: Record<string, { language: string }> = {}
    for (const [tab, override] of Object.entries(textReadOverrides.value)) {
      nextOverrides[remapPathPrefix(tab, oldPath, newPath)] = override
    }
    textReadOverrides.value = nextOverrides
  }

  async function entryExistsInDir(parentDir: string, name: string): Promise<boolean> {
    const entries = childrenCache.value[parentDir] ?? (await loadDir(parentDir))
    return entries.some((e) => e.name === name)
  }

  function copyToClipboard(path: string, mode: FileClipboardMode): void {
    fileClipboard.value = { path, mode }
  }

  function clearClipboard(): void {
    fileClipboard.value = null
  }

  function canPasteIntoDir(targetDir: string): boolean {
    const clip = fileClipboard.value
    if (!clip) return false
    if (clip.mode === 'cut' && isDescendantOrSelf(clip.path, targetDir)) {
      return false
    }
    return true
  }

  async function pasteIntoDir(targetDir: string, overwrite = false): Promise<void> {
    const clip = fileClipboard.value
    if (!clip || !canPasteIntoDir(targetDir)) return

    const name = getBaseName(clip.path)
    const destPath = joinWorkspacePath(targetDir, name)
    const exists = await entryExistsInDir(targetDir, name)

    if (exists && !overwrite) {
      throw new Error('TARGET_EXISTS')
    }

    if (clip.mode === 'copy') {
      if (exists) {
        await window.agentAPI.file.delete(destPath, workspaceRoots.value)
      }
      await copyFile(clip.path, destPath)
    } else {
      await moveEntry(clip.path, destPath, exists)
      clearClipboard()
    }
    void notifyWorkspaceMutation()
  }

  async function mkdir(dirPath: string): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    await window.agentAPI.file.mkdir(dirPath, roots)
    const parent = getParentDir(dirPath)
    await invalidateAndReload(parent || treeRoot.value!)
    void notifyWorkspaceMutation()
  }

  async function renameEntry(oldPath: string, newPath: string): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    await window.agentAPI.file.rename(oldPath, newPath, roots)
    remapOpenPaths(oldPath, newPath)
    const oldParent = getParentDir(oldPath)
    const newParent = getParentDir(newPath)
    await invalidateAndReload(oldParent || treeRoot.value!)
    if (newParent !== oldParent) {
      await invalidateAndReload(newParent || treeRoot.value!)
    }
    void notifyWorkspaceMutation()
  }

  async function moveEntry(srcPath: string, destPath: string, overwrite = false): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    if (overwrite && (await entryExistsInDir(getParentDir(destPath), getBaseName(destPath)))) {
      await window.agentAPI.file.delete(destPath, roots)
    }
    await window.agentAPI.file.rename(srcPath, destPath, roots)
    remapOpenPaths(srcPath, destPath)
    const srcParent = getParentDir(srcPath)
    const destParent = getParentDir(destPath)
    await invalidateAndReload(srcParent || treeRoot.value!)
    if (destParent !== srcParent) {
      await invalidateAndReload(destParent || treeRoot.value!)
    }
    void notifyWorkspaceMutation()
  }

  async function createFile(parentDir: string, name: string): Promise<string> {
    const filePath = joinWorkspacePath(parentDir, name)
    const roots = workspaceRoots.value
    if (roots.length === 0) return filePath
    await window.agentAPI.file.write(filePath, '', roots)
    await invalidateAndReload(parentDir)
    void notifyWorkspaceMutation()
    return filePath
  }

  async function createDirectory(parentDir: string, name: string): Promise<string> {
    const dirPath = joinWorkspacePath(parentDir, name)
    await mkdir(dirPath)
    expandedDirs.value.add(dirPath)
    return dirPath
  }

  async function deleteFile(path: string): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    await window.agentAPI.file.delete(path, roots)
    closeTabsUnderPath(path)
    if (openFilePath.value === path) {
      openFilePath.value = null
      fileContent.value = ''
      dirtyContent.value = ''
      fileReadError.value = null
      forceTextRead.value = false
      previewLanguageOverride.value = null
      delete textReadOverrides.value[path]
    }
    const parent = getParentDir(path)
    await invalidateAndReload(parent || treeRoot.value!)
    void notifyWorkspaceMutation()
  }

  async function copyFile(srcPath: string, destPath: string): Promise<void> {
    const roots = workspaceRoots.value
    if (roots.length === 0) return
    await window.agentAPI.file.copy(srcPath, destPath, roots)
    const parent = getParentDir(destPath)
    await invalidateAndReload(parent || treeRoot.value!)
    void notifyWorkspaceMutation()
  }

  function setEditMode(enabled: boolean): void {
    editMode.value = enabled
    if (!enabled) {
      dirtyContent.value = fileContent.value
    }
  }

  function rememberFileTreeOpenBeforeEdit(wasOpen: boolean): void {
    fileTreeOpenBeforeEdit.value = wasOpen
  }

  function consumeFileTreeRestore(): boolean {
    const shouldRestore = fileTreeOpenBeforeEdit.value
    fileTreeOpenBeforeEdit.value = false
    return shouldRestore
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
    previewLanguageOverride.value = null
    textReadOverrides.value = {}
    fileTreeOpenBeforeEdit.value = false
    fileClipboard.value = null
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
    previewLanguageOverride,
    textReadOverrides,
    fileSaveToken,
    fileClipboard,
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
    copyToClipboard,
    clearClipboard,
    canPasteIntoDir,
    pasteIntoDir,
    mkdir,
    renameEntry,
    moveEntry,
    createFile,
    createDirectory,
    entryExistsInDir,
    invalidateAndReload,
    refreshExpandedDirs,
    setEditMode,
    rememberFileTreeOpenBeforeEdit,
    consumeFileTreeRestore,
    clearCache
  }
})
