import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import type { PlanOwnerType } from '../../../preload/types'
import { useChatStore } from './chat.store'
import { useSettingsStore } from './settings.store'
import { usePanelContextStore } from './panelContext.store'

export type ExtensionTab = 'review' | 'terminal' | 'browser' | 'files' | 'plans'
export type ReviewScope = 'unstaged' | 'staged'
export type PlansScope = 'conversation' | 'owner'
export type DiffViewMode = 'side-by-side' | 'inline'

const STORAGE_KEY = 'workbench-layout'

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
  return { rightPanelWidth: 380, bottomPanelHeight: 260, sideTreeWidth: 220, diffViewMode: 'side-by-side' }
}

export const useLayoutStore = defineStore('layout', () => {
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
  const homeRouteActive = ref(false)

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
    return usePanelContextStore().isHomePanelContextAvailable
  })

  const showExtensionPanelControls = computed(() => {
    if (!homeRouteActive.value) return true
    return usePanelContextStore().isHomePanelContextAvailable
  })

  const showWorkbenchControls = computed(() => !homeRouteActive.value)

  watch([rightPanelWidth, bottomPanelHeight, sideTreeWidth, diffViewMode], () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rightPanelWidth: rightPanelWidth.value,
        bottomPanelHeight: bottomPanelHeight.value,
        sideTreeWidth: sideTreeWidth.value,
        diffViewMode: diffViewMode.value
      })
    )
  })

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
    envInfoVisible.value = !envInfoVisible.value
  }

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
    toggleRightPanel,
    toggleBottomPanel,
    openExtensionTab,
    closeRightPanel,
    closeBottomPanel,
    toggleEnvInfo,
    openReviewFromChanges,
    openReviewForCommit,
    openPlansPanel,
    setDiffViewMode,
    setHomeRouteActive
  }
})
