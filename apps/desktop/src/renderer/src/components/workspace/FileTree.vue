<script setup lang="ts">
import { onMounted, watch, defineAsyncComponent } from 'vue'
import { useFileExplorerStore } from '@renderer/stores/fileExplorer.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import type { FileEntry } from '@renderer/types'
import { FileTreeNode } from './FileTreeNode'

const FilePreviewComp = defineAsyncComponent(
  () => import('./FilePreview.vue')
)

const fileStore = useFileExplorerStore()
const panelContext = usePanelContextStore()
const composerStore = useComposerStore()

onMounted(async () => {
  await fileStore.ensureRootLoaded()
})

watch(() => panelContext.effectivePanelCwd, async () => {
  fileStore.clearCache()
  await fileStore.ensureRootLoaded()
})

async function onEntryClick(entry: FileEntry): Promise<void> {
  if (entry.isDirectory) {
    await fileStore.toggleDir(entry.path)
  } else {
    await fileStore.openFile(entry.path)
  }
}

function sendToChat(entry: FileEntry): void {
  composerStore.addFileReference(entry.path)
}

function showContextMenu(e: MouseEvent, entry: FileEntry): void {
  e.preventDefault()
  const action = window.prompt(`选择操作：\n1. 添加到对话\n2. 复制路径\n3. 删除\n\n输入数字：`)
  if (action === '1') {
    sendToChat(entry)
  } else if (action === '2') {
    navigator.clipboard.writeText(entry.path)
  } else if (action === '3' && !entry.isDirectory) {
    if (window.confirm(`删除 ${entry.name}？`)) {
      fileStore.deleteFile(entry.path)
    }
  }
}

function getItems(dir: string): FileEntry[] {
  return fileStore.childrenCache[dir] ?? []
}
</script>

<template>
  <div class="file-tree-panel">
    <div class="ft-toolbar">
      <input
        v-model="fileStore.filter"
        class="filter-input"
        placeholder="筛选文件…"
      />
    </div>

    <div v-if="!panelContext.effectivePanelCwd" class="empty-msg">请先选择项目</div>

    <template v-else>
      <div class="file-split">
        <div class="file-list">
          <template v-if="fileStore.filter">
            <button
              v-for="entry in fileStore.filteredTree"
              :key="entry.path"
              class="file-row leaf"
              :class="{ active: !entry.isDirectory && fileStore.openFilePath === entry.path }"
              @click="onEntryClick(entry)"
              @contextmenu="showContextMenu($event, entry)"
            >
              <span class="file-icon">{{ entry.isDirectory ? '📁' : '📄' }}</span>
              <span class="file-name" :title="entry.relativePath">{{ entry.name }}</span>
            </button>
          </template>

          <FileTreeNode
            v-for="entry in getItems(fileStore.treeRoot ?? '')"
            v-else
            :key="entry.path"
            :entry="entry"
            :depth="0"
            :get-items="getItems"
            :is-expanded="fileStore.isExpanded"
            :active-file-path="fileStore.openFilePath"
            @click-entry="onEntryClick"
            @context-menu="showContextMenu"
          />
        </div>

        <div class="ft-preview">
          <Suspense v-if="fileStore.openFilePath">
            <FilePreviewComp :file-path="fileStore.openFilePath" />
            <template #fallback>
              <div class="empty-msg">加载中…</div>
            </template>
          </Suspense>
          <div v-else class="empty-msg">点击文件预览</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.file-tree-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ft-toolbar {
  padding: 6px 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.filter-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  outline: none;
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--composer-border-focus);
}

.file-split {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.file-list {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--sidebar-border);
}

.ft-preview {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-row {
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
}

.file-row:hover {
  background: var(--sidebar-item-hover);
}

.file-row.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.file-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}

/* Styles for FileTreeNode rendered rows (not scoped inside component) */
:deep(.file-tree-node) {
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
  color: var(--content-text-secondary);
  font-size: 10px;
  flex-shrink: 0;
}

:deep(.file-icon-spacer) {
  width: 12px;
  flex-shrink: 0;
}
</style>
