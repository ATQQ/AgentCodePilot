import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { GitStatusResult, GitChangedFile, GitDiffScope } from '@renderer/types'
import { usePanelContextStore } from './panelContext.store'
import { useLayoutStore } from './layout.store'

type DiffContent = { original: string; modified: string }

function emptyScopeRecord<T>(value: T): Record<GitDiffScope, T> {
  return { unstaged: value, staged: value }
}

function diffCacheKey(scope: GitDiffScope, file: string): string {
  return `${scope}:${file}`
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
  const commitMessage = ref('')
  const operationError = ref<string | null>(null)

  const changedFilesByScope = ref(emptyScopeRecord<GitChangedFile[]>([]))
  const selectedFileByScope = ref(emptyScopeRecord<string | null>(null))
  const openTabsByScope = ref(emptyScopeRecord<string[]>([]))
  const filesLoadingByScope = ref(emptyScopeRecord(false))
  const scopeLoaded = ref(emptyScopeRecord(false))

  const diffCache = new Map<string, DiffContent>()
  const loadFilesRequestId = emptyScopeRecord(0)
  let loadDiffRequestId = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const panelContext = usePanelContextStore()
  const layoutStore = useLayoutStore()

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
    commitMessage.value = ''
    operationError.value = null
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

  async function refreshStatus(): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) {
      status.value = null
      return
    }

    loading.value = true
    try {
      status.value = await window.agentAPI.git.status(cwd)
    } finally {
      loading.value = false
    }
  }

  async function loadChangedFiles(scope: GitDiffScope): Promise<void> {
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
    filesLoadingByScope.value[scope] = true

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
    } finally {
      if (requestId === loadFilesRequestId[scope]) {
        filesLoadingByScope.value[scope] = false
      }
    }
  }

  async function refreshAllScopes(): Promise<void> {
    markScopesStale()
    await Promise.all([
      loadChangedFiles('unstaged'),
      loadChangedFiles('staged')
    ])
    applyScope(layoutStore.reviewScope)
  }

  async function loadDiff(file: string, staged: boolean): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || !status.value?.isRepo) return

    const scope: GitDiffScope = staged ? 'staged' : 'unstaged'
    const key = diffCacheKey(scope, file)
    const cached = diffCache.get(key)
    const requestId = ++loadDiffRequestId

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
    const tabs = openTabsByScope.value[scope].filter((p) => p !== path)
    openTabsByScope.value[scope] = tabs
    if (selectedFile.value === path) {
      const next = tabs[tabs.length - 1] ?? null
      selectedFile.value = next
      selectedFileByScope.value[scope] = next
    }
  }

  function selectFile(path: string): void {
    selectedFile.value = path
    selectedFileByScope.value[layoutStore.reviewScope] = path
  }

  async function stageFiles(paths: string[]): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || paths.length === 0) return
    operationError.value = null
    try {
      await window.agentAPI.git.stage(cwd, paths)
      invalidateDiffCache(paths)
      await refreshStatus()
      await refreshAllScopes()
    } catch (err) {
      operationError.value = err instanceof Error ? err.message : '暂存失败'
    }
  }

  async function unstageFiles(paths: string[]): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || paths.length === 0) return
    operationError.value = null
    try {
      await window.agentAPI.git.unstage(cwd, paths)
      invalidateDiffCache(paths)
      await refreshStatus()
      await refreshAllScopes()
    } catch (err) {
      operationError.value = err instanceof Error ? err.message : '取消暂存失败'
    }
  }

  async function commit(): Promise<boolean> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return false
    operationError.value = null
    try {
      await window.agentAPI.git.commit(cwd, commitMessage.value)
      commitMessage.value = ''
      invalidateDiffCache()
      await refreshStatus()
      await refreshAllScopes()
      return true
    } catch (err) {
      operationError.value = err instanceof Error ? err.message : '提交失败'
      return false
    }
  }

  async function push(): Promise<boolean> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) return false
    operationError.value = null
    try {
      await window.agentAPI.git.push(cwd)
      await refreshStatus()
      return true
    } catch (err) {
      operationError.value = err instanceof Error ? err.message : '推送失败'
      return false
    }
  }

  function startPolling(): void {
    stopPolling()
    void refreshStatus()
    pollTimer = setInterval(() => void refreshStatus(), 5000)
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
      void refreshStatus().then(() => {
        if (!panelContext.effectivePanelCwd) return
        applyScope(layoutStore.reviewScope)
        void loadChangedFiles(layoutStore.reviewScope)
      })
    }
  )

  return {
    status,
    changedFiles,
    loading,
    selectedFile,
    diffOriginal,
    diffModified,
    diffLoading,
    diffRefreshing,
    commitMessage,
    operationError,
    filesLoadingByScope,
    scopeLoaded,
    isFilesLoading,
    applyScope,
    refreshStatus,
    loadChangedFiles,
    loadDiff,
    changedFilesByScope,
    openTabsByScope,
    getOpenTabs,
    openFileTab,
    closeFileTab,
    selectFile,
    stageFiles,
    unstageFiles,
    commit,
    push,
    startPolling,
    stopPolling
  }
})
