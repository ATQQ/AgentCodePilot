<script setup lang="ts">
defineProps<{
  tabs: string[]
  active: string | null
}>()

const emit = defineEmits<{
  select: [path: string]
  close: [path: string]
}>()

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}
</script>

<template>
  <div v-if="tabs.length > 0" class="editor-file-tabs elegant-scroll">
    <button
      v-for="path in tabs"
      :key="path"
      class="tab-item"
      :class="{ active: active === path }"
      :title="path"
      @click="emit('select', path)"
    >
      <span class="tab-label">{{ fileName(path) }}</span>
      <span
        class="tab-close"
        title="关闭"
        @click.stop="emit('close', path)"
      >×</span>
    </button>
  </div>
</template>

<style scoped>
.editor-file-tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  border-bottom: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  min-height: 32px;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 0 10px;
  border: none;
  border-right: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  flex-shrink: 0;
}

.tab-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.tab-item.active {
  background: var(--content-bg);
  color: var(--sidebar-text-active);
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1;
  color: var(--content-text-tertiary);
  flex-shrink: 0;
}

.tab-close:hover {
  background: var(--sidebar-item-active);
  color: var(--content-text);
}
</style>
