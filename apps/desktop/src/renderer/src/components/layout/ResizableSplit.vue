<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    direction?: 'horizontal' | 'vertical'
    size: number
    minSize?: number
    maxSize?: number
    invert?: boolean
    /** When true, dragging below minSize emits `collapse` once instead of clamping */
    collapseBelowMin?: boolean
  }>(),
  {
    direction: 'horizontal',
    minSize: 200,
    invert: false,
    collapseBelowMin: false
  }
)

const emit = defineEmits<{
  'update:size': [value: number]
  collapse: []
}>()

const dragging = ref(false)
const handleRef = ref<HTMLElement | null>(null)
let collapseEmitted = false

function setResizing(active: boolean): void {
  document.body.classList.toggle('panel-resizing', active)
  document.body.style.cursor = active
    ? props.direction === 'horizontal'
      ? 'col-resize'
      : 'row-resize'
    : ''
  document.body.style.userSelect = active ? 'none' : ''
}

function stopDragging(): void {
  if (!dragging.value) return
  dragging.value = false
  collapseEmitted = false
  setResizing(false)
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  dragging.value = true
  collapseEmitted = false
  setResizing(true)
  handleRef.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return
  const delta = props.direction === 'horizontal' ? e.movementX : e.movementY
  const next = props.invert ? props.size - delta : props.size + delta
  if (props.collapseBelowMin && next < props.minSize) {
    if (!collapseEmitted) {
      collapseEmitted = true
      try {
        handleRef.value?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      emit('collapse')
      stopDragging()
    }
    return
  }
  let clamped = Math.max(props.minSize, next)
  if (props.maxSize != null) {
    clamped = Math.min(props.maxSize, clamped)
  }
  emit('update:size', clamped)
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return
  try {
    handleRef.value?.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  stopDragging()
}

function onLostPointerCapture(): void {
  stopDragging()
}

onUnmounted(() => {
  stopDragging()
})
</script>

<template>
  <div
    ref="handleRef"
    class="resize-handle"
    :class="[direction, { dragging }]"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @lostpointercapture="onLostPointerCapture"
  />
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s;
  z-index: 100;
  touch-action: none;
}

.resize-handle.horizontal {
  width: 6px;
  margin: 0 -1px;
  cursor: col-resize;
}

.resize-handle.vertical {
  height: 6px;
  margin: -1px 0;
  cursor: row-resize;
}

.resize-handle:hover,
.resize-handle.dragging {
  background: var(--sidebar-border);
}
</style>

<style>
body.panel-resizing webview {
  pointer-events: none !important;
}
</style>
