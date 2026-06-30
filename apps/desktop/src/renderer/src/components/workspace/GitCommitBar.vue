<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useGitStore } from '@renderer/stores/git.store'
import { useAiUtility } from '@renderer/composables/useAiUtility'
import GitOperationLogDialog from './GitOperationLogDialog.vue'

const gitStore = useGitStore()
const { running, error: aiError, generateCommitMessage } = useAiUtility()
const { t } = useI18n()

const showMenu = ref(false)
const logDialogVisible = ref(false)
const committing = ref(false)
const msgInputRef = ref<HTMLTextAreaElement | null>(null)
const MSG_INPUT_MIN_HEIGHT = 28
const MSG_INPUT_MAX_HEIGHT = 160

const branchName = computed(() => gitStore.status?.branch || '当前分支')
const stagedFileCount = computed(() => gitStore.changedFilesByScope.staged.length)
const canCommit = computed(
  () => stagedFileCount.value > 0 && gitStore.commitMessage.trim().length > 0
)
const placeholder = computed(() => `消息 (⌘↵ 在「${branchName.value}」提交)`)

const activeErrorSummary = computed(() => gitStore.operationError || aiError.value)
const activeErrorLog = computed(
  () => gitStore.operationErrorLog || aiError.value || activeErrorSummary.value || ''
)
const errorDialogTitle = computed(() => t('review.operationErrorTitle'))
const canViewErrorLog = computed(() => activeErrorLog.value.length > 0)

function adjustMsgInputHeight(): void {
  const el = msgInputRef.value
  if (!el) return
  el.style.height = `${MSG_INPUT_MIN_HEIGHT}px`
  const nextHeight = Math.min(Math.max(el.scrollHeight, MSG_INPUT_MIN_HEIGHT), MSG_INPUT_MAX_HEIGHT)
  el.style.height = `${nextHeight}px`
  el.style.overflowY = el.scrollHeight > MSG_INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
}

watch(
  () => gitStore.commitMessage,
  () => {
    void nextTick(adjustMsgInputHeight)
  }
)

onMounted(() => {
  adjustMsgInputHeight()
})

async function onGenerate(): Promise<void> {
  const msg = await generateCommitMessage()
  if (msg) gitStore.commitMessage = msg
}

async function onCommit(): Promise<void> {
  if (!canCommit.value || committing.value) return
  committing.value = true
  try {
    await gitStore.commit()
  } finally {
    committing.value = false
  }
}

async function onCommitAndPush(): Promise<void> {
  if (!canCommit.value || committing.value) return
  showMenu.value = false
  committing.value = true
  try {
    const ok = await gitStore.commit()
    if (ok) await gitStore.push()
  } finally {
    committing.value = false
  }
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    if (committing.value) return
    void onCommit()
  }
}

function onClickOutside(): void {
  showMenu.value = false
}

function openErrorLogDialog(): void {
  if (!canViewErrorLog.value) return
  logDialogVisible.value = true
}

async function copyActiveError(): Promise<void> {
  if (!activeErrorLog.value) return
  try {
    await navigator.clipboard.writeText(activeErrorLog.value)
    ElMessage.success(t('review.errorCopied'))
  } catch {
    ElMessage.warning(t('review.errorCopyManual'))
  }
}
</script>

<template>
  <div class="commit-bar">
    <div class="msg-row">
      <textarea
        ref="msgInputRef"
        v-model="gitStore.commitMessage"
        class="msg-input"
        rows="1"
        :placeholder="placeholder"
        @keydown="onKeydown"
        @input="adjustMsgInputHeight"
      />
      <button
        class="gen-btn"
        type="button"
        title="AI 生成提交消息（需有已暂存变更，使用当前对话 Agent）"
        :disabled="running"
        @click="onGenerate"
      >
        <svg
          v-if="!running"
          class="gen-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M8 1.5l1 3.5 3.5 1-3.5 1-1 3.5-1-3.5-3.5-1 3.5-1 1-3.5z" />
          <path d="M3 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" />
        </svg>
        <span v-else class="gen-loading">…</span>
      </button>
    </div>

    <div v-if="activeErrorSummary" class="error-panel">
      <p class="error-summary" :title="activeErrorSummary">{{ activeErrorSummary }}</p>
      <div class="error-actions">
        <button type="button" class="error-action-btn" @click="copyActiveError">
          {{ t('review.copyErrorLog') }}
        </button>
        <button
          v-if="canViewErrorLog"
          type="button"
          class="error-action-btn"
          @click="openErrorLogDialog"
        >
          {{ t('review.viewErrorLog') }}
        </button>
      </div>
    </div>

    <GitOperationLogDialog
      :visible="logDialogVisible"
      :title="errorDialogTitle"
      :log="activeErrorLog"
      @close="logDialogVisible = false"
    />

    <div class="action-row">
      <div class="commit-split">
        <button
          class="commit-btn"
          type="button"
          :class="{ loading: committing }"
          :disabled="!canCommit || committing"
          @click="onCommit"
        >
          <span v-if="committing" class="commit-spinner" aria-hidden="true" />
          {{ committing ? t('review.committing') : '✓ 提交' }}
        </button>
        <button
          class="commit-menu-btn"
          type="button"
          :disabled="!canCommit || committing"
          title="更多提交选项"
          @click.stop="showMenu = !showMenu"
        >
          ▾
        </button>
        <div v-if="showMenu" class="commit-menu" @mouseleave="onClickOutside">
          <button type="button" class="menu-item" @click="onCommitAndPush">提交并推送</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.commit-bar {
  padding: 8px;
  padding-right: 88px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.msg-row {
  display: flex;
  gap: 4px;
  align-items: flex-start;
}

.msg-input {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  max-height: 160px;
  padding: 6px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  font-family: inherit;
  resize: none;
  overflow-y: hidden;
  outline: none;
  box-sizing: border-box;
}

.msg-input:focus {
  border-color: var(--composer-border-focus);
}

.gen-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text-secondary);
  cursor: pointer;
  position: relative;
  z-index: 32;
}

.gen-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.gen-icon {
  flex-shrink: 0;
}

.gen-loading {
  font-size: 12px;
  line-height: 1;
}

.gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, #dc2626 35%, var(--sidebar-border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, #dc2626 6%, var(--sidebar-bg));
}

.error-summary {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.45;
  color: #dc2626;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  word-break: break-word;
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.error-action-btn {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, #dc2626 25%, var(--sidebar-border));
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: 11px;
  cursor: pointer;
}

.error-action-btn:hover {
  background: var(--sidebar-item-hover);
}

.action-row {
  display: flex;
}

.commit-split {
  position: relative;
  display: flex;
  width: 100%;
}

.commit-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.commit-btn.loading {
  cursor: wait;
}

.commit-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid color-mix(in srgb, #fff 35%, transparent);
  border-top-color: #fff;
  border-radius: 50%;
  animation: commit-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes commit-spin {
  to {
    transform: rotate(360deg);
  }
}

.commit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.commit-menu-btn {
  width: 28px;
  border: none;
  border-left: 1px solid color-mix(in srgb, #fff 20%, var(--accent-color));
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
}

.commit-menu-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.commit-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 140px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 10;
  padding: 4px;
}

.menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--sidebar-item-hover);
}
</style>
