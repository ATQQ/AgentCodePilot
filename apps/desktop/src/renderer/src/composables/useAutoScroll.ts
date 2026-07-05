import { nextTick, onUnmounted, type Ref } from 'vue'

const BOTTOM_THRESHOLD = 80

type AutoScrollContainerRef = Ref<HTMLElement | null> | (() => HTMLElement | null)

interface AutoScrollResult {
  onScroll: () => void
  scheduleScrollToBottom: (instant?: boolean) => void
  forceScrollToBottom: (instant?: boolean) => void
  scrollToBottom: (instant?: boolean) => void
  beginLayoutTransition: (ms?: number) => void
}

export function useAutoScroll(containerRef: AutoScrollContainerRef): AutoScrollResult {
  let rafId: number | null = null
  let userPinnedToBottom = true
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
    userPinnedToBottom = isNearBottom()
  }

  function beginLayoutTransition(ms = 250): void {
    suppressPinUpdatesUntil = Date.now() + ms
    userPinnedToBottom = true
  }

  function scrollToBottom(instant = false): void {
    if (!userPinnedToBottom && !instant) return
    const el = getContainer()
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: instant ? 'instant' : 'smooth'
    })
  }

  function scheduleScrollToBottom(instant = false): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      nextTick(() => scrollToBottom(instant))
    })
  }

  function forceScrollToBottom(instant = true): void {
    userPinnedToBottom = true
    scheduleScrollToBottom(instant)
  }

  onUnmounted(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  return {
    onScroll,
    scheduleScrollToBottom,
    forceScrollToBottom,
    scrollToBottom,
    beginLayoutTransition
  }
}
