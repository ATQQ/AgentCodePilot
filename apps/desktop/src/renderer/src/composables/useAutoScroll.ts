import { ref, type Ref } from 'vue'

/** Align with MarkstreamVirtualTimeline unpin threshold (≤48px). */
const BOTTOM_THRESHOLD = 48

type AutoScrollContainerRef = Ref<HTMLElement | null> | (() => HTMLElement | null)

interface AutoScrollResult {
  onScroll: () => void
  /** Marks pinned; actual scroll must go through Markstream scrollToBottom. */
  forceScrollToBottom: () => void
  /** Clear pin so stick-to-bottom does not fight a mid-thread restore. */
  releasePin: () => void
  beginLayoutTransition: (ms?: number) => void
  isNearTop: (threshold?: number) => boolean
  scrollToTop: () => void
  isPinnedToBottom: Ref<boolean>
}

export function useAutoScroll(containerRef: AutoScrollContainerRef): AutoScrollResult {
  const isPinnedToBottom = ref(true)
  let suppressPinUpdatesUntil = 0

  function getContainer(): HTMLElement | null {
    return typeof containerRef === 'function' ? containerRef() : containerRef.value
  }

  function isNearBottom(): boolean {
    const el = getContainer()
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
  }

  function onScroll(): void {
    if (Date.now() < suppressPinUpdatesUntil) return
    isPinnedToBottom.value = isNearBottom()
  }

  /**
   * Keep pinned while layout/restore heights settle. Default matches
   * MarkstreamVirtualTimeline restoreMaxLoadingMs (2000).
   */
  function beginLayoutTransition(ms = 2000): void {
    suppressPinUpdatesUntil = Date.now() + ms
    isPinnedToBottom.value = true
  }

  function forceScrollToBottom(): void {
    isPinnedToBottom.value = true
  }

  function releasePin(): void {
    suppressPinUpdatesUntil = 0
    isPinnedToBottom.value = false
  }

  function isNearTop(threshold = 200): boolean {
    const el = getContainer()
    if (!el) return true
    return el.scrollTop <= threshold
  }

  function scrollToTop(): void {
    isPinnedToBottom.value = false
    const el = getContainer()
    if (!el) return
    el.scrollTop = 0
  }

  return {
    onScroll,
    forceScrollToBottom,
    releasePin,
    beginLayoutTransition,
    isNearTop,
    scrollToTop,
    isPinnedToBottom
  }
}
