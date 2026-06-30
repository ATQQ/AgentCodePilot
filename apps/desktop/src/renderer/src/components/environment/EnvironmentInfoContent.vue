<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGitStore } from '@renderer/stores/git.store'
import { useLayoutStore, type ReviewScope } from '@renderer/stores/layout.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import OpenPathMenu from './OpenPathMenu.vue'

defineProps<{
  showTitle?: boolean
}>()

const { t } = useI18n()
const gitStore = useGitStore()
const layoutStore = useLayoutStore()
const panelContext = usePanelContextStore()

const branchCopied = ref(false)
let branchCopiedTimer: ReturnType<typeof setTimeout> | null = null

const changesSummary = computed(() => gitStore.getScopeSummary(layoutStore.changesScope))

const scopeOptions: { value: ReviewScope; label: string }[] = [
  { value: 'unstaged', label: '未暂存' },
  { value: 'staged', label: '已暂存' }
]

function handleChangesClick(): void {
  if (!gitStore.status?.isRepo) return
  layoutStore.openExtensionTab('review', { reviewScope: layoutStore.changesScope })
  layoutStore.envInfoVisible = false
}

function handleCommitClick(): void {
  if (!gitStore.status?.isRepo) return
  layoutStore.openReviewForCommit()
  layoutStore.envInfoVisible = false
}

function onScopeChange(scope: ReviewScope): void {
  layoutStore.setChangesScope(scope)
}

async function copyBranch(): Promise<void> {
  const branch = gitStore.status?.branch
  if (!branch) return
  await navigator.clipboard.writeText(branch)
  branchCopied.value = true
  if (branchCopiedTimer) clearTimeout(branchCopiedTimer)
  branchCopiedTimer = setTimeout(() => {
    branchCopied.value = false
  }, 1500)
}
</script>

<template>
  <div class="env-content">
    <div v-if="showTitle !== false" class="env-header">
      <span class="env-title">环境信息</span>
      <button class="icon-btn" title="设置" disabled>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
        </svg>
      </button>
    </div>

    <div v-if="!panelContext.effectivePanelCwd" class="env-empty">请先选择项目</div>

    <template v-else-if="gitStore.status">
      <div v-if="gitStore.status.isRepo" class="env-row env-changes-row">
        <span class="env-label">变更</span>
        <div class="env-changes-right">
          <div class="scope-toggle" @click.stop>
            <button
              v-for="opt in scopeOptions"
              :key="opt.value"
              type="button"
              class="scope-btn"
              :class="{ active: layoutStore.changesScope === opt.value }"
              @click="onScopeChange(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
          <button
            type="button"
            class="changes-stat-btn"
            title="在审查面板中查看"
            @click="handleChangesClick"
          >
            <span class="diff-stat">
              <span class="add">+{{ changesSummary.additions.toLocaleString() }}</span>
              <span class="del">-{{ changesSummary.deletions.toLocaleString() }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-else class="env-row">
        <span class="env-label">Git</span>
        <span class="env-value muted">不是 Git 仓库</span>
      </div>

      <div class="env-row env-row-local">
        <div class="env-local-main">
          <span class="env-label">本地</span>
          <span class="env-value muted env-folder-name" :title="panelContext.effectivePanelCwd">
            {{ panelContext.effectivePanelCwd.split('/').pop() || '本地' }}
          </span>
        </div>
        <OpenPathMenu :path="panelContext.effectivePanelCwd" />
      </div>

      <div v-if="gitStore.status.isRepo" class="env-row">
        <span class="env-label">分支</span>
        <span class="env-value env-branch-value">
          <span class="branch-name">{{ gitStore.status.branch || '—' }}</span>
          <button
            v-if="gitStore.status.branch"
            class="icon-btn copy-btn"
            type="button"
            :title="branchCopied ? t('env.copied') : t('env.copyBranch')"
            @click="copyBranch"
          >
            <svg
              v-if="!branchCopied"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect x="5" y="5" width="8" height="8" rx="1.5" />
              <path
                d="M5 10.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h5A1.5 1.5 0 0 1 10.5 4V5"
              />
            </svg>
            <svg
              v-else
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M4 8.5l2.5 2.5L12 5" />
            </svg>
          </button>
        </span>
      </div>

      <div v-if="gitStore.status.isRepo" class="env-row">
        <button class="action-btn action-btn--enabled" @click="handleCommitClick">
          提交或推送
        </button>
      </div>

      <div v-if="!gitStore.status.gitAvailable" class="env-hint muted">Git 不可用</div>
    </template>
  </div>
</template>

<style scoped>
.env-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.env-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.env-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: var(--font-size-sm);
  gap: 8px;
}

.env-row-local {
  align-items: flex-start;
}

.env-local-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.env-folder-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-row-clickable {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 6px 4px;
  text-align: left;
}

.env-row-clickable:hover {
  background: var(--sidebar-item-hover);
}

.env-label {
  color: var(--content-text-secondary);
}

.env-value {
  color: var(--content-text);
}

.env-branch-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.copy-btn {
  flex-shrink: 0;
}

.muted {
  color: var(--content-text-tertiary);
}

.diff-stat .add {
  color: #16a34a;
}

.diff-stat .del {
  color: #dc2626;
  margin-left: 4px;
}

.env-changes-row {
  flex-wrap: wrap;
}

.env-changes-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.scope-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  border: 1px solid var(--sidebar-border);
}

.scope-btn {
  padding: 2px 8px;
  border: none;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
}

.scope-btn:hover {
  color: var(--content-text);
}

.scope-btn.active {
  background: var(--sidebar-item-active);
  color: var(--content-text);
}

.changes-stat-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
}

.changes-stat-btn:hover {
  background: var(--sidebar-item-hover);
}

.action-btn {
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: not-allowed;
}

.action-btn--enabled {
  cursor: pointer;
  color: var(--content-text);
}

.action-btn--enabled:hover {
  background: var(--sidebar-item-hover);
}

.env-hint {
  font-size: var(--font-size-xs);
  margin-top: var(--spacing-xs);
}

.env-empty {
  padding: var(--spacing-sm) 0;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}
</style>
