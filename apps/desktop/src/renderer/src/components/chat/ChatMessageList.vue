<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MarkstreamVirtualTimeline,
  type MarkstreamThreadVirtualState,
  type MarkstreamVirtualMarkdownProps
} from 'markstream-vue'
import type { Message } from '@renderer/types'
import {
  useChatTimelineItems,
  estimateTimelineItemHeight,
  layoutWidthBucket,
  type ChatTimelineItem
} from '@renderer/composables/useChatTimelineItems'

/** Cap restore overlay so rapid switches / Monaco settle never stick forever. */
const RESTORE_MAX_LOADING_MS = 2000
/** Retries after virtual/DOM heights finish settling (Monaco, markdown, resize). */
const BOTTOM_SETTLE_DELAYS_MS = [0, 32, 100, 250, 500] as const

interface TimelineExpose {
  $el: HTMLElement
  scrollToBottom: () => void
  captureThreadState: () => MarkstreamThreadVirtualState
  restoreThreadState: (state: MarkstreamThreadVirtualState | null | undefined) => void
}

const props = defineProps<{
  messages: Message[]
  conversationId: string | null
  isDark: boolean
  layoutWidth: number
  isMessageStreaming: (messageId: string) => boolean
  hasPendingApproval: (messageId: string) => boolean
  isUserMessageExpanded?: (messageId: string) => boolean
  stickToBottom?: boolean | 'auto'
}>()

const emit = defineEmits<{
  scroll: []
}>()

const timelineRef = ref<TimelineExpose | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const initialThreadState = ref<MarkstreamThreadVirtualState | null>(null)
const lastThreadState = ref<MarkstreamThreadVirtualState | null>(null)
const savedThreadStates = new Map<string, MarkstreamThreadVirtualState>()
/** Invalidate in-flight nextTick restores when user switches again quickly. */
let restoreGeneration = 0
let bottomSettleGeneration = 0
const bottomSettleTimers: number[] = []

const timelineItems = useChatTimelineItems({
  messages: () => props.messages,
  isMessageStreaming: (id) => props.isMessageStreaming(id),
  hasPendingApproval: (id) => props.hasPendingApproval(id),
  isUserMessageExpanded: (id) => props.isUserMessageExpanded?.(id) ?? false
})

const measurementKey = computed(
  () => `chat:${props.isDark ? 'dark' : 'light'}:${layoutWidthBucket(props.layoutWidth)}`
)

function syncScrollContainer(): void {
  const el = timelineRef.value?.$el
  scrollContainer.value = el instanceof HTMLElement ? el : null
}

function clearBottomSettleTimers(): void {
  for (const id of bottomSettleTimers) window.clearTimeout(id)
  bottomSettleTimers.length = 0
}

/**
 * Library scrollToBottom uses max(virtualTotal, scrollHeight), but right after switch/resize
 * both can still be settling. Sync DOM scrollHeight on retries so we actually reach the end
 * (avoids "stuck a little above bottom").
 */
function scrollToBottomNow(): void {
  timelineRef.value?.scrollToBottom()
  const el = scrollContainer.value ?? timelineRef.value?.$el
  if (el instanceof HTMLElement) {
    el.scrollTop = el.scrollHeight
  }
  emit('scroll')
}

function scrollToBottomSettled(): void {
  const gen = ++bottomSettleGeneration
  clearBottomSettleTimers()
  for (const ms of BOTTOM_SETTLE_DELAYS_MS) {
    const id = window.setTimeout(() => {
      if (gen !== bottomSettleGeneration) return
      syncScrollContainer()
      scrollToBottomNow()
    }, ms)
    bottomSettleTimers.push(id)
  }
}

function wasPinnedToBottom(state: MarkstreamThreadVirtualState | null): boolean {
  if (!state?.outerAnchor) return true
  if (state.outerAnchor.type === 'bottom') {
    return state.outerAnchor.distanceFromBottomPx <= 48
  }
  return false
}

function onScroll(): void {
  emit('scroll')
}

function onThreadStateChange(state: MarkstreamThreadVirtualState): void {
  lastThreadState.value = state
}

function estimateItemHeight(item: ChatTimelineItem): number {
  const expanded =
    item.message.role === 'user' ? (props.isUserMessageExpanded?.(item.message.id) ?? false) : false
  // Include row gap that used to live on the virtual item wrapper (must be in the height tree).
  return estimateTimelineItemHeight(item, expanded) + 16
}

watch(
  () => props.conversationId,
  (newId, oldId) => {
    if (oldId) {
      const state = lastThreadState.value ?? timelineRef.value?.captureThreadState?.()
      if (state) {
        savedThreadStates.set(oldId, state)
      }
    }
    const restored = newId ? (savedThreadStates.get(newId) ?? null) : null
    initialThreadState.value = restored
    const pinBottom = wasPinnedToBottom(restored)
    const gen = ++restoreGeneration
    void nextTick(() => {
      if (gen !== restoreGeneration) return
      timelineRef.value?.restoreThreadState(restored)
      syncScrollContainer()
      if (pinBottom) {
        scrollToBottomSettled()
      } else {
        // Sync parent pin from restored mid-thread position (avoid stick-to-bottom fighting restore).
        emit('scroll')
      }
    })
  }
)

// Width/theme remount: if host still wants stick, re-settle to real bottom after heights rebuild.
watch(measurementKey, () => {
  if (props.stickToBottom === false) return
  void nextTick(() => {
    requestAnimationFrame(() => {
      syncScrollContainer()
      if (props.stickToBottom === false) return
      scrollToBottomSettled()
    })
  })
})

watch(timelineRef, () => syncScrollContainer(), { flush: 'post' })

onMounted(() => {
  syncScrollContainer()
})

onUnmounted(() => {
  clearBottomSettleTimers()
  bottomSettleGeneration++
})

defineExpose({
  scrollContainer,
  scrollToBottom: scrollToBottomSettled
})
</script>

<template>
  <MarkstreamVirtualTimeline
    ref="timelineRef"
    class="messages-container elegant-scroll"
    :items="timelineItems"
    :thread-key="conversationId ?? undefined"
    :measurement-key="measurementKey"
    markdown-mode="chat"
    markdown-code-renderer="monaco"
    :markdown-fade="false"
    :stick-to-bottom="stickToBottom ?? 'auto'"
    :restore-max-loading-ms="RESTORE_MAX_LOADING_MS"
    :overscan-px="1200"
    :initial-thread-state="initialThreadState"
    :estimate-item-height="estimateItemHeight"
    @scroll="onScroll"
    @thread-state-change="onThreadStateChange"
  >
    <template #default="{ item, markdownProps, measureRef }">
      <slot
        name="message"
        :item="item"
        :msg="item.message"
        :markdown-props="markdownProps as MarkstreamVirtualMarkdownProps"
        :measure-ref="measureRef"
      />
    </template>

    <template #after>
      <slot name="after" />
    </template>
  </MarkstreamVirtualTimeline>
</template>

<style scoped>
.messages-container {
  flex: 1;
  min-height: 0;
  overscroll-behavior-y: none;
}

/* Do NOT pad the virtual item wrapper — that height is invisible to Markstream's
   totalHeight tree and leaves a "can still scroll a bit" gap after scrollToBottom. */
</style>
