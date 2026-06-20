<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GitChangedFile } from '@renderer/types'
import { buildPathTree, collectDirPaths } from '@renderer/utils/pathTree'
import { GitTreeNode } from './GitTreeNode'

const props = defineProps<{
  files: GitChangedFile[]
  selectedFile: string | null
  scope: 'unstaged' | 'staged'
  filter?: string
}>()

const emit = defineEmits<{
  select: [path: string]
  stage: [path: string]
  unstage: [path: string]
  discard: [path: string]
}>()

const filter = computed(() => props.filter ?? '')
const expandedDirs = ref<Set<string>>(new Set())

const tree = computed(() => buildPathTree(props.files))

const filteredTree = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return tree.value
  const matched = props.files.filter((f) => f.path.toLowerCase().includes(q))
  return buildPathTree(matched)
})

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
  <div class="git-changed-tree">
    <div v-if="files.length === 0" class="empty-msg">暂无变更</div>
    <div v-else-if="filteredTree.length === 0" class="empty-msg">无匹配文件</div>
    <div v-else class="git-tree">
      <GitTreeNode
        v-for="node in filteredTree"
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
        @discard="(path) => emit('discard', path)"
      />
    </div>
  </div>
</template>

<style scoped>
.git-changed-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.filter-input {
  width: 100%;
  padding: 4px 8px;
  margin-bottom: 4px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  outline: none;
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--composer-border-focus);
}

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

:deep(.file-row) {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
}

:deep(.file-row:hover) {
  background: var(--sidebar-item-hover);
}

:deep(.file-row.active) {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

:deep(.expand-icon) {
  width: 12px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--content-text-secondary);
}

:deep(.file-lang-icon) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

:deep(.file-lang-icon svg) {
  width: 16px;
  height: 16px;
}

:deep(.file-name) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

:deep(.compressed-path-row) {
  display: flex;
  align-items: center;
  padding: 3px 8px 1px;
  box-sizing: border-box;
}

:deep(.compressed-path-label) {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.file-actions) {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

:deep(.file-row:hover .file-actions) {
  display: inline-flex;
}

:deep(.action-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
}

:deep(.action-btn:hover) {
  background: var(--sidebar-item-active);
  color: var(--content-text);
}

:deep(.action-btn.stage) {
  color: #16a34a;
}

:deep(.action-btn.discard:hover) {
  color: #dc2626;
}

:deep(.file-stat) {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
}

:deep(.add) { color: #16a34a; }
:deep(.del) { color: #dc2626; }
</style>
