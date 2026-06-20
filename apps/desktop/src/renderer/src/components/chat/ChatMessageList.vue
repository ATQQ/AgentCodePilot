<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import type { Message } from '@renderer/types'

const props = defineProps<{
  messages: Message[]
  showStandaloneThinking: boolean
  pendingApprovalMessageIds: Set<string>
}>()

const emit = defineEmits<{
  scroll: []
}>()

const scrollerRef = ref<{ $el: HTMLElement } | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)

function syncScrollContainer(): void {
  scrollContainer.value = scrollerRef.value?.$el ?? null
}

function sizeDependencies(msg: Message): unknown[] {
  return [
    msg.content,
    msg.toolCalls?.length ?? 0,
    msg.attachments?.length ?? 0,
    props.pendingApprovalMessageIds.has(msg.id) ? 1 : 0,
    msg.stopped ? 1 : 0
  ]
}

function onScroll(): void {
  emit('scroll')
}

onMounted(() => {
  syncScrollContainer()
})

watch(
  () => props.messages.length,
  () => {
    nextTick(syncScrollContainer)
  }
)

defineExpose({ scrollContainer })
</script>

<template>
  <DynamicScroller
    ref="scrollerRef"
    :items="messages"
    :min-item-size="120"
    key-field="id"
    class="messages-container elegant-scroll"
    @scroll="onScroll"
  >
    <template #default="{ item, index, active }">
      <DynamicScrollerItem
        :item="item"
        :active="active"
        :data-index="index"
        :size-dependencies="sizeDependencies(item)"
        class="message-scroller-item"
      >
        <slot name="message" :msg="item" />
      </DynamicScrollerItem>
    </template>
    <template #after>
      <slot name="after" />
    </template>
  </DynamicScroller>
</template>

<style scoped>
.messages-container {
  flex: 1;
  min-height: 0;
}

.message-scroller-item {
  padding-bottom: var(--spacing-lg);
}
</style>
