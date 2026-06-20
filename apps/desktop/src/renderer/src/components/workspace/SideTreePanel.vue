<script setup lang="ts">
import ResizableSplit from '@renderer/components/layout/ResizableSplit.vue'

const props = withDefaults(
  defineProps<{
    width?: number
    overlay?: boolean
    resizable?: boolean
    minWidth?: number
    maxWidth?: number
  }>(),
  {
    overlay: false,
    resizable: true,
    minWidth: 160,
    maxWidth: 560
  }
)

const emit = defineEmits<{
  'update:width': [value: number]
}>()

function onResize(next: number): void {
  emit('update:width', next)
}
</script>

<template>
  <aside
    class="side-tree-panel"
    :class="{ overlay }"
    :style="{ width: `${width ?? 220}px` }"
  >
    <ResizableSplit
      v-if="resizable"
      direction="horizontal"
      invert
      :size="width ?? 220"
      :min-size="minWidth"
      :max-size="maxWidth"
      @update:size="onResize"
    />
    <div class="side-tree-inner">
      <div class="side-tree-header">
        <slot name="header" />
      </div>
      <div class="side-tree-body elegant-scroll">
        <slot />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side-tree-panel {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  height: 100%;
  border-left: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  overflow: hidden;
}

.side-tree-panel.overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  box-shadow: -4px 0 16px color-mix(in srgb, var(--content-bg) 40%, transparent);
}

.side-tree-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.side-tree-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 40px 6px 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.side-tree-header :slotted(*) {
  flex: 1;
  min-width: 0;
}

.side-tree-body {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
</style>
