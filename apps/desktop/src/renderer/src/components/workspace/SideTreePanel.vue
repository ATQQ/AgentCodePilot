<script setup lang="ts">
import SideTreeFolderBtn from './SideTreeFolderBtn.vue'

withDefaults(
  defineProps<{
    width?: number
    overlay?: boolean
  }>(),
  { overlay: false }
)

const emit = defineEmits<{
  collapse: []
}>()
</script>

<template>
  <aside
    class="side-tree-panel"
    :class="{ overlay }"
    :style="{ width: `${width ?? 220}px` }"
  >
    <div class="side-tree-header">
      <slot name="header" />
      <SideTreeFolderBtn title="收起文件树" @click="emit('collapse')" />
    </div>
    <div class="side-tree-body elegant-scroll">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.side-tree-panel {
  display: flex;
  flex-direction: column;
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

.side-tree-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
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
