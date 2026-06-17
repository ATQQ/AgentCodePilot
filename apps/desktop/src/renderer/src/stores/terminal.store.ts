import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TerminalInfo } from '@renderer/types'
import { useWorkspaceStore } from './workspace.store'
import { useChatStore } from './chat.store'

export interface TerminalTab {
  id: string
  title: string
  panes: string[]
}

interface TerminalPaneMeta {
  terminalId: string
  cwd: string
}

interface PersistedTerminalLayout {
  tabs: Array<{ id: string; title: string; panes: TerminalPaneMeta[] }>
  activeTabId: string
}

export interface TerminalScope {
  scopeKey: string | null
  defaultCwd: string | null
  isMultiFolderWorkspace: boolean
  workspaceFolders: string[]
}

const LAYOUT_STORAGE_KEY = 'terminal-layout'

function loadLayout(scopeKey: string): PersistedTerminalLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, PersistedTerminalLayout>
    return all[scopeKey] ?? null
  } catch {
    return null
  }
}

function saveLayout(
  scopeKey: string,
  tabs: TerminalTab[],
  activeTabId: string,
  meta: Record<string, TerminalInfo>
): void {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    const all: Record<string, PersistedTerminalLayout> = raw ? JSON.parse(raw) : {}
    all[scopeKey] = {
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        panes: tab.panes.map((terminalId) => ({
          terminalId,
          cwd: meta[terminalId]?.cwd ?? ''
        }))
      })),
      activeTabId
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

function newTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export const useTerminalStore = defineStore('terminal', () => {
  const terminalTabsByScope = ref<Record<string, TerminalTab[]>>({})
  const activeTabIdByScope = ref<Record<string, string>>({})
  const terminalMetaByScope = ref<Record<string, Record<string, TerminalInfo>>>({})
  const initializingScopes = ref<Set<string>>(new Set())
  const splitPaneWidth = ref(0.5)
  const ensureInflight = new Map<string, Promise<void>>()
  let listenersBound = false

  const workspaceStore = useWorkspaceStore()
  const chatStore = useChatStore()

  function resolveScope(): TerminalScope {
    const conv = chatStore.activeConversation
    if (conv?.projectId) {
      const project = workspaceStore.projects.find((p) => p.id === conv.projectId)
      const ws = workspaceStore.workspaces.find((w) => w.id === conv.projectId)
      if (project) {
        return {
          scopeKey: `shared:${conv.projectId}`,
          defaultCwd: project.path,
          isMultiFolderWorkspace: false,
          workspaceFolders: []
        }
      }
      if (ws) {
        return {
          scopeKey: `shared:${conv.projectId}`,
          defaultCwd: ws.folders[0] ?? null,
          isMultiFolderWorkspace: ws.folders.length > 1,
          workspaceFolders: ws.folders
        }
      }
      return {
        scopeKey: `shared:${conv.projectId}`,
        defaultCwd: conv.cwd ?? workspaceStore.currentCwd ?? null,
        isMultiFolderWorkspace: false,
        workspaceFolders: []
      }
    }
    if (conv) {
      return {
        scopeKey: `conv:${conv.id}`,
        defaultCwd: conv.cwd,
        isMultiFolderWorkspace: false,
        workspaceFolders: []
      }
    }
    if (workspaceStore.selectedProjectId && workspaceStore.currentCwd) {
      const ws = workspaceStore.currentWorkspace
      return {
        scopeKey: `shared:${workspaceStore.selectedProjectId}`,
        defaultCwd: workspaceStore.currentCwd,
        isMultiFolderWorkspace: (ws?.folders.length ?? 0) > 1,
        workspaceFolders: ws?.folders ?? []
      }
    }
    return { scopeKey: null, defaultCwd: null, isMultiFolderWorkspace: false, workspaceFolders: [] }
  }

  const currentScope = computed(() => resolveScope())

  const currentTabs = computed(() => {
    const key = currentScope.value.scopeKey
    if (!key) return []
    return terminalTabsByScope.value[key] ?? []
  })

  const activeTab = computed(() => {
    const key = currentScope.value.scopeKey
    if (!key) return null
    const tabs = terminalTabsByScope.value[key] ?? []
    const activeId = activeTabIdByScope.value[key]
    return tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null
  })

  const isInitializing = computed(() => {
    const key = currentScope.value.scopeKey
    return key ? initializingScopes.value.has(key) : false
  })

  const terminalMeta = computed(() => {
    const key = currentScope.value.scopeKey
    if (!key) return {}
    return terminalMetaByScope.value[key] ?? {}
  })

  function bindListeners(): void {
    if (listenersBound) return
    listenersBound = true
    window.agentAPI.terminal.onData(() => {
      /* handled in TerminalView */
    })
    window.agentAPI.terminal.onExit(({ terminalId }) => {
      for (const [scopeKey, meta] of Object.entries(terminalMetaByScope.value)) {
        if (!meta[terminalId]) continue
        delete meta[terminalId]
        const tabs = terminalTabsByScope.value[scopeKey] ?? []
        const nextTabs: TerminalTab[] = []
        for (const tab of tabs) {
          const panes = tab.panes.filter((id) => id !== terminalId)
          if (panes.length > 0) {
            nextTabs.push({ ...tab, panes })
          }
        }
        terminalTabsByScope.value[scopeKey] = nextTabs
        const activeId = activeTabIdByScope.value[scopeKey]
        if (!nextTabs.find((t) => t.id === activeId)) {
          activeTabIdByScope.value[scopeKey] = nextTabs[0]?.id ?? ''
        }
        persistScope(scopeKey)
      }
    })
  }

  function persistScope(scopeKey: string): void {
    const tabs = terminalTabsByScope.value[scopeKey] ?? []
    const activeId = activeTabIdByScope.value[scopeKey] ?? ''
    const meta = terminalMetaByScope.value[scopeKey] ?? {}
    saveLayout(scopeKey, tabs, activeId, meta)
  }

  function setScopeState(
    scopeKey: string,
    tabs: TerminalTab[],
    activeTabId: string,
    meta: Record<string, TerminalInfo>
  ): void {
    terminalTabsByScope.value[scopeKey] = tabs
    activeTabIdByScope.value[scopeKey] = activeTabId
    terminalMetaByScope.value[scopeKey] = meta
    persistScope(scopeKey)
  }

  async function spawnTerminal(scopeKey: string, cwd: string): Promise<TerminalInfo> {
    bindListeners()
    const created = await window.agentAPI.terminal.create(scopeKey, cwd)
    const meta = { ...(terminalMetaByScope.value[scopeKey] ?? {}) }
    meta[created.id] = created
    terminalMetaByScope.value[scopeKey] = meta
    return created
  }

  async function restoreFromLayout(scopeKey: string, defaultCwd: string): Promise<void> {
    const layout = loadLayout(scopeKey)
    if (!layout || layout.tabs.length === 0) {
      const created = await spawnTerminal(scopeKey, defaultCwd)
      const tab: TerminalTab = { id: newTabId(), title: created.title, panes: [created.id] }
      setScopeState(scopeKey, [tab], tab.id, { [created.id]: created })
      return
    }

    const meta: Record<string, TerminalInfo> = {}
    const tabs: TerminalTab[] = []
    for (const savedTab of layout.tabs) {
      const paneIds: string[] = []
      for (const pane of savedTab.panes) {
        const cwd = pane.cwd || defaultCwd
        const created = await spawnTerminal(scopeKey, cwd)
        paneIds.push(created.id)
        meta[created.id] = created
      }
      if (paneIds.length > 0) {
        tabs.push({ id: savedTab.id, title: savedTab.title, panes: paneIds })
      }
    }

    if (tabs.length === 0) {
      const created = await spawnTerminal(scopeKey, defaultCwd)
      const tab: TerminalTab = { id: newTabId(), title: created.title, panes: [created.id] }
      setScopeState(scopeKey, [tab], tab.id, { [created.id]: created })
      return
    }

    const activeId = tabs.find((t) => t.id === layout.activeTabId)?.id ?? tabs[0].id
    setScopeState(scopeKey, tabs, activeId, meta)
  }

  async function syncFromRemote(scopeKey: string, remote: TerminalInfo[]): Promise<void> {
    const meta: Record<string, TerminalInfo> = {}
    for (const t of remote) {
      meta[t.id] = t
    }

    const existingTabs = terminalTabsByScope.value[scopeKey]
    if (existingTabs && existingTabs.length > 0) {
      const validIds = new Set(remote.map((t) => t.id))
      const tabs = existingTabs
        .map((tab) => ({ ...tab, panes: tab.panes.filter((id) => validIds.has(id)) }))
        .filter((tab) => tab.panes.length > 0)
      if (tabs.length > 0) {
        const activeId = activeTabIdByScope.value[scopeKey]
        setScopeState(
          scopeKey,
          tabs,
          tabs.find((t) => t.id === activeId)?.id ?? tabs[0].id,
          meta
        )
        return
      }
    }

    const layout = loadLayout(scopeKey)
    if (layout) {
      const tabs: TerminalTab[] = []
      const remoteByCwd = [...remote]
      for (const savedTab of layout.tabs) {
        const paneIds: string[] = []
        for (const pane of savedTab.panes) {
          const match =
            remote.find((t) => t.id === pane.terminalId) ??
            remoteByCwd.find((t) => t.cwd === pane.cwd)
          if (match) {
            paneIds.push(match.id)
            const idx = remoteByCwd.indexOf(match)
            if (idx >= 0) remoteByCwd.splice(idx, 1)
          }
        }
        if (paneIds.length > 0) {
          tabs.push({ id: savedTab.id, title: savedTab.title, panes: paneIds })
        }
      }
      for (const leftover of remoteByCwd) {
        tabs.push({ id: newTabId(), title: leftover.title, panes: [leftover.id] })
      }
      if (tabs.length > 0) {
        const activeId = tabs.find((t) => t.id === layout.activeTabId)?.id ?? tabs[0].id
        setScopeState(scopeKey, tabs, activeId, meta)
        return
      }
    }

    const tabs: TerminalTab[] = remote.map((t) => ({
      id: newTabId(),
      title: t.title,
      panes: [t.id]
    }))
    setScopeState(scopeKey, tabs, tabs[0]?.id ?? '', meta)
  }

  async function doEnsureTerminals(scopeKey: string, defaultCwd: string): Promise<void> {
    const existing = terminalTabsByScope.value[scopeKey]
    if (existing && existing.length > 0) return

    initializingScopes.value = new Set([...initializingScopes.value, scopeKey])
    try {
      const remote = await window.agentAPI.terminal.list(scopeKey)
      if (terminalTabsByScope.value[scopeKey]?.length) return

      if (remote.length === 0) {
        await restoreFromLayout(scopeKey, defaultCwd)
      } else {
        await syncFromRemote(scopeKey, remote)
      }
    } finally {
      const next = new Set(initializingScopes.value)
      next.delete(scopeKey)
      initializingScopes.value = next
    }
  }

  async function ensureTerminals(): Promise<void> {
    const { scopeKey, defaultCwd } = resolveScope()
    if (!scopeKey || !defaultCwd) return

    bindListeners()

    if (terminalTabsByScope.value[scopeKey]?.length) return

    const inflight = ensureInflight.get(scopeKey)
    if (inflight) {
      await inflight
      return
    }

    const promise = doEnsureTerminals(scopeKey, defaultCwd)
    ensureInflight.set(scopeKey, promise)
    try {
      await promise
    } finally {
      if (ensureInflight.get(scopeKey) === promise) {
        ensureInflight.delete(scopeKey)
      }
    }
  }

  async function createTerminal(cwd?: string): Promise<void> {
    const { scopeKey, defaultCwd } = resolveScope()
    if (!scopeKey || !defaultCwd) return

    const targetCwd = cwd ?? defaultCwd
    const created = await spawnTerminal(scopeKey, targetCwd)
    const tabs = [...(terminalTabsByScope.value[scopeKey] ?? [])]
    const tab: TerminalTab = { id: newTabId(), title: created.title, panes: [created.id] }
    tabs.push(tab)
    const meta = { ...(terminalMetaByScope.value[scopeKey] ?? {}), [created.id]: created }
    setScopeState(scopeKey, tabs, tab.id, meta)
  }

  async function splitActiveTab(): Promise<void> {
    const { scopeKey } = resolveScope()
    if (!scopeKey) return
    const tab = activeTab.value
    if (!tab || tab.panes.length >= 2) return

    const meta = terminalMetaByScope.value[scopeKey] ?? {}
    const cwd = meta[tab.panes[0]]?.cwd ?? resolveScope().defaultCwd
    if (!cwd) return

    const created = await spawnTerminal(scopeKey, cwd)
    const tabs = (terminalTabsByScope.value[scopeKey] ?? []).map((t) =>
      t.id === tab.id ? { ...t, panes: [...t.panes, created.id] } : t
    )
    const nextMeta = { ...meta, [created.id]: created }
    setScopeState(scopeKey, tabs, tab.id, nextMeta)
  }

  async function closeTab(tabId: string): Promise<void> {
    const { scopeKey } = resolveScope()
    if (!scopeKey) return
    const tabs = terminalTabsByScope.value[scopeKey] ?? []
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    for (const terminalId of tab.panes) {
      await window.agentAPI.terminal.kill(terminalId)
      delete terminalMetaByScope.value[scopeKey]?.[terminalId]
    }

    const nextTabs = tabs.filter((t) => t.id !== tabId)
    const activeId = activeTabIdByScope.value[scopeKey]
    const nextActive = activeId === tabId ? (nextTabs[0]?.id ?? '') : activeId
    setScopeState(scopeKey, nextTabs, nextActive, terminalMetaByScope.value[scopeKey] ?? {})
  }

  async function closePane(terminalId: string): Promise<void> {
    const { scopeKey } = resolveScope()
    if (!scopeKey) return
    await window.agentAPI.terminal.kill(terminalId)
    delete terminalMetaByScope.value[scopeKey]?.[terminalId]

    const tabs = (terminalTabsByScope.value[scopeKey] ?? [])
      .map((tab) => {
        if (!tab.panes.includes(terminalId)) return tab
        const panes = tab.panes.filter((id) => id !== terminalId)
        return panes.length > 0 ? { ...tab, panes } : null
      })
      .filter((t): t is TerminalTab => t !== null)

    const activeId = activeTabIdByScope.value[scopeKey]
    const nextActive = tabs.find((t) => t.id === activeId) ? activeId : (tabs[0]?.id ?? '')
    setScopeState(scopeKey, tabs, nextActive, terminalMetaByScope.value[scopeKey] ?? {})
  }

  function setActiveTab(tabId: string): void {
    const { scopeKey } = resolveScope()
    if (!scopeKey) return
    activeTabIdByScope.value[scopeKey] = tabId
    persistScope(scopeKey)
  }

  function needsFolderPicker(): boolean {
    const scope = resolveScope()
    return scope.isMultiFolderWorkspace && scope.workspaceFolders.length > 1
  }

  return {
    currentScope,
    currentTabs,
    activeTab,
    terminalMeta,
    isInitializing,
    splitPaneWidth,
    terminalTabsByScope,
    activeTabIdByScope,
    ensureTerminals,
    createTerminal,
    splitActiveTab,
    closeTab,
    closePane,
    setActiveTab,
    needsFolderPicker,
    resolveScope
  }
})
