import { nextTick, onUnmounted, type Ref } from 'vue'

const BOTTOM_THRESHOLD = 80

export function useAutoScroll(containerRef: Ref<HTMLElement | null> | (() => HTMLElement | null)): {
  onScroll: () => void
  scheduleScrollToBottom: (instant?: boolean) => void
  forceScrollToBottom: (instant?: boolean) => void
  scrollToBottom: (instant?: boolean) => void
} {
  let rafId: number | null = null
  let userPinnedToBottom = true

  function getContainer(): HTMLElement | null {
    return typeof containerRef === 'function' ? containerRef() : containerRef.value
  }

  function isNearBottom(): boolean {
    const el = getContainer()
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
  }

  function onScroll(): void {
    userPinnedToBottom = isNearBottom()
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
    scrollToBottom
  }
}
