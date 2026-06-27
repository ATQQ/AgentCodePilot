import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TerminalInfo } from '@renderer/types'
import { useWorkspaceStore } from './workspace.store'
import { useChatStore } from './chat.store'
import { useLayoutStore } from './layout.store'
import { usePanelContextStore } from './panelContext.store'
import { disposeTerminalSession } from '@renderer/utils/terminal-session-manager'

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

function reconcileTabs(
  tabs: TerminalTab[],
  validIds: Set<string>,
  activeTabId: string
): { tabs: TerminalTab[]; activeTabId: string } {
  const next = tabs
    .map((tab) => ({ ...tab, panes: tab.panes.filter((id) => validIds.has(id)) }))
    .filter((tab) => tab.panes.length > 0)
  const active = next.find((t) => t.id === activeTabId)?.id ?? next[0]?.id ?? ''
  return { tabs: next, activeTabId: active }
}

export const useTerminalStore = defineStore('terminal', () => {
  const terminalTabsByScope = ref<Record<string, TerminalTab[]>>({})
  const activeTabIdByScope = ref<Record<string, string>>({})
  const terminalMetaByScope = ref<Record<string, Record<string, TerminalInfo>>>({})
  const initializingScopes = ref<Set<string>>(new Set())
  const readyScopes = ref<Set<string>>(new Set())
  const splitPaneWidth = ref(0.5)
  const ensureInflight = new Map<string, Promise<void>>()
  let listenersBound = false

  const workspaceStore = useWorkspaceStore()
  const chatStore = useChatStore()
  const panelContext = usePanelContextStore()

  function syncPanelVisibilityAfterTerminalChange(scopeKey: string | null): void {
    if (!scopeKey || scopeKey !== currentScopeKey.value) return
    if (currentTabs.value.length > 0) return

    const layoutStore = useLayoutStore()
    if (layoutStore.bottomPanelVisible) {
      layoutStore.closeBottomPanel()
    }
    if (layoutStore.rightPanelVisible && layoutStore.activeExtensionTab === 'terminal') {
      layoutStore.closeRightPanel()
    }
  }

  function resolveScope(): TerminalScope {
    const conv = chatStore.activeConversation
    const panelCwd = panelContext.effectivePanelCwd
    if (conv?.projectId) {
      const project = workspaceStore.projects.find((p) => p.id === conv.projectId)
      const ws = workspaceStore.workspaces.find((w) => w.id === conv.projectId)
      if (project) {
        return {
          scopeKey: `shared:${conv.projectId}`,
          defaultCwd: conv.cwd ?? project.path,
          isMultiFolderWorkspace: false,
          workspaceFolders: []
        }
      }
      if (ws) {
        return {
          scopeKey: `shared:${conv.projectId}`,
          defaultCwd: panelCwd ?? ws.folders[0] ?? null,
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

  const currentScopeKey = computed(() => currentScope.value.scopeKey)

  const currentTabs = computed(() => {
    const key = currentScopeKey.value
    if (!key || !readyScopes.value.has(key)) return []
    return terminalTabsByScope.value[key] ?? []
  })

  const activeTab = computed(() => {
    const key = currentScopeKey.value
    if (!key || !readyScopes.value.has(key)) return null
    const tabs = terminalTabsByScope.value[key] ?? []
    const activeId = activeTabIdByScope.value[key]
    return tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null
  })

  const isInitializing = computed(() => {
    const key = currentScopeKey.value
    if (!key) return false
    return initializingScopes.value.has(key) || !readyScopes.value.has(key)
  })

  const terminalMeta = computed(() => {
    const key = currentScopeKey.value
    if (!key) return {}
    return terminalMetaByScope.value[key] ?? {}
  })

  function markScopeNotReady(scopeKey: string): void {
    const nextReady = new Set(readyScopes.value)
    nextReady.delete(scopeKey)
    readyScopes.value = nextReady
  }

  function bindListeners(): void {
    if (listenersBound) return
    listenersBound = true
    window.agentAPI.terminal.onData(() => {
      /* handled in TerminalView */
    })
    window.agentAPI.terminal.onExit(({ terminalId }) => {
      disposeTerminalSession(terminalId)
      for (const [scopeKey, meta] of Object.entries(terminalMetaByScope.value)) {
        if (!meta[terminalId]) continue
        delete meta[terminalId]
        const tabs = terminalTabsByScope.value[scopeKey] ?? []
        const activeId = activeTabIdByScope.value[scopeKey] ?? ''
        const validIds = new Set(Object.keys(meta))
        const { tabs: nextTabs, activeTabId: nextActive } = reconcileTabs(tabs, validIds, activeId)
        terminalTabsByScope.value[scopeKey] = nextTabs
        activeTabIdByScope.value[scopeKey] = nextActive
        if (nextTabs.length === 0) {
          markScopeNotReady(scopeKey)
          clearLayout(scopeKey)
        }
        persistScope(scopeKey)
        syncPanelVisibilityAfterTerminalChange(scopeKey)
      }
    })
  }

  function clearLayout(scopeKey: string): void {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (!raw) return
      const all = JSON.parse(raw) as Record<string, PersistedTerminalLayout>
      delete all[scopeKey]
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(all))
    } catch {
      /* ignore */
    }
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
    const validIds = new Set(Object.keys(meta))
    const { tabs: nextTabs, activeTabId: nextActive } = reconcileTabs(tabs, validIds, activeTabId)
    terminalTabsByScope.value[scopeKey] = nextTabs
    activeTabIdByScope.value[scopeKey] = nextActive
    terminalMetaByScope.value[scopeKey] = meta
    persistScope(scopeKey)
    readyScopes.value = new Set([...readyScopes.value, scopeKey])
    if (nextTabs.length === 0) {
      syncPanelVisibilityAfterTerminalChange(scopeKey)
    }
  }

  async function spawnTerminal(scopeKey: string, cwd: string): Promise<TerminalInfo> {
    bindListeners()
    const created = await window.agentAPI.terminal.create(scopeKey, cwd)
    const meta = { ...(terminalMetaByScope.value[scopeKey] ?? {}) }
    meta[created.id] = created
    terminalMetaByScope.value[scopeKey] = meta
    return created
  }

  function buildTabsFromLayout(
    layout: PersistedTerminalLayout,
    remote: TerminalInfo[],
    _defaultCwd: string
  ): { tabs: TerminalTab[]; meta: Record<string, TerminalInfo>; activeTabId: string } {
    const meta: Record<string, TerminalInfo> = {}
    for (const t of remote) meta[t.id] = t

    const unused = [...remote]
    const tabs: TerminalTab[] = []

    for (const savedTab of layout.tabs) {
      const paneIds: string[] = []
      for (const pane of savedTab.panes) {
        let matchIdx = unused.findIndex((t) => t.id === pane.terminalId)
        if (matchIdx < 0) matchIdx = unused.length > 0 ? 0 : -1
        if (matchIdx >= 0) {
          const [match] = unused.splice(matchIdx, 1)
          paneIds.push(match.id)
        }
      }
      if (paneIds.length > 0) {
        tabs.push({ id: savedTab.id, title: savedTab.title, panes: paneIds })
      }
    }

    for (const leftover of unused) {
      tabs.push({ id: newTabId(), title: leftover.title, panes: [leftover.id] })
    }

    if (tabs.length === 0) {
      return { tabs: [], meta, activeTabId: '' }
    }

    const activeTabId = tabs.find((t) => t.id === layout.activeTabId)?.id ?? tabs[0].id
    return { tabs, meta, activeTabId }
  }

  async function ensureTabPanes(tabId: string): Promise<void> {
    const { scopeKey, defaultCwd } = resolveScope()
    if (!scopeKey || !defaultCwd) return

    const tabs = terminalTabsByScope.value[scopeKey] ?? []
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab || tab.panes.length > 0) return

    const layout = loadLayout(scopeKey)
    const savedTab = layout?.tabs.find((t) => t.id === tabId)
    const savedPane = savedTab?.panes[0]
    const cwd = savedPane?.cwd || defaultCwd

    const created = await spawnTerminal(scopeKey, cwd)
    const nextTabs = tabs.map((t) => (t.id === tabId ? { ...t, panes: [created.id] } : t))
    const meta = { ...(terminalMetaByScope.value[scopeKey] ?? {}), [created.id]: created }
    setScopeState(scopeKey, nextTabs, tabId, meta)
  }

  async function restoreFromLayout(scopeKey: string, defaultCwd: string): Promise<void> {
    const layout = loadLayout(scopeKey)
    if (!layout || layout.tabs.length === 0) {
      const created = await spawnTerminal(scopeKey, defaultCwd)
      if (resolveScope().scopeKey !== scopeKey) return
      const tab: TerminalTab = { id: newTabId(), title: created.title, panes: [created.id] }
      setScopeState(scopeKey, [tab], tab.id, { [created.id]: created })
      return
    }

    const activeSaved = layout.tabs.find((t) => t.id === layout.activeTabId) ?? layout.tabs[0]
    const meta: Record<string, TerminalInfo> = {}
    const tabs: TerminalTab[] = []

    for (const savedTab of layout.tabs) {
      if (savedTab.id === activeSaved.id) {
        const paneIds: string[] = []
        for (const pane of savedTab.panes) {
          const cwd = pane.cwd || defaultCwd
          const created = await spawnTerminal(scopeKey, cwd)
          if (resolveScope().scopeKey !== scopeKey) return
          paneIds.push(created.id)
          meta[created.id] = created
        }
        if (paneIds.length > 0) {
          tabs.push({ id: savedTab.id, title: savedTab.title, panes: paneIds })
        }
      } else {
        tabs.push({ id: savedTab.id, title: savedTab.title, panes: [] })
      }
    }

    if (tabs.length === 0) {
      const created = await spawnTerminal(scopeKey, defaultCwd)
      if (resolveScope().scopeKey !== scopeKey) return
      const tab: TerminalTab = { id: newTabId(), title: created.title, panes: [created.id] }
      setScopeState(scopeKey, [tab], tab.id, { [created.id]: created })
      return
    }

    const activeId = tabs.find((t) => t.id === activeSaved.id)?.id ?? tabs[0].id
    setScopeState(scopeKey, tabs, activeId, meta)
  }

  async function syncFromRemote(scopeKey: string, remote: TerminalInfo[]): Promise<void> {
    const meta: Record<string, TerminalInfo> = {}
    for (const t of remote) meta[t.id] = t
    const validIds = new Set(remote.map((t) => t.id))

    const existingTabs = terminalTabsByScope.value[scopeKey]
    if (existingTabs && existingTabs.length > 0) {
      const activeId = activeTabIdByScope.value[scopeKey] ?? ''
      const { tabs, activeTabId } = reconcileTabs(existingTabs, validIds, activeId)
      if (tabs.length > 0) {
        setScopeState(scopeKey, tabs, activeTabId, meta)
        return
      }
    }

    const layout = loadLayout(scopeKey)
    if (layout) {
      const built = buildTabsFromLayout(layout, remote, resolveScope().defaultCwd ?? '')
      if (built.tabs.length > 0) {
        setScopeState(scopeKey, built.tabs, built.activeTabId, built.meta)
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
    const tabCount = terminalTabsByScope.value[scopeKey]?.length ?? 0
    const hasLivePanes = (terminalTabsByScope.value[scopeKey] ?? []).some((t) => t.panes.length > 0)
    if (readyScopes.value.has(scopeKey) && tabCount > 0 && hasLivePanes) {
      return
    }

    if (!hasLivePanes) {
      markScopeNotReady(scopeKey)
    }

    initializingScopes.value = new Set([...initializingScopes.value, scopeKey])
    try {
      const remote = await window.agentAPI.terminal.list(scopeKey)

      if (readyScopes.value.has(scopeKey) && tabCount > 0 && hasLivePanes) {
        return
      }

      if (remote.length === 0) {
        clearLayout(scopeKey)
        await restoreFromLayout(scopeKey, defaultCwd)
      } else {
        await syncFromRemote(scopeKey, remote)
      }

      if ((terminalTabsByScope.value[scopeKey]?.length ?? 0) === 0) {
        const created = await spawnTerminal(scopeKey, defaultCwd)
        if (resolveScope().scopeKey !== scopeKey) return
        const tab: TerminalTab = { id: newTabId(), title: created.title, panes: [created.id] }
        setScopeState(scopeKey, [tab], tab.id, { [created.id]: created })
      }
    } finally {
      const nextInit = new Set(initializingScopes.value)
      nextInit.delete(scopeKey)
      initializingScopes.value = nextInit

      const tabs = terminalTabsByScope.value[scopeKey] ?? []
      if (tabs.some((t) => t.panes.length > 0)) {
        readyScopes.value = new Set([...readyScopes.value, scopeKey])
      } else {
        markScopeNotReady(scopeKey)
      }
    }
  }

  async function ensureTerminals(): Promise<void> {
    const { scopeKey, defaultCwd } = resolveScope()
    if (!scopeKey || !defaultCwd) return

    bindListeners()

    if (readyScopes.value.has(scopeKey) && (terminalTabsByScope.value[scopeKey]?.length ?? 0) > 0) {
      const hasLivePanes = (terminalTabsByScope.value[scopeKey] ?? []).some(
        (t) => t.panes.length > 0
      )
      if (hasLivePanes) return
      markScopeNotReady(scopeKey)
    }

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
      disposeTerminalSession(terminalId)
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
    disposeTerminalSession(terminalId)
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

  async function setActiveTab(tabId: string): Promise<void> {
    const { scopeKey } = resolveScope()
    if (!scopeKey) return
    await ensureTabPanes(tabId)
    activeTabIdByScope.value[scopeKey] = tabId
    persistScope(scopeKey)
  }

  function needsFolderPicker(): boolean {
    const scope = resolveScope()
    return scope.isMultiFolderWorkspace && scope.workspaceFolders.length > 1
  }

  return {
    currentScope,
    currentScopeKey,
    currentTabs,
    activeTab,
    terminalMeta,
    isInitializing,
    splitPaneWidth,
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
