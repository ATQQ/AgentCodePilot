import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import type { GitStatusResult, GitChangedFile, GitDiffScope, GitChangeType } from '@renderer/types'
import { formatGitOperationError } from '@renderer/utils/gitError'
import { usePanelContextStore } from './panelContext.store'
import { useLayoutStore } from './layout.store'

type DiffContent = { original: string; modified: string }

function emptyScopeRecord<T>(value: T): Record<GitDiffScope, T> {
  return { unstaged: value, staged: value }
}

function diffCacheKey(scope: GitDiffScope, file: string): string {
  return `${scope}:${file}`
}

function joinRepoPath(cwd: string, relativePath: string): string {
  const base = cwd.replace(/[/\\]+$/, '')
  const relative = relativePath.replace(/^[/\\]+/, '')
  return `${base}/${relative}`
}

export const useGitStore = defineStore('git', () => {
  const status = ref<GitStatusResult | null>(null)
  const changedFiles = ref<GitChangedFile[]>([])
  const loading = ref(false)
  const selectedFile = ref<string | null>(null)
  const diffOriginal = ref('')
  const diffModified = ref('')
  const diffLoading = ref(false)
  const diffRefreshing = ref(false)
  const diffError = ref<string | null>(null)
  const commitMessage = ref('')
  const operationError = ref<string | null>(null)
  const operationErrorLog = ref<string | null>(null)

  const changedFilesByScope = ref(emptyScopeRecord<GitChangedFile[]>([]))
  const selectedFileByScope = ref(emptyScopeRecord<string | null>(null))
  const openTabsByScope = ref(emptyScopeRecord<string[]>([]))
  const filesLoadingByScope = ref(emptyScopeRecord(false))
  const scopeLoaded = ref(emptyScopeRecord(false))

  const diffCache = new Map<string, DiffContent>()
  const loadFilesRequestId = emptyScopeRecord(0)
  let loadDiffRequestId = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const pendingSaveContent = new Map<string, string>()

  const panelContext = usePanelContextStore()
  const layoutStore = useLayoutStore()

  const changeTypeByPath = computed(() => {
    const map = new Map<string, GitChangeType>()
    for (const file of status.value?.files ?? []) {
      if (file.changeType) map.set(file.path, file.changeType)
    }
    return map
  })

  function getChangeTypeForPath(relativePath: string): GitChangeType | undefined {
    return changeTypeByPath.value.get(relativePath)
  }

  function isFilesLoading(scope: GitDiffScope): boolean {
    return filesLoadingByScope.value[scope]
  }

  function resetScopeCaches(): void {
    changedFilesByScope.value = emptyScopeRecord<GitChangedFile[]>([])
    selectedFileByScope.value = emptyScopeRecord<string | null>(null)
    openTabsByScope.value = emptyScopeRecord<string[]>([])
    filesLoadingByScope.value = emptyScopeRecord(false)
    scopeLoaded.value = emptyScopeRecord(false)
    diffCache.clear()
    changedFiles.value = []
    selectedFile.value = null
    diffOriginal.value = ''
    diffModified.value = ''
    diffLoading.value = false
    diffRefreshing.value = false
    diffError.value = null
    commitMessage.value = ''
    operationError.value = null
    operationErrorLog.value = null
  }

  function clearOperationError(): void {
    operationError.value = null
    operationErrorLog.value = null
  }

  function setOperationError(err: unknown, fallback: string): void {
    const formatted = formatGitOperationError(err, fallback)
    operationError.value = formatted.summary
    operationErrorLog.value = formatted.log
  }

  function invalidateDiffCache(paths?: string[]): void {
    if (!paths?.length) {
      diffCache.clear()
      return
    }
    for (const path of paths) {
      diffCache.delete(diffCacheKey('unstaged', path))
      diffCache.delete(diffCacheKey('staged', path))
    }
  }

  function markScopesStale(): void {
    scopeLoaded.value = emptyScopeRecord(false)
  }

  function applyScope(scope: GitDiffScope): void {
    changedFiles.value = [...changedFilesByScope.value[scope]]
    selectedFile.value = selectedFileByScope.value[scope]
    pruneTabs(scope)

    const file = selectedFile.value
    if (!file) {
      diffOriginal.value = ''
      diffModified.value = ''
      diffLoading.value = false
      diffRefreshing.value = false
      return
    }

    const cached = diffCache.get(diffCacheKey(scope, file))
    if (cached) {
      diffOriginal.value = cached.original
      diffModified.value = cached.modified
      diffLoading.value = false
    } else {
      diffOriginal.value = ''
      diffModified.value = ''
    }
  }

  async function ensureGitReady(): Promise<boolean> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return false
    if (!status.value?.isRepo) {
      await refreshStatus()
    }
    return status.value?.isRepo === true
  }

  async function refreshStatus(options?: { silent?: boolean }): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) {
      status.value = null
      return
    }

    if (!options?.silent) loading.value = true
    try {
      status.value = await window.agentAPI.git.status(cwd)
    } finally {
      if (!options?.silent) loading.value = false
    }
  }

  async function loadChangedFiles(
    scope: GitDiffScope,
    options?: { reloadCurrentDiff?: boolean; silent?: boolean }
  ): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) {
      resetScopeCaches()
      return
    }

    if (!status.value?.isRepo) {
      await refreshStatus()
    }
    if (!status.value?.isRepo) {
      changedFilesByScope.value[scope] = []
      scopeLoaded.value[scope] = true
      if (layoutStore.reviewScope === scope) {
        changedFiles.value = []
        selectedFile.value = null
        selectedFileByScope.value[scope] = null
      }
      return
    }

    const requestId = ++loadFilesRequestId[scope]
    if (!options?.silent) filesLoadingByScope.value[scope] = true

    try {
      const files = await window.agentAPI.git.changedFiles(cwd, scope)
      if (requestId !== loadFilesRequestId[scope]) return

      changedFilesByScope.value[scope] = files
      scopeLoaded.value[scope] = true

      const prevSelected = selectedFileByScope.value[scope]
      const nextSelected = files.some((f) => f.path === prevSelected)
        ? prevSelected
        : (files[0]?.path ?? null)
      if (nextSelected && !openTabsByScope.value[scope].includes(nextSelected)) {
        openTabsByScope.value[scope] = [...openTabsByScope.value[scope], nextSelected]
      }
      selectedFileByScope.value[scope] = nextSelected

      if (layoutStore.reviewScope === scope) {
        changedFiles.value = files
        pruneTabs(scope)
        if (selectedFile.value !== nextSelected) {
          selectedFile.value = nextSelected
        }
      }

      if (
        (options?.reloadCurrentDiff ?? true) &&
        layoutStore.reviewScope === scope &&
        nextSelected
      ) {
        await loadDiffForSelection()
      }
    } finally {
      if (requestId === loadFilesRequestId[scope] && !options?.silent) {
        filesLoadingByScope.value[scope] = false
      }
    }
  }

  async function loadAllChangedFiles(): Promise<void> {
    await Promise.all([loadChangedFiles('unstaged'), loadChangedFiles('staged')])
    applyScope(layoutStore.reviewScope)
  }

  async function refreshAllScopes(): Promise<void> {
    markScopesStale()
    await loadAllChangedFiles()
  }

  async function loadDiffForSelection(): Promise<void> {
    const file = selectedFile.value
    if (!file) return
    await loadDiff(file, layoutStore.reviewScope === 'staged')
  }

  async function loadDiff(file: string, staged: boolean): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return

    const scope: GitDiffScope = staged ? 'staged' : 'unstaged'
    const key = diffCacheKey(scope, file)
    const cached = diffCache.get(key)
    const requestId = ++loadDiffRequestId

    const ready = await ensureGitReady()
    if (!ready) {
      if (requestId !== loadDiffRequestId) return
      diffError.value = '不是 Git 仓库'
      diffLoading.value = false
      diffRefreshing.value = false
      return
    }

    diffError.value = null

    if (cached) {
      diffOriginal.value = cached.original
      diffModified.value = cached.modified
      diffLoading.value = false
      diffRefreshing.value = true
    } else {
      diffLoading.value = true
      diffRefreshing.value = false
    }

    try {
      const result = await window.agentAPI.git.diff(cwd, file, staged)
      if (requestId !== loadDiffRequestId) return

      diffCache.set(key, result)

      if (selectedFile.value === file && layoutStore.reviewScope === scope) {
        diffOriginal.value = result.original
        diffModified.value = result.modified
      }
    } catch (err) {
      if (requestId !== loadDiffRequestId) return
      diffError.value = err instanceof Error ? err.message : '加载 diff 失败'
      if (selectedFile.value === file && layoutStore.reviewScope === scope) {
        diffOriginal.value = ''
        diffModified.value = ''
      }
    } finally {
      if (requestId === loadDiffRequestId) {
        diffLoading.value = false
        diffRefreshing.value = false
      }
    }
  }

  function pruneTabs(scope: GitDiffScope): void {
    const valid = new Set(changedFilesByScope.value[scope].map((f) => f.path))
    const tabs = openTabsByScope.value[scope].filter((p) => valid.has(p))
    openTabsByScope.value[scope] = tabs
    if (selectedFileByScope.value[scope] && !valid.has(selectedFileByScope.value[scope]!)) {
      const next = tabs[tabs.length - 1] ?? changedFilesByScope.value[scope][0]?.path ?? null
      selectedFileByScope.value[scope] = next
      if (layoutStore.reviewScope === scope) selectedFile.value = next
    }
  }

  function getOpenTabs(scope?: GitDiffScope): string[] {
    const s = scope ?? layoutStore.reviewScope
    return openTabsByScope.value[s]
  }

  function openFileTab(path: string): void {
    const scope = layoutStore.reviewScope
    if (!openTabsByScope.value[scope].includes(path)) {
      openTabsByScope.value[scope] = [...openTabsByScope.value[scope], path]
    }
    selectFile(path)
  }

  function closeFileTab(path: string): void {
    const scope = layoutStore.reviewScope
    if (scope === 'unstaged') flushPendingSave(path)
    const tabs = openTabsByScope.value[scope].filter((p) => p !== path)
    openTabsByScope.value[scope] = tabs
    if (selectedFile.value === path) {
      const next = tabs[tabs.length - 1] ?? null
      selectedFile.value = next
      selectedFileByScope.value[scope] = next
      if (!next) {
        diffOriginal.value = ''
        diffModified.value = ''
      }
    }
  }

  function closeOtherTabs(keepPath: string): void {
    const scope = layoutStore.reviewScope
    openTabsByScope.value[scope] = [keepPath]
    selectedFile.value = keepPath
    selectedFileByScope.value[scope] = keepPath
    void loadDiff(keepPath, scope === 'staged')
  }

  function closeAllTabs(): void {
    const scope = layoutStore.reviewScope
    openTabsByScope.value[scope] = []
    selectedFile.value = null
    selectedFileByScope.value[scope] = null
    diffOriginal.value = ''
    diffModified.value = ''
  }

  function selectFile(path: string): void {
    const prev = selectedFile.value
    if (prev && prev !== path && layoutStore.reviewScope === 'unstaged') {
      flushPendingSave(prev)
    }
    selectedFile.value = path
    selectedFileByScope.value[layoutStore.reviewScope] = path
  }

  function updateDiffModified(content: string): void {
    diffModified.value = content
    const file = selectedFile.value
    if (!file) return

    const key = diffCacheKey('unstaged', file)
    const cached = diffCache.get(key)
    if (cached) {
      diffCache.set(key, { ...cached, modified: content })
    } else {
      diffCache.set(key, { original: diffOriginal.value, modified: content })
    }
  }

  async function persistUnstagedFileContent(file: string, content: string): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return

    const fullPath = joinRepoPath(cwd, file)
    await window.agentAPI.file.write(fullPath, content, [cwd])
    await loadChangedFiles('unstaged', { reloadCurrentDiff: false })
  }

  function flushPendingSave(file: string): void {
    const timer = pendingSaveTimers.get(file)
    if (timer) clearTimeout(timer)
    pendingSaveTimers.delete(file)

    const content =
      pendingSaveContent.get(file) ?? diffCache.get(diffCacheKey('unstaged', file))?.modified
    pendingSaveContent.delete(file)

    if (content !== undefined) {
      void persistUnstagedFileContent(file, content)
    }
  }

  function scheduleUnstagedSave(file: string, content: string): void {
    pendingSaveContent.set(file, content)
    const existing = pendingSaveTimers.get(file)
    if (existing) clearTimeout(existing)

    pendingSaveTimers.set(
      file,
      setTimeout(() => {
        pendingSaveTimers.delete(file)
        pendingSaveContent.delete(file)
        void persistUnstagedFileContent(file, content)
      }, 400)
    )
  }

  function onDiffModifiedEdit(content: string): void {
    if (layoutStore.reviewScope !== 'unstaged') return
    updateDiffModified(content)
    const file = selectedFile.value
    if (file) scheduleUnstagedSave(file, content)
  }

  async function stageFiles(paths: string[]): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || paths.length === 0) return
    clearOperationError()
    try {
      await window.agentAPI.git.stage(cwd, paths)
      invalidateDiffCache(paths)
      await refreshStatus()
      await refreshAllScopes()
    } catch (err) {
      setOperationError(err, '暂存失败')
    }
  }

  async function unstageFiles(paths: string[]): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || paths.length === 0) return
    clearOperationError()
    try {
      await window.agentAPI.git.unstage(cwd, paths)
      invalidateDiffCache(paths)
      await refreshStatus()
      await refreshAllScopes()
    } catch (err) {
      setOperationError(err, '取消暂存失败')
    }
  }

  async function discardFiles(paths: string[]): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || paths.length === 0) return
    clearOperationError()
    try {
      await window.agentAPI.git.discard(cwd, paths)
      invalidateDiffCache(paths)
      await refreshStatus()
      await refreshAllScopes()
    } catch (err) {
      setOperationError(err, '放弃更改失败')
    }
  }

  async function commit(): Promise<boolean> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return false
    clearOperationError()
    try {
      await window.agentAPI.git.commit(cwd, commitMessage.value)
      commitMessage.value = ''
      invalidateDiffCache()
      await refreshStatus()
      await refreshAllScopes()
      return true
    } catch (err) {
      setOperationError(err, '提交失败')
      return false
    }
  }

  async function push(): Promise<boolean> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return false
    clearOperationError()
    try {
      await window.agentAPI.git.push(cwd)
      await refreshStatus()
      return true
    } catch (err) {
      setOperationError(err, '推送失败')
      return false
    }
  }

  async function pollRefresh(): Promise<void> {
    await refreshStatus({ silent: true })
    if (!layoutStore.showExtensionPanel) return

    const tab = layoutStore.activeExtensionTab
    if (tab === 'review') {
      await loadChangedFiles(layoutStore.reviewScope, {
        reloadCurrentDiff: true,
        silent: true
      })
      return
    }

    if (tab === 'files') {
      const { useFileExplorerStore } = await import('./fileExplorer.store')
      await useFileExplorerStore().refreshExpandedDirs()
    }
  }

  function startPolling(): void {
    stopPolling()
    void pollRefresh()
    pollTimer = setInterval(() => void pollRefresh(), 5000)
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  watch(
    () => panelContext.effectivePanelCwd,
    () => {
      resetScopeCaches()
      void refreshStatus().then(async () => {
        if (!panelContext.effectivePanelCwd) return
        await loadAllChangedFiles()
        await loadDiffForSelection()
      })
    }
  )

  watch(
    () => [layoutStore.showExtensionPanel, layoutStore.activeExtensionTab] as const,
    ([visible, tab]) => {
      if (!visible || !pollTimer) return
      if (tab === 'review' || tab === 'files') void pollRefresh()
    }
  )

  function getScopeSummary(scope: GitDiffScope): {
    additions: number
    deletions: number
    fileCount: number
  } {
    const files = changedFilesByScope.value[scope]
    return {
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      fileCount: files.length
    }
  }

  return {
    status,
    changedFiles,
    loading,
    selectedFile,
    diffOriginal,
    diffModified,
    diffLoading,
    diffRefreshing,
    diffError,
    commitMessage,
    operationError,
    operationErrorLog,
    filesLoadingByScope,
    scopeLoaded,
    isFilesLoading,
    applyScope,
    refreshStatus,
    loadChangedFiles,
    loadAllChangedFiles,
    loadDiff,
    loadDiffForSelection,
    changedFilesByScope,
    getScopeSummary,
    getChangeTypeForPath,
    changeTypeByPath,
    openTabsByScope,
    getOpenTabs,
    openFileTab,
    closeFileTab,
    closeOtherTabs,
    closeAllTabs,
    selectFile,
    onDiffModifiedEdit,
    stageFiles,
    unstageFiles,
    discardFiles,
    commit,
    push,
    startPolling,
    stopPolling
  }
})
