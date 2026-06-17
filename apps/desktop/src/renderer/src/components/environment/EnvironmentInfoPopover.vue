<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGitStore } from '@renderer/stores/git.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { useAgentStore } from '@renderer/stores/agent.store'

const gitStore = useGitStore()
const layoutStore = useLayoutStore()
const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()

const popoverRef = ref<HTMLElement | null>(null)

function handleChangesClick(): void {
  layoutStore.openReviewFromChanges()
  layoutStore.envInfoVisible = false
}

function onClickOutside(e: MouseEvent): void {
  if (!layoutStore.envInfoVisible) return
  const target = e.target as Node
  if (popoverRef.value && !popoverRef.value.contains(target)) {
    const trigger = (target as HTMLElement).closest?.('[data-env-trigger]')
    if (!trigger) layoutStore.envInfoVisible = false
  }
}

onMounted(() => {
  gitStore.startPolling()
  document.addEventListener('mousedown', onClickOutside)
})

onUnmounted(() => {
  gitStore.stopPolling()
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="layoutStore.envInfoVisible" ref="popoverRef" class="env-popover">
      <div class="env-header">
        <span class="env-title">环境信息</span>
        <button class="icon-btn" title="设置" disabled>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
          </svg>
        </button>
      </div>

      <div v-if="!workspaceStore.currentCwd" class="env-empty">请先选择项目</div>

      <template v-else-if="gitStore.status">
        <button class="env-row env-row-clickable" @click="handleChangesClick">
          <span class="env-label">变更</span>
          <span class="env-value">
            <span v-if="gitStore.status.isRepo" class="diff-stat">
              <span class="add">+{{ gitStore.status.additions.toLocaleString() }}</span>
              <span class="del">-{{ gitStore.status.deletions.toLocaleString() }}</span>
            </span>
            <span v-else class="muted">{{ gitStore.status.error || '无 Git 信息' }}</span>
          </span>
        </button>

        <div class="env-row">
          <span class="env-label">本地</span>
          <span class="env-value muted">{{ workspaceStore.currentProject?.name || workspaceStore.currentWorkspace?.name || '本地' }}</span>
        </div>

        <div class="env-row">
          <span class="env-label">分支</span>
          <span class="env-value">{{ gitStore.status.branch || '—' }}</span>
        </div>

        <div class="env-row">
          <button class="action-btn" disabled title="即将支持">提交或推送</button>
        </div>

        <div v-if="!gitStore.status.gitAvailable" class="env-hint muted">Git 不可用</div>
      </template>

      <div class="env-divider" />

      <div class="env-section-title">子智能体</div>
      <div class="agent-list">
        <div v-for="agent in agentStore.agents.slice(0, 3)" :key="agent.id" class="agent-item">
          <span class="agent-dot" :class="agent.id" />
          <span>{{ agent.name }}</span>
        </div>
      </div>

      <div class="env-divider" />

      <div class="env-section-title">来源</div>
      <div class="env-empty small">暂无来源</div>
    </div>
  </Teleport>
</template>

<style scoped>
.env-popover {
  position: fixed;
  top: calc(var(--topbar-height) + 4px);
  right: 12px;
  width: 280px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 3000;
  padding: var(--spacing-md);
  -webkit-app-region: no-drag;
}

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
  border: none;
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
}

.env-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: var(--font-size-sm);
}

.env-row-clickable {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  margin: 0 -8px;
}

.env-row-clickable:hover {
  background: var(--sidebar-item-hover);
}

.env-label {
  color: var(--content-text-secondary);
}

.add {
  color: #16a34a;
  margin-right: 4px;
}

.del {
  color: #dc2626;
}

.muted {
  color: var(--content-text-tertiary);
}

.env-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: var(--spacing-sm) 0;
}

.env-section-title {
  font-size: var(--font-size-xs);
  color: var(--sidebar-section-title);
  margin-bottom: var(--spacing-xs);
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
}

.agent-dot {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: #6366f1;
}

.agent-dot.claude-code { background: #d97706; }
.agent-dot.codex { background: #2563eb; }
.agent-dot.cursor { background: #7c3aed; }

.env-empty {
  font-size: var(--font-size-sm);
  color: var(--content-text-tertiary);
  padding: 8px 0;
}

.env-empty.small {
  padding: 4px 0;
}

.action-btn {
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: not-allowed;
}

.env-hint {
  font-size: var(--font-size-xs);
  margin-top: 4px;
}
</style>
