import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ExtensionTab = 'review' | 'terminal' | 'browser' | 'files'
export type ReviewScope = 'unstaged' | 'staged'

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
    rightPanelWidth,
    bottomPanelHeight,
    envInfoVisible,
    toggleRightPanel,
    toggleBottomPanel,
    openExtensionTab,
    closeRightPanel,
    closeBottomPanel,
    toggleEnvInfo,
    openReviewFromChanges
  }
})
