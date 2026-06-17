import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TerminalInfo } from '@renderer/types'
import { useWorkspaceStore } from './workspace.store'

export const useTerminalStore = defineStore('terminal', () => {
  const terminalsByProject = ref<Record<string, TerminalInfo[]>>({})
  const activeTerminalId = ref<Record<string, string>>({})
  let listenersBound = false

  const workspaceStore = useWorkspaceStore()

  const currentProjectId = computed(() => workspaceStore.selectedProjectId)

  const currentTerminals = computed(() => {
    const pid = currentProjectId.value
    if (!pid) return []
    return terminalsByProject.value[pid] ?? []
  })

  const activeTerminal = computed(() => {
    const pid = currentProjectId.value
    if (!pid) return null
    const list = terminalsByProject.value[pid] ?? []
    const activeId = activeTerminalId.value[pid]
    return list.find((t) => t.id === activeId) ?? list[0] ?? null
  })

  function bindListeners(): void {
    if (listenersBound) return
    listenersBound = true
    window.agentAPI.terminal.onData(() => {
      /* handled in TerminalView */
    })
    window.agentAPI.terminal.onExit(({ terminalId }) => {
      for (const [projectId, list] of Object.entries(terminalsByProject.value)) {
        const next = list.filter((t) => t.id !== terminalId)
        if (next.length !== list.length) {
          terminalsByProject.value[projectId] = next
          if (activeTerminalId.value[projectId] === terminalId) {
            activeTerminalId.value[projectId] = next[0]?.id ?? ''
          }
        }
      }
    })
  }

  async function ensureTerminals(projectId: string, cwd: string): Promise<TerminalInfo[]> {
    bindListeners()
    let list = terminalsByProject.value[projectId]
    if (!list || list.length === 0) {
      const remote = await window.agentAPI.terminal.list(projectId)
      if (remote.length > 0) {
        list = remote
      } else {
        const created = await window.agentAPI.terminal.create(projectId, cwd)
        list = [created]
      }
      terminalsByProject.value[projectId] = list
      activeTerminalId.value[projectId] = list[0].id
    }
    return list
  }

  async function createTerminal(): Promise<void> {
    const pid = currentProjectId.value
    const cwd = workspaceStore.currentCwd
    if (!pid || !cwd) return

    bindListeners()
    const created = await window.agentAPI.terminal.create(pid, cwd)
    const list = terminalsByProject.value[pid] ?? []
    terminalsByProject.value[pid] = [...list, created]
    activeTerminalId.value[pid] = created.id
  }

  async function killTerminal(terminalId: string): Promise<void> {
    const pid = currentProjectId.value
    if (!pid) return

    await window.agentAPI.terminal.kill(terminalId)
    const list = (terminalsByProject.value[pid] ?? []).filter((t) => t.id !== terminalId)
    terminalsByProject.value[pid] = list
    if (activeTerminalId.value[pid] === terminalId) {
      activeTerminalId.value[pid] = list[0]?.id ?? ''
    }
  }

  function setActive(terminalId: string): void {
    const pid = currentProjectId.value
    if (!pid) return
    activeTerminalId.value[pid] = terminalId
  }

  return {
    currentTerminals,
    activeTerminal,
    currentProjectId,
    ensureTerminals,
    createTerminal,
    killTerminal,
    setActive
  }
})
