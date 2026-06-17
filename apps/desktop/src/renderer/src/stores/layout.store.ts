import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { PlanOwnerType } from '../../../preload/types'

export type ExtensionTab = 'review' | 'terminal' | 'browser' | 'files' | 'plans'
export type ReviewScope = 'unstaged' | 'staged'
export type PlansScope = 'conversation' | 'owner'

const STORAGE_KEY = 'workbench-layout'

interface LayoutPersist {
  rightPanelWidth: number
  bottomPanelHeight: number
}

function loadPersist(): LayoutPersist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as LayoutPersist
  } catch {
    /* ignore */
  }
  return { rightPanelWidth: 380, bottomPanelHeight: 260 }
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
  const envInfoVisible = ref(false)

  watch([rightPanelWidth, bottomPanelHeight], () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rightPanelWidth: rightPanelWidth.value,
        bottomPanelHeight: bottomPanelHeight.value
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
    if (tab === 'terminal') {
      bottomPanelVisible.value = true
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

  return {
    rightPanelVisible,
    bottomPanelVisible,
    activeExtensionTab,
    reviewScope,
    activePlanId,
    plansScope,
    plansOwnerType,
    plansOwnerId,
    rightPanelWidth,
    bottomPanelHeight,
    envInfoVisible,
    toggleRightPanel,
    toggleBottomPanel,
    openExtensionTab,
    closeRightPanel,
    closeBottomPanel,
    toggleEnvInfo,
    openReviewFromChanges,
    openPlansPanel
  }
})
