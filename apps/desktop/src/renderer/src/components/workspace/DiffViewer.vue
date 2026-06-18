<script setup lang="ts">
import { computed, watch, defineAsyncComponent } from 'vue'
import { useGitStore } from '@renderer/stores/git.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import type { GitDiffScope } from '@renderer/types'

const MonacoDiff = defineAsyncComponent(
  () => import('@renderer/components/workspace/MonacoDiffEditor.vue')
)
const GitChangedFileTree = defineAsyncComponent(
  () => import('@renderer/components/workspace/GitChangedFileTree.vue')
)
const GitCommitBar = defineAsyncComponent(
  () => import('@renderer/components/workspace/GitCommitBar.vue')
)

const gitStore = useGitStore()
const layoutStore = useLayoutStore()
const panelContext = usePanelContextStore()

const scopeOptions: { value: GitDiffScope; label: string }[] = [
  { value: 'unstaged', label: '未暂存' },
  { value: 'staged', label: '已暂存' }
]

const filesLoading = computed(() => gitStore.isFilesLoading(layoutStore.reviewScope))
const showFilesEmptyLoading = computed(
  () => filesLoading.value && gitStore.changedFiles.length === 0
)
const showFilesRefreshHint = computed(
  () => filesLoading.value && gitStore.changedFiles.length > 0
)
const showDiffEmptyLoading = computed(
  () => gitStore.diffLoading && !gitStore.diffOriginal && !gitStore.diffModified
)

function onScopeChange(scope: GitDiffScope): void {
  layoutStore.reviewScope = scope as import('@renderer/stores/layout.store').ReviewScope
}

function onFileSelect(path: string): void {
  gitStore.selectFile(path)
  void gitStore.loadDiff(path, layoutStore.reviewScope === 'staged')
}

function onStage(path: string): void {
  void gitStore.stageFiles([path])
}

function onUnstage(path: string): void {
  void gitStore.unstageFiles([path])
}

watch(
  () => layoutStore.reviewScope,
  (scope) => {
    gitStore.applyScope(scope)
    void gitStore.loadChangedFiles(scope)
    const file = gitStore.selectedFile
    if (file) {
      void gitStore.loadDiff(file, scope === 'staged')
    }
  },
  { immediate: true }
)

watch(
  () => gitStore.selectedFile,
  (file) => {
    if (file) {
      void gitStore.loadDiff(file, layoutStore.reviewScope === 'staged')
    }
  }
)

</script>

<template>
  <div class="diff-viewer">
    <div v-if="!panelContext.effectivePanelCwd" class="empty-msg full">请先选择项目</div>

    <template v-else-if="gitStore.status && !gitStore.status.isRepo">
      <div class="empty-msg full">不是 Git 仓库，无法查看变更</div>
    </template>

    <template v-else>
      <div class="dv-toolbar">
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
          <span v-if="gitStore.changedFiles.length > 1" class="hint-text">每次显示一个文件</span>
        </div>
      </div>

      <GitCommitBar v-if="layoutStore.reviewScope === 'staged'" />

      <div class="dv-body">
        <div class="file-list">
          <div v-if="showFilesEmptyLoading" class="empty-msg">加载中…</div>
          <template v-else>
            <GitChangedFileTree
              :files="gitStore.changedFiles"
              :selected-file="gitStore.selectedFile"
              :scope="layoutStore.reviewScope"
              @select="onFileSelect"
              @stage="onStage"
              @unstage="onUnstage"
            />
            <div v-if="showFilesRefreshHint" class="list-refresh-hint">刷新中…</div>
          </template>
        </div>

        <div class="diff-area">
          <div v-if="!gitStore.selectedFile" class="empty-msg">选择文件查看差异</div>
          <div v-else-if="showDiffEmptyLoading" class="empty-msg">加载中…</div>
          <template v-else>
            <Suspense :key="`${gitStore.selectedFile}-${layoutStore.reviewScope}-${layoutStore.diffViewMode}`">
              <MonacoDiff
                :original="gitStore.diffOriginal"
                :modified="gitStore.diffModified"
                :language="gitStore.selectedFile?.split('.').pop() ?? ''"
                :side-by-side="layoutStore.diffViewMode === 'side-by-side'"
              />
              <template #fallback>
                <div class="empty-msg">加载编辑器…</div>
              </template>
            </Suspense>
            <div v-if="gitStore.diffRefreshing" class="diff-refresh-hint">更新中…</div>
          </template>
        </div>
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
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.view-mode-tabs {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.scope-tabs {
  display: flex;
  gap: 2px;
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
}

.scope-btn.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.hint-text {
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dv-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.file-list {
  position: relative;
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--sidebar-border);
  overflow-y: auto;
  padding: 4px;
}

.list-refresh-hint {
  position: sticky;
  bottom: 0;
  padding: 4px 8px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  background: color-mix(in srgb, var(--sidebar-bg) 92%, transparent);
  border-top: 1px solid var(--sidebar-border);
}

.diff-area {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
}

.empty-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}

.empty-msg.full {
  height: 100%;
}
</style>
