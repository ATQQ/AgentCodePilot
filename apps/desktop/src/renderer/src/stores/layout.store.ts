import { defineStore } from 'pinia'
import { ref, watch, computed, type Ref, type ComputedRef, type WritableComputedRef } from 'vue'
import type { PlanOwnerType } from '../../../preload/types'
import { useChatStore } from './chat.store'
import { useSettingsStore } from './settings.store'
import { useUiStore } from './ui.store'
import { useWorkspaceStore } from './workspace.store'

export type ExtensionTab = 'review' | 'terminal' | 'browser' | 'files' | 'plans'
export type ReviewScope = 'unstaged' | 'staged'
export type PlansScope = 'conversation' | 'owner'
export type DiffViewMode = 'side-by-side' | 'inline'

const STORAGE_KEY = 'workbench-layout'

const CHAT_CONTENT_MAX_WIDTH = 820
const ENV_RAIL_WIDTH = 280
const CHAT_LAYOUT_GUTTER = 32

/**
 * 右侧面板宽度自适应
 *
 * 可用宽度 available = windowWidth - (侧边栏展开 ? SIDEBAR_WIDTH : 0)
 *
 * 展开时初始宽度：
 *   preferred = floor(available × RIGHT_PANEL_OPEN_RATIO)
 *   rightPanelWidth = clamp(preferred, RIGHT_PANEL_MIN_WIDTH, maxRight)
 *
 * 最大宽度 maxRight = clamp(
 *   min(floor(available × RIGHT_PANEL_MAX_RATIO), available - CHAT_MIN_WIDTH_WITH_PANEL - RESIZER_WIDTH),
 *   RIGHT_PANEL_MIN_WIDTH, +∞
 * )
 *
 * 窗口缩放 / 侧边栏切换时仅 clamp 当前宽度，不重新计算 preferred。
 */
const SIDEBAR_WIDTH = 220 // 左侧边栏占位，与 --sidebar-width 一致
const RIGHT_PANEL_MIN_WIDTH = 260 // 右侧面板最小宽度，与 AppShell ResizableSplit min-size 一致
const RIGHT_PANEL_MAX_RATIO = 0.75 // 右侧面板不超过可用宽度的 75%（拖拽上限）
const RIGHT_PANEL_OPEN_RATIO = 0.42 // 展开时右侧面板占可用宽度的比例
const CHAT_MIN_WIDTH_WITH_PANEL = 480 // 右侧面板打开时，中间聊天区至少保留的宽度
const RESIZER_WIDTH = 6 // 拖拽分隔条占位，与 ResizableSplit 一致

interface LayoutPersist {
  rightPanelWidth: number
  bottomPanelHeight: number
  sideTreeWidth?: number
  diffViewMode?: DiffViewMode
}

interface ConversationPanelState {
  rightPanelVisible: boolean
  bottomPanelVisible: boolean
  activeExtensionTab: ExtensionTab
  reviewScope: ReviewScope
}

function loadPersist(): LayoutPersist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as LayoutPersist
  } catch {
    /* ignore */
  }
  return {
    rightPanelWidth: 380,
    bottomPanelHeight: 260,
    sideTreeWidth: 220,
    diffViewMode: 'side-by-side'
  }
}

export interface LayoutStoreReturn {
  rightPanelVisible: Ref<boolean>
  bottomPanelVisible: Ref<boolean>
  showBottomTerminal: ComputedRef<boolean>
  showExtensionPanel: ComputedRef<boolean>
  showExtensionPanelControls: ComputedRef<boolean>
  showWorkbenchControls: ComputedRef<boolean>
  homeRouteActive: Ref<boolean>
  activeExtensionTab: Ref<ExtensionTab>
  reviewScope: Ref<ReviewScope>
  activePlanId: Ref<string | null>
  plansScope: Ref<PlansScope>
  plansOwnerType: Ref<PlanOwnerType | null>
  plansOwnerId: Ref<string | null>
  rightPanelWidth: Ref<number>
  bottomPanelHeight: Ref<number>
  sideTreeWidth: Ref<number>
  diffViewMode: Ref<DiffViewMode>
  envInfoVisible: Ref<boolean>
  envInfoPinned: ComputedRef<boolean>
  chatLayoutWidth: Ref<number>
  toggleRightPanel: () => void
  toggleBottomPanel: () => void
  openExtensionTab: (tab: ExtensionTab, options?: { reviewScope?: ReviewScope }) => void
  closeRightPanel: () => void
  closeBottomPanel: () => void
  toggleEnvInfo: () => void
  setChatLayoutWidth: (width: number) => void
  getMaxRightPanelWidth: () => number
  openReviewFromChanges: () => void
  openReviewForCommit: () => void
  openPlansPanel: (
    planId?: string,
    options?: {
      scope?: PlansScope
      ownerType?: PlanOwnerType
      ownerId?: string
    }
  ) => void
  setDiffViewMode: (mode: DiffViewMode) => void
  setHomeRouteActive: (active: boolean) => void
}

type UnwrapStoreRefs<T> = {
  [K in keyof T]: T[K] extends Ref<infer V>
    ? V
    : T[K] extends ComputedRef<infer V> | WritableComputedRef<infer V>
      ? V
      : T[K]
}

export type LayoutStore = UnwrapStoreRefs<LayoutStoreReturn>

export const useLayoutStore = defineStore('layout', (): LayoutStoreReturn => {
  const persisted = loadPersist()

  const rightPanelVisible = ref(false)
  const bottomPanelVisible = ref(false)
  const activeExtensionTab = ref<ExtensionTab>('review')
  const reviewScope = ref<ReviewScope>('unstaged')
  const activePlanId = ref<string | null>(null)
  const plansScope = ref<PlansScope>('conversation')
  const plansOwnerType = ref<PlanOwnerType | null>(null)
  const plansOwnerId = ref<string | null>(null)
  const rightPanelWidth = ref(persisted.rightPanelWidth)
  const bottomPanelHeight = ref(persisted.bottomPanelHeight)
  const sideTreeWidth = ref(persisted.sideTreeWidth ?? 220)
  const diffViewMode = ref<DiffViewMode>(persisted.diffViewMode ?? 'side-by-side')
  const envInfoVisible = ref(false)
  const chatLayoutWidth = ref(0)
  const homeRouteActive = ref(false)
  // 响应式窗口宽度，供右侧面板宽度计算在 resize 时更新
  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0)

  const showWorkbenchControls = computed(() => !homeRouteActive.value)

  function isHomePanelContextAvailable(): boolean {
    if (!homeRouteActive.value) return false
    const workspaceStore = useWorkspaceStore()
    const selectedId = workspaceStore.selectedProjectId
    if (!selectedId) return false
    return (
      workspaceStore.workspaces.some((w) => w.id === selectedId) ||
      workspaceStore.projects.some((p) => p.id === selectedId)
    )
  }

  const envInfoPinned = computed(() => {
    if (!showWorkbenchControls.value || rightPanelVisible.value) return false
    const minWidth = CHAT_CONTENT_MAX_WIDTH + ENV_RAIL_WIDTH + CHAT_LAYOUT_GUTTER
    return chatLayoutWidth.value >= minWidth
  })

  const panelStateByConversation = ref<Record<string, ConversationPanelState>>({})
  let lastConversationId: string | null = null

  function capturePanelState(): ConversationPanelState {
    return {
      rightPanelVisible: rightPanelVisible.value,
      bottomPanelVisible: bottomPanelVisible.value,
      activeExtensionTab: activeExtensionTab.value,
      reviewScope: reviewScope.value
    }
  }

  function applyPanelState(state: ConversationPanelState): void {
    rightPanelVisible.value = state.rightPanelVisible
    bottomPanelVisible.value = state.bottomPanelVisible
    activeExtensionTab.value = state.activeExtensionTab
    reviewScope.value = state.reviewScope
  }

  function handleConversationSwitch(nextId: string | null): void {
    const settingsStore = useSettingsStore()
    if (!settingsStore.rememberPanelStatePerConversation) {
      lastConversationId = nextId
      return
    }

    if (lastConversationId) {
      panelStateByConversation.value = {
        ...panelStateByConversation.value,
        [lastConversationId]: capturePanelState()
      }
    }

    if (nextId && panelStateByConversation.value[nextId]) {
      applyPanelState(panelStateByConversation.value[nextId])
    }

    lastConversationId = nextId
  }

  watch(
    () => useChatStore().activeConversationId,
    (nextId) => {
      handleConversationSwitch(nextId)
    },
    { flush: 'sync' }
  )

  const showBottomTerminal = computed(
    () =>
      bottomPanelVisible.value &&
      !homeRouteActive.value &&
      !(rightPanelVisible.value && activeExtensionTab.value === 'terminal')
  )

  const showExtensionPanel = computed(() => {
    if (!rightPanelVisible.value) return false
    if (!homeRouteActive.value) return true
    return isHomePanelContextAvailable()
  })

  const showExtensionPanelControls = computed(() => {
    if (!homeRouteActive.value) return true
    return isHomePanelContextAvailable()
  })

  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function persistLayout(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rightPanelWidth: rightPanelWidth.value,
        bottomPanelHeight: bottomPanelHeight.value,
        sideTreeWidth: sideTreeWidth.value,
        diffViewMode: diffViewMode.value
      })
    )
  }

  watch([rightPanelWidth, bottomPanelHeight, sideTreeWidth, diffViewMode], () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persistLayout, 300)
  })

  /** 工作台主内容区可用宽度（扣除左侧边栏） */
  function getWorkbenchAvailableWidth(): number {
    const sidebarWidth = useUiStore().sidebarCollapsed ? 0 : SIDEBAR_WIDTH
    return windowWidth.value - sidebarWidth
  }

  /** 当前窗口下右侧面板允许的最大宽度，保证中间聊天区 ≥ CHAT_MIN_WIDTH_WITH_PANEL */
  function getMaxRightPanelWidth(): number {
    const available = getWorkbenchAvailableWidth()
    const maxByRatio = Math.floor(available * RIGHT_PANEL_MAX_RATIO)
    const maxByChat = available - CHAT_MIN_WIDTH_WITH_PANEL - RESIZER_WIDTH
    return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(maxByRatio, maxByChat))
  }

  /** 展开右侧面板时，按 RIGHT_PANEL_OPEN_RATIO 计算初始宽度 */
  function adaptRightPanelWidthForOpen(): void {
    const available = getWorkbenchAvailableWidth()
    const maxRight = getMaxRightPanelWidth()
    const preferred = Math.floor(available * RIGHT_PANEL_OPEN_RATIO)
    rightPanelWidth.value = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(maxRight, preferred))
  }

  /** 窗口缩放或侧边栏切换后，将当前宽度限制在 [MIN, maxRight] 内 */
  function clampRightPanelWidth(): void {
    const maxRight = getMaxRightPanelWidth()
    if (rightPanelWidth.value > maxRight) {
      rightPanelWidth.value = maxRight
    } else if (rightPanelWidth.value < RIGHT_PANEL_MIN_WIDTH) {
      rightPanelWidth.value = RIGHT_PANEL_MIN_WIDTH
    }
  }

  watch(rightPanelVisible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
      adaptRightPanelWidthForOpen()
    }
  })

  watch(
    () => useUiStore().sidebarCollapsed,
    () => {
      if (rightPanelVisible.value) clampRightPanelWidth()
    }
  )

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      windowWidth.value = window.innerWidth
      if (rightPanelVisible.value) clampRightPanelWidth()
    })
  }

  function toggleRightPanel(): void {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  function toggleBottomPanel(): void {
    bottomPanelVisible.value = !bottomPanelVisible.value
  }

  function openExtensionTab(tab: ExtensionTab, options?: { reviewScope?: ReviewScope }): void {
    activeExtensionTab.value = tab
    rightPanelVisible.value = true
    if (options?.reviewScope) {
      reviewScope.value = options.reviewScope
    }
  }

  function openPlansPanel(
    planId?: string,
    options?: {
      scope?: PlansScope
      ownerType?: PlanOwnerType
      ownerId?: string
    }
  ): void {
    activeExtensionTab.value = 'plans'
    rightPanelVisible.value = true
    if (options?.scope) {
      plansScope.value = options.scope
    }
    if (options?.ownerType && options?.ownerId) {
      plansOwnerType.value = options.ownerType
      plansOwnerId.value = options.ownerId
    } else if (plansScope.value === 'conversation') {
      plansOwnerType.value = null
      plansOwnerId.value = null
    }
    activePlanId.value = planId ?? null
  }

  function closeRightPanel(): void {
    rightPanelVisible.value = false
  }

  function closeBottomPanel(): void {
    bottomPanelVisible.value = false
  }

  function toggleEnvInfo(): void {
    if (envInfoPinned.value) return
    envInfoVisible.value = !envInfoVisible.value
  }

  function setChatLayoutWidth(width: number): void {
    chatLayoutWidth.value = width
  }

  watch(envInfoPinned, (pinned) => {
    if (pinned) envInfoVisible.value = false
  })

  function openReviewFromChanges(): void {
    openExtensionTab('review', { reviewScope: 'unstaged' })
  }

  function openReviewForCommit(): void {
    openExtensionTab('review', { reviewScope: 'staged' })
  }

  function setHomeRouteActive(active: boolean): void {
    homeRouteActive.value = active
    if (active) {
      envInfoVisible.value = false
      closeRightPanel()
    }
  }

  function setDiffViewMode(mode: DiffViewMode): void {
    diffViewMode.value = mode
  }

  return {
    rightPanelVisible,
    bottomPanelVisible,
    showBottomTerminal,
    showExtensionPanel,
    showExtensionPanelControls,
    showWorkbenchControls,
    homeRouteActive,
    activeExtensionTab,
    reviewScope,
    activePlanId,
    plansScope,
    plansOwnerType,
    plansOwnerId,
    rightPanelWidth,
    bottomPanelHeight,
    sideTreeWidth,
    diffViewMode,
    envInfoVisible,
    envInfoPinned,
    chatLayoutWidth,
    toggleRightPanel,
    toggleBottomPanel,
    openExtensionTab,
    closeRightPanel,
    closeBottomPanel,
    toggleEnvInfo,
    setChatLayoutWidth,
    getMaxRightPanelWidth,
    openReviewFromChanges,
    openReviewForCommit,
    openPlansPanel,
    setDiffViewMode,
    setHomeRouteActive
  }
}) as unknown as () => LayoutStore
