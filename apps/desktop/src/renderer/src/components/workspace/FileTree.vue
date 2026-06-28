<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFileExplorerStore } from '@renderer/stores/fileExplorer.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import type { FileEntry } from '@renderer/types'
import { getFileLanguageIconHtml } from '@renderer/utils/fileLanguageIcon'
import { getBaseName, getParentDir, joinWorkspacePath } from '@renderer/utils/workspacePath'
import { FileTreeNode } from './FileTreeNode'
import EditorFileTabs from './EditorFileTabs.vue'
import SideTreePanel from './SideTreePanel.vue'
import SideTreeFolderBtn from './SideTreeFolderBtn.vue'
import FilePreview from './FilePreview.vue'
import FileTreeContextMenu from './FileTreeContextMenu.vue'
import FileNameDialog, { type FileNameDialogMode } from './FileNameDialog.vue'

const { t } = useI18n()
const fileStore = useFileExplorerStore()
const panelContext = usePanelContextStore()
const composerStore = useComposerStore()
const layoutStore = useLayoutStore()

const treeCollapsed = ref(false)
const contextMenuRef = ref<InstanceType<typeof FileTreeContextMenu> | null>(null)
const nameDialogRef = ref<InstanceType<typeof FileNameDialog> | null>(null)
const nameDialogVisible = ref(false)
const nameDialogMode = ref<FileNameDialogMode>('newFile')
const nameDialogInitialName = ref('')
const nameDialogParentDir = ref('')
const renameEntry = ref<FileEntry | null>(null)

onMounted(async () => {
  await fileStore.ensureRootLoaded()
})

watch(
  () => fileStore.editMode,
  (enabled, wasEnabled) => {
    if (enabled && !wasEnabled) {
      fileStore.rememberFileTreeOpenBeforeEdit(!treeCollapsed.value)
      treeCollapsed.value = true
    }
  }
)

watch(
  () => fileStore.fileSaveToken,
  () => {
    if (fileStore.consumeFileTreeRestore()) {
      treeCollapsed.value = false
    }
  }
)

watch(
  () => panelContext.effectivePanelCwd,
  async () => {
    fileStore.clearCache()
    await fileStore.ensureRootLoaded()
  }
)

async function onEntryClick(entry: FileEntry): Promise<void> {
  if (entry.isDirectory) {
    await fileStore.toggleDir(entry.path)
  } else {
    await fileStore.openFile(entry.path)
  }
}

function resolveTargetDir(entry: FileEntry | null): string {
  const root = fileStore.treeRoot
  if (!root) return ''
  if (!entry) return root
  return entry.isDirectory ? entry.path : getParentDir(entry.path)
}

function openContextMenu(e: MouseEvent, entry: FileEntry | null): void {
  e.preventDefault()
  e.stopPropagation()
  const targetDir = resolveTargetDir(entry)
  if (!targetDir) return
  void contextMenuRef.value?.open(e.clientX, e.clientY, entry, targetDir)
}

function showContextMenu(e: MouseEvent, entry: FileEntry): void {
  openContextMenu(e, entry)
}

function onTreeBlankContextMenu(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('.file-row')) return
  openContextMenu(e, null)
}

function handleAddToChat(entry: FileEntry): void {
  composerStore.addFileReference(entry.path)
}

function handleCopy(entry: FileEntry): void {
  fileStore.copyToClipboard(entry.path, 'copy')
  ElMessage.success(t('workspace.fileTree.contextMenu.copied'))
}

function handleCut(entry: FileEntry): void {
  fileStore.copyToClipboard(entry.path, 'cut')
  ElMessage.success(t('workspace.fileTree.contextMenu.copied'))
}

async function handlePaste(targetDir: string): Promise<void> {
  const clip = fileStore.fileClipboard
  if (!clip || !fileStore.canPasteIntoDir(targetDir)) return

  const name = getBaseName(clip.path)
  const exists = await fileStore.entryExistsInDir(targetDir, name)

  if (exists) {
    const confirmed = window.confirm(
      t('workspace.fileTree.contextMenu.pasteOverwriteConfirm', { name })
    )
    if (!confirmed) return
    await fileStore.pasteIntoDir(targetDir, true)
    return
  }

  await fileStore.pasteIntoDir(targetDir, false)
}

function openNameDialog(mode: FileNameDialogMode, parentDir: string, initialName = ''): void {
  nameDialogMode.value = mode
  nameDialogParentDir.value = parentDir
  nameDialogInitialName.value = initialName
  nameDialogVisible.value = true
}

function handleNewFile(targetDir: string): void {
  openNameDialog('newFile', targetDir)
}

function handleNewFolder(targetDir: string): void {
  openNameDialog('newFolder', targetDir)
}

function handleRename(entry: FileEntry): void {
  renameEntry.value = entry
  openNameDialog('rename', getParentDir(entry.path), entry.name)
}

async function handleCopyAbsolutePath(entry: FileEntry): Promise<void> {
  await navigator.clipboard.writeText(entry.path)
  ElMessage.success(t('workspace.fileTree.contextMenu.pathCopied'))
}

async function handleCopyRelativePath(entry: FileEntry): Promise<void> {
  await navigator.clipboard.writeText(entry.relativePath)
  ElMessage.success(t('workspace.fileTree.contextMenu.pathCopied'))
}

async function handleDelete(entry: FileEntry): Promise<void> {
  const confirmKey = entry.isDirectory
    ? 'workspace.fileTree.contextMenu.deleteDirConfirm'
    : 'workspace.fileTree.contextMenu.deleteFileConfirm'
  if (!window.confirm(t(confirmKey, { name: entry.name }))) return
  await fileStore.deleteFile(entry.path)
}

function closeNameDialog(): void {
  nameDialogVisible.value = false
  renameEntry.value = null
}

async function handleNameDialogConfirm(name: string): Promise<void> {
  const parentDir = nameDialogParentDir.value
  if (!parentDir) {
    closeNameDialog()
    return
  }

  if (nameDialogMode.value === 'rename' && renameEntry.value) {
    const entry = renameEntry.value
    if (name === entry.name) {
      closeNameDialog()
      return
    }
    if (await fileStore.entryExistsInDir(parentDir, name)) {
      nameDialogRef.value?.setError(t('workspace.fileTree.contextMenu.nameExists'))
      return
    }
    const newPath = joinWorkspacePath(parentDir, name)
    await fileStore.renameEntry(entry.path, newPath)
    closeNameDialog()
    return
  }

  if (await fileStore.entryExistsInDir(parentDir, name)) {
    nameDialogRef.value?.setError(t('workspace.fileTree.contextMenu.nameExists'))
    return
  }

  if (nameDialogMode.value === 'newFile') {
    const filePath = await fileStore.createFile(parentDir, name)
    closeNameDialog()
    await fileStore.openFile(filePath)
    return
  }

  if (nameDialogMode.value === 'newFolder') {
    const dirPath = await fileStore.createDirectory(parentDir, name)
    closeNameDialog()
    await fileStore.toggleDir(dirPath)
  }
}

function getItems(dir: string): FileEntry[] {
  return fileStore.childrenCache[dir] ?? []
}

function onTabSelect(path: string): void {
  fileStore.selectTab(path)
}

function onTabClose(path: string): void {
  fileStore.closeTab(path)
}

function onCloseOthers(path: string): void {
  fileStore.closeOtherTabs(path)
}

function onCloseAll(): void {
  fileStore.closeAllTabs()
}
</script>

<template>
  <div class="file-tree-panel">
    <div v-if="!panelContext.effectivePanelCwd" class="empty-msg">请先选择项目</div>

    <template v-else>
      <div class="ft-body">
        <div class="main-pane">
          <SideTreeFolderBtn
            :title="treeCollapsed ? '展开文件树' : '收起文件树'"
            floating
            @click="treeCollapsed = !treeCollapsed"
          />

          <EditorFileTabs
            :tabs="fileStore.openTabs"
            :active="fileStore.openFilePath"
            @select="onTabSelect"
            @close="onTabClose"
            @close-others="onCloseOthers"
            @close-all="onCloseAll"
          />

          <div class="ft-preview">
            <Suspense v-if="fileStore.openFilePath">
              <FilePreview :file-path="fileStore.openFilePath" />
              <template #fallback>
                <div class="empty-msg">加载中…</div>
              </template>
            </Suspense>
            <div v-else class="empty-msg">点击文件预览</div>
          </div>
        </div>

        <SideTreePanel
          v-if="!treeCollapsed"
          overlay
          :width="layoutStore.sideTreeWidth"
          @update:width="layoutStore.sideTreeWidth = $event"
        >
          <template #header>
            <input v-model="fileStore.filter" class="filter-input" placeholder="筛选文件…" />
          </template>

          <div class="tree-content" @contextmenu="onTreeBlankContextMenu">
            <template v-if="fileStore.filter">
              <button
                v-for="entry in fileStore.filteredTree"
                :key="entry.path"
                class="file-row leaf"
                :class="{ active: !entry.isDirectory && fileStore.openFilePath === entry.path }"
                @click="onEntryClick(entry)"
                @contextmenu="showContextMenu($event, entry)"
              >
                <span v-if="entry.isDirectory" class="expand-icon">▸</span>
                <span v-else class="file-lang-icon" v-html="getFileLanguageIconHtml(entry.path)" />
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
        </SideTreePanel>
      </div>
    </template>

    <FileTreeContextMenu
      ref="contextMenuRef"
      @add-to-chat="handleAddToChat"
      @copy="handleCopy"
      @cut="handleCut"
      @paste="handlePaste"
      @new-file="handleNewFile"
      @new-folder="handleNewFolder"
      @copy-absolute-path="handleCopyAbsolutePath"
      @copy-relative-path="handleCopyRelativePath"
      @rename="handleRename"
      @delete="handleDelete"
    />

    <FileNameDialog
      ref="nameDialogRef"
      :visible="nameDialogVisible"
      :mode="nameDialogMode"
      :initial-name="nameDialogInitialName"
      @confirm="handleNameDialogConfirm"
      @cancel="closeNameDialog"
    />
  </div>
</template>

<style scoped>
.file-tree-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ft-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-pane {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-input {
  width: 100%;
  padding: 4px 8px;
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

.tree-content {
  min-height: 100%;
}

.ft-preview {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ft-preview > * {
  flex: 1;
  min-height: 0;
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
  box-sizing: border-box;
}

.file-row:hover {
  background: var(--sidebar-item-hover);
}

.file-row.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.expand-icon {
  width: 12px;
  color: var(--content-text-secondary);
  font-size: 10px;
  flex-shrink: 0;
}

.file-lang-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.file-lang-icon :deep(svg) {
  width: 16px;
  height: 16px;
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
</style>
