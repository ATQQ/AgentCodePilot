import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { GitStatusResult, GitChangedFile, GitDiffScope } from '@renderer/types'
import { usePanelContextStore } from './panelContext.store'
import { useLayoutStore } from './layout.store'

export const useGitStore = defineStore('git', () => {
  const status = ref<GitStatusResult | null>(null)
  const changedFiles = ref<GitChangedFile[]>([])
  const loading = ref(false)
  const selectedFile = ref<string | null>(null)
  const diffOriginal = ref('')
  const diffModified = ref('')
  const diffLoading = ref(false)
  const commitMessage = ref('')
  const operationError = ref<string | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const panelContext = usePanelContextStore()
  const layoutStore = useLayoutStore()

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
      changedFiles.value = []
      return
    }

    if (!status.value?.isRepo) {
      await refreshStatus()
    }
    if (!status.value?.isRepo) {
      changedFiles.value = []
      selectedFile.value = null
      return
    }

    changedFiles.value = await window.agentAPI.git.changedFiles(cwd, scope)
    const stillSelected = changedFiles.value.some((f) => f.path === selectedFile.value)
    if (!stillSelected) {
      selectedFile.value = changedFiles.value[0]?.path ?? null
    }
  }

  async function loadDiff(file: string, staged: boolean): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || !status.value?.isRepo) return

    diffLoading.value = true
    try {
      const result = await window.agentAPI.git.diff(cwd, file, staged)
      diffOriginal.value = result.original
      diffModified.value = result.modified
    } finally {
      diffLoading.value = false
    }
  }

  function selectFile(path: string): void {
    selectedFile.value = path
  }

  async function stageFiles(paths: string[]): Promise<void> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd || paths.length === 0) return
    operationError.value = null
    try {
      await window.agentAPI.git.stage(cwd, paths)
      await refreshStatus()
      await loadChangedFiles(layoutStore.reviewScope)
      if (layoutStore.reviewScope === 'unstaged' && paths.includes(selectedFile.value ?? '')) {
        selectedFile.value = changedFiles.value[0]?.path ?? null
      }
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
      await refreshStatus()
      await loadChangedFiles(layoutStore.reviewScope)
      if (layoutStore.reviewScope === 'staged' && paths.includes(selectedFile.value ?? '')) {
        selectedFile.value = changedFiles.value[0]?.path ?? null
      }
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
      await refreshStatus()
      await loadChangedFiles('staged')
      selectedFile.value = changedFiles.value[0]?.path ?? null
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
      selectedFile.value = null
      changedFiles.value = []
      diffOriginal.value = ''
      diffModified.value = ''
      commitMessage.value = ''
      operationError.value = null
      void refreshStatus()
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
    commitMessage,
    operationError,
    refreshStatus,
    loadChangedFiles,
    loadDiff,
    selectFile,
    stageFiles,
    unstageFiles,
    commit,
    push,
    startPolling,
    stopPolling
  }
})
