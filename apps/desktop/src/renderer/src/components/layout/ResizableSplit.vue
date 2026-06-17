<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    direction?: 'horizontal' | 'vertical'
    size: number
    minSize?: number
    maxSize?: number
    invert?: boolean
  }>(),
  {
    direction: 'horizontal',
    minSize: 200,
    maxSize: 600,
    invert: false
  }
)

const emit = defineEmits<{
  'update:size': [value: number]
}>()

const dragging = ref(false)

function onMouseDown(e: MouseEvent): void {
  e.preventDefault()
  dragging.value = true
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging.value) return
  const delta = props.direction === 'horizontal' ? e.movementX : e.movementY
  const next = props.invert ? props.size - delta : props.size + delta
  emit('update:size', Math.min(props.maxSize, Math.max(props.minSize, next)))
}

function onMouseUp(): void {
  dragging.value = false
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div
    class="resize-handle"
    :class="[direction, { dragging }]"
    @mousedown="onMouseDown"
  />
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
}

.resize-handle.horizontal {
  width: 4px;
  cursor: col-resize;
}

.resize-handle.vertical {
  height: 4px;
  cursor: row-resize;
}

.resize-handle:hover,
.resize-handle.dragging {
  background: var(--sidebar-border);
}
</style>
