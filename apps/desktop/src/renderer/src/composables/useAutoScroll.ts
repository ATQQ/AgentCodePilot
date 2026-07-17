import { ref, type Ref } from 'vue'

/** Align with MarkstreamVirtualTimeline unpin threshold (≤48px). */
const BOTTOM_THRESHOLD = 48

type AutoScrollContainerRef = Ref<HTMLElement | null> | (() => HTMLElement | null)

interface AutoScrollResult {
  onScroll: () => void
  /** Marks pinned; actual scroll must go through Markstream scrollToBottom. */
  forceScrollToBottom: () => void
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

  function beginLayoutTransition(ms = 250): void {
    suppressPinUpdatesUntil = Date.now() + ms
    isPinnedToBottom.value = true
  }

  function forceScrollToBottom(): void {
    isPinnedToBottom.value = true
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
    beginLayoutTransition,
    isNearTop,
    scrollToTop,
    isPinnedToBottom
  }
}
