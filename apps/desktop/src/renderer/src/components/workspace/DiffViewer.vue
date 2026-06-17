<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useGitStore } from '@renderer/stores/git.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import type { GitDiffScope } from '@renderer/types'
import { defineAsyncComponent } from 'vue'

const MonacoDiff = defineAsyncComponent(
  () => import('@renderer/components/workspace/MonacoDiffEditor.vue')
)

const gitStore = useGitStore()
const layoutStore = useLayoutStore()
const panelContext = usePanelContextStore()

const scopeOptions: { value: GitDiffScope; label: string }[] = [
  { value: 'unstaged', label: '未暂存' },
  { value: 'staged', label: '已暂存' }
]

function onScopeChange(scope: GitDiffScope): void {
  layoutStore.reviewScope = scope as import('@renderer/stores/layout.store').ReviewScope
  gitStore.changedFiles = []
  gitStore.selectedFile = null
  void gitStore.loadChangedFiles(scope)
}

function onFileSelect(path: string): void {
  gitStore.selectFile(path)
  void gitStore.loadDiff(path, layoutStore.reviewScope === 'staged')
}

onMounted(() => {
  void gitStore.refreshStatus().then(() => {
    void gitStore.loadChangedFiles(layoutStore.reviewScope)
  })
})

watch(
  () => layoutStore.reviewScope,
  (scope) => {
    void gitStore.loadChangedFiles(scope)
  }
)

watch(
  () => gitStore.selectedFile,
  (file) => {
    if (file) {
      void gitStore.loadDiff(file, layoutStore.reviewScope === 'staged')
    }
  }
)

watch(
  () => panelContext.effectivePanelCwd,
  () => {
    gitStore.selectedFile = null
    void gitStore.refreshStatus().then(() => {
      void gitStore.loadChangedFiles(layoutStore.reviewScope)
    })
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

      <div class="dv-body">
        <div class="file-list">
          <div v-if="gitStore.changedFiles.length === 0 && !gitStore.loading" class="empty-msg">
            暂无变更
          </div>
          <button
            v-for="f in gitStore.changedFiles"
            :key="f.path"
            class="file-item"
            :class="{ active: gitStore.selectedFile === f.path }"
            @click="onFileSelect(f.path)"
          >
            <span class="file-name">{{ f.path.split('/').pop() }}</span>
            <span class="file-stat">
              <span class="add">+{{ f.additions }}</span>
              <span class="del">-{{ f.deletions }}</span>
            </span>
          </button>
        </div>

        <div class="diff-area">
          <div v-if="gitStore.diffLoading" class="empty-msg">加载中…</div>
          <div v-else-if="!gitStore.selectedFile" class="empty-msg">选择文件查看差异</div>
          <Suspense v-else>
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
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--sidebar-border);
  overflow-y: auto;
  padding: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-align: left;
}

.file-item:hover {
  background: var(--sidebar-item-hover);
}

.file-item.active {
  background: var(--sidebar-item-active);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-stat {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
}

.add { color: #16a34a; }
.del { color: #dc2626; }

.diff-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
