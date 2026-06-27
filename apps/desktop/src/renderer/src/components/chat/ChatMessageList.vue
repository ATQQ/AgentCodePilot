<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
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
}>()

const emit = defineEmits<{
  scroll: []
}>()

const timelineRef = ref<TimelineExpose | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const initialThreadState = ref<MarkstreamThreadVirtualState | null>(null)
const lastThreadState = ref<MarkstreamThreadVirtualState | null>(null)
const savedThreadStates = new Map<string, MarkstreamThreadVirtualState>()

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

function onScroll(): void {
  emit('scroll')
}

function onThreadStateChange(state: MarkstreamThreadVirtualState): void {
  lastThreadState.value = state
}

function estimateItemHeight(item: ChatTimelineItem): number {
  const expanded =
    item.message.role === 'user' ? (props.isUserMessageExpanded?.(item.message.id) ?? false) : false
  return estimateTimelineItemHeight(item, expanded)
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
    void nextTick(() => {
      timelineRef.value?.restoreThreadState(restored)
      syncScrollContainer()
    })
  }
)

watch(timelineRef, () => syncScrollContainer(), { flush: 'post' })

onMounted(() => {
  syncScrollContainer()
})

defineExpose({
  scrollContainer,
  scrollToBottom: () => timelineRef.value?.scrollToBottom()
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
    stick-to-bottom="auto"
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
}

.messages-container :deep(.markstream-virtual-timeline__item) {
  padding-bottom: var(--spacing-lg);
}
</style>
