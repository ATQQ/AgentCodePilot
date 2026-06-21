<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  scroll: []
}>()

const scrollContainer = ref<HTMLElement | null>(null)

function onScroll(): void {
  emit('scroll')
}

onMounted(() => {
  // exposed for parent auto-scroll
})

defineExpose({ scrollContainer })
</script>

<template>
  <div ref="scrollContainer" class="messages-container elegant-scroll" @scroll="onScroll">
    <slot />
    <slot name="after" />
  </div>
</template>

<style scoped>
.messages-container {
  flex: 1;
  min-height: 0;
}
</style>
