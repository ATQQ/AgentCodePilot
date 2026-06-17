<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GitChangedFile } from '@renderer/types'
import { buildPathTree, collectDirPaths } from '@renderer/utils/pathTree'
import { GitTreeNode } from './GitTreeNode'

const props = defineProps<{
  files: GitChangedFile[]
  selectedFile: string | null
  scope: 'unstaged' | 'staged'
}>()

const emit = defineEmits<{
  select: [path: string]
  stage: [path: string]
  unstage: [path: string]
}>()

const expandedDirs = ref<Set<string>>(new Set())

const tree = computed(() => buildPathTree(props.files))

watch(
  () => props.files,
  (files) => {
    expandedDirs.value = new Set(collectDirPaths(buildPathTree(files)))
  },
  { immediate: true }
)

function toggleDir(path: string): void {
  const next = new Set(expandedDirs.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expandedDirs.value = next
}

function isExpanded(path: string): boolean {
  return expandedDirs.value.has(path)
}
</script>

<template>
  <div v-if="files.length === 0" class="empty-msg">暂无变更</div>
  <div v-else class="git-tree">
    <GitTreeNode
      v-for="node in tree"
      :key="node.path"
      :node="node"
      :depth="0"
      :selected-file="selectedFile"
      :scope="scope"
      :is-expanded="isExpanded"
      @toggle-dir="toggleDir"
      @select="(path) => emit('select', path)"
      @stage="(path) => emit('stage', path)"
      @unstage="(path) => emit('unstage', path)"
    />
  </div>
</template>

<style scoped>
.git-tree {
  display: flex;
  flex-direction: column;
}

.empty-msg {
  padding: 16px 8px;
  text-align: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}

:deep(.git-tree-node) {
  display: contents;
}

:deep(.tree-row) {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
}

:deep(.tree-row:hover) {
  background: var(--sidebar-item-hover);
}

:deep(.tree-row.active) {
  background: var(--sidebar-item-active);
}

:deep(.expand-icon),
:deep(.expand-spacer) {
  width: 12px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--content-text-secondary);
}

:deep(.node-name) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.file-stat) {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
}

:deep(.add) { color: #16a34a; }
:deep(.del) { color: #dc2626; }

:deep(.stage-btn) {
  display: none;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  color: #16a34a;
  flex-shrink: 0;
}

:deep(.stage-btn.unstage) {
  color: var(--content-text-secondary);
}

:deep(.tree-row:hover .stage-btn) {
  display: inline-flex;
}
</style>
