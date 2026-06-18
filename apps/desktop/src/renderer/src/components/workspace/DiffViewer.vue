<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent } from 'vue'
import { useGitStore } from '@renderer/stores/git.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import type { GitDiffScope } from '@renderer/types'
import EditorFileTabs from './EditorFileTabs.vue'
import SideTreePanel from './SideTreePanel.vue'
import SideTreeExpandBtn from './SideTreeExpandBtn.vue'
import MonacoDiffEditor from './MonacoDiffEditor.vue'
const GitChangedFileTree = defineAsyncComponent(
  () => import('@renderer/components/workspace/GitChangedFileTree.vue')
)
const GitCommitBar = defineAsyncComponent(
  () => import('@renderer/components/workspace/GitCommitBar.vue')
)

const gitStore = useGitStore()
const layoutStore = useLayoutStore()
const panelContext = usePanelContextStore()

const treeCollapsed = ref(false)
const treeFilter = ref('')

const scopeOptions = computed(() => {
  const unstagedCount = gitStore.changedFilesByScope.unstaged.length
  const stagedCount = gitStore.changedFilesByScope.staged.length
  return [
    { value: 'unstaged' as GitDiffScope, label: `未暂存${unstagedCount ? ` ${unstagedCount}` : ''}` },
    { value: 'staged' as GitDiffScope, label: `已暂存${stagedCount ? ` ${stagedCount}` : ''}` }
  ]
})

const openTabs = computed(() => gitStore.getOpenTabs(layoutStore.reviewScope))

const filesLoading = computed(() => gitStore.isFilesLoading(layoutStore.reviewScope))
const showFilesEmptyLoading = computed(
  () => filesLoading.value && gitStore.changedFiles.length === 0
)
const showDiffEmptyLoading = computed(
  () => gitStore.diffLoading && !gitStore.diffOriginal && !gitStore.diffModified
)

const showDiffLoadFailed = computed(() => !!gitStore.diffError)

const activeFileMeta = computed(() =>
  gitStore.changedFiles.find((f) => f.path === gitStore.selectedFile)
)

function onScopeChange(scope: GitDiffScope): void {
  layoutStore.reviewScope = scope as import('@renderer/stores/layout.store').ReviewScope
}

function onFileSelect(path: string): void {
  gitStore.openFileTab(path)
}

function onTabSelect(path: string): void {
  gitStore.selectFile(path)
}

function onTabClose(path: string): void {
  gitStore.closeFileTab(path)
}

function onStage(path: string): void {
  void gitStore.stageFiles([path])
}

function onUnstage(path: string): void {
  void gitStore.unstageFiles([path])
}

function onDiscard(path: string): void {
  const name = path.split('/').pop() ?? path
  if (!window.confirm(`确定放弃「${name}」的更改？此操作不可撤销。`)) return
  void gitStore.discardFiles([path])
}

function onCloseOthers(path: string): void {
  gitStore.closeOtherTabs(path)
}

function onCloseAll(): void {
  gitStore.closeAllTabs()
}

watch(
  () => layoutStore.reviewScope,
  (scope) => {
    void gitStore.loadChangedFiles(scope)
  },
  { immediate: true }
)

watch(
  () => [gitStore.selectedFile, layoutStore.reviewScope] as const,
  ([file, scope]) => {
    gitStore.applyScope(scope)
    if (file) void gitStore.loadDiff(file, scope === 'staged')
  },
  { immediate: true }
)
</script>

<template>
  <div class="diff-viewer">
    <div v-if="!panelContext.effectivePanelCwd" class="empty-msg full">请先选择项目</div>

    <template v-else-if="gitStore.status && !gitStore.status.isRepo">
      <div class="empty-msg full">不是 Git 仓库，无法查看变更</div>
    </template>

    <template v-else>
      <div class="dv-toolbar elegant-scroll">
        <div class="scope-tabs">
          <button
            v-for="opt in scopeOptions"
            :key="opt.value"
            class="scope-btn"
            :class="{ active: layoutStore.reviewScope === opt.value }"
            @click="onScopeChange(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="toolbar-right">
          <div class="view-mode-tabs">
            <button
              class="scope-btn"
              :class="{ active: layoutStore.diffViewMode === 'side-by-side' }"
              title="并排"
              @click="layoutStore.setDiffViewMode('side-by-side')"
            >
              并排
            </button>
            <button
              class="scope-btn"
              :class="{ active: layoutStore.diffViewMode === 'inline' }"
              title="内联"
              @click="layoutStore.setDiffViewMode('inline')"
            >
              内联
            </button>
          </div>
        </div>
      </div>

      <div class="dv-body">
        <div class="main-pane">
          <SideTreeExpandBtn v-if="treeCollapsed" @expand="treeCollapsed = false" />

          <GitCommitBar v-if="layoutStore.reviewScope === 'staged'" />

          <EditorFileTabs
            :tabs="openTabs"
            :active="gitStore.selectedFile"
            @select="onTabSelect"
            @close="onTabClose"
            @close-others="onCloseOthers"
            @close-all="onCloseAll"
          />

          <div v-if="gitStore.selectedFile && activeFileMeta" class="file-meta-bar">
            <span class="file-path" :title="gitStore.selectedFile">{{ gitStore.selectedFile }}</span>
            <span class="file-stat">
              <span class="add">+{{ activeFileMeta.additions }}</span>
              <span class="del">-{{ activeFileMeta.deletions }}</span>
            </span>
          </div>

          <div class="diff-area">
            <div v-if="!gitStore.selectedFile" class="empty-msg">选择文件查看差异</div>
            <div v-else-if="showDiffEmptyLoading" class="empty-msg">加载中…</div>
            <div v-else-if="showDiffLoadFailed" class="empty-msg">
              无法加载 diff{{ gitStore.diffError ? `：${gitStore.diffError}` : '' }}
            </div>
            <template v-else-if="gitStore.selectedFile">
              <div class="diff-editor-host">
                <MonacoDiffEditor
                  :key="`${layoutStore.reviewScope}:${gitStore.selectedFile}`"
                  :original="gitStore.diffOriginal"
                  :modified="gitStore.diffModified"
                  :file-path="gitStore.selectedFile"
                  :side-by-side="layoutStore.diffViewMode === 'side-by-side'"
                />
              </div>
              <div v-if="gitStore.diffRefreshing" class="diff-refresh-hint">更新中…</div>
            </template>
          </div>
        </div>

        <SideTreePanel v-if="!treeCollapsed" overlay @collapse="treeCollapsed = true">
          <template #header>
            <input
              v-model="treeFilter"
              class="filter-input"
              placeholder="筛选文件…"
            />
          </template>

          <div v-if="showFilesEmptyLoading" class="empty-msg">加载中…</div>
          <GitChangedFileTree
            v-else
            :filter="treeFilter"
            :files="gitStore.changedFiles"
            :selected-file="gitStore.selectedFile"
            :scope="layoutStore.reviewScope"
            @select="onFileSelect"
            @stage="onStage"
            @unstage="onUnstage"
            @discard="onDiscard"
          />
          <div v-if="filesLoading && gitStore.changedFiles.length > 0" class="list-refresh-hint">
            刷新中…
          </div>
        </SideTreePanel>
      </div>
    </template>
  </div>
</template>

<style scoped>
.diff-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.dv-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.view-mode-tabs,
.scope-tabs {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.scope-btn {
  padding: 0 10px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
}

.scope-btn.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.dv-body {
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

.file-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
  min-width: 0;
}

.file-path {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-stat {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
}

.file-stat .add { color: #16a34a; }
.file-stat .del { color: #dc2626; }

.diff-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.diff-editor-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diff-refresh-hint {
  position: absolute;
  top: 8px;
  right: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  background: color-mix(in srgb, var(--sidebar-bg) 90%, transparent);
  border: 1px solid var(--sidebar-border);
  pointer-events: none;
  z-index: 2;
}

.list-refresh-hint {
  padding: 4px 8px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  border-top: 1px solid var(--sidebar-border);
}

.empty-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
  padding: 16px 8px;
}

.empty-msg.full {
  height: 100%;
}
</style>
