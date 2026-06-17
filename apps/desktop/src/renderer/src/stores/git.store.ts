import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { GitStatusResult, GitChangedFile, GitDiffScope } from '@renderer/types'
import { useWorkspaceStore } from './workspace.store'

export const useGitStore = defineStore('git', () => {
  const status = ref<GitStatusResult | null>(null)
  const changedFiles = ref<GitChangedFile[]>([])
  const loading = ref(false)
  const selectedFile = ref<string | null>(null)
  const diffOriginal = ref('')
  const diffModified = ref('')
  const diffLoading = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function refreshStatus(): Promise<void> {
    const workspace = useWorkspaceStore()
    const cwd = workspace.currentCwd
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
    const workspace = useWorkspaceStore()
    const cwd = workspace.currentCwd
    if (!cwd) {
      changedFiles.value = []
      return
    }

    changedFiles.value = await window.agentAPI.git.changedFiles(cwd, scope)
    if (changedFiles.value.length > 0 && !selectedFile.value) {
      selectedFile.value = changedFiles.value[0].path
    }
  }

  async function loadDiff(file: string, staged: boolean): Promise<void> {
    const workspace = useWorkspaceStore()
    const cwd = workspace.currentCwd
    if (!cwd) return

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

  const workspaceStore = useWorkspaceStore()
  watch(
    () => workspaceStore.currentCwd,
    () => {
      selectedFile.value = null
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
    refreshStatus,
    loadChangedFiles,
    loadDiff,
    selectFile,
    startPolling,
    stopPolling
  }
})
