<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGitStore } from '@renderer/stores/git.store'
import { useAiUtility } from '@renderer/composables/useAiUtility'

const gitStore = useGitStore()
const { running, error: aiError, generateCommitMessage } = useAiUtility()

const showMenu = ref(false)

const branchName = computed(() => gitStore.status?.branch || '当前分支')
const canCommit = computed(
  () => gitStore.changedFiles.length > 0 && gitStore.commitMessage.trim().length > 0
)
const placeholder = computed(() => `消息 (⌘↵ 在「${branchName.value}」提交)`)

async function onGenerate(): Promise<void> {
  const msg = await generateCommitMessage()
  if (msg) gitStore.commitMessage = msg
}

async function onCommit(): Promise<void> {
  if (!canCommit.value) return
  await gitStore.commit()
}

async function onCommitAndPush(): Promise<void> {
  if (!canCommit.value) return
  showMenu.value = false
  const ok = await gitStore.commit()
  if (ok) await gitStore.push()
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    void onCommit()
  }
}

function onClickOutside(): void {
  showMenu.value = false
}
</script>

<template>
  <div class="commit-bar">
    <div class="msg-row">
      <input
        v-model="gitStore.commitMessage"
        class="msg-input"
        :placeholder="placeholder"
        @keydown="onKeydown"
      />
      <button
        class="gen-btn"
        type="button"
        title="AI 生成提交消息"
        :disabled="running"
        @click="onGenerate"
      >
        {{ running ? '…' : '✨' }}
      </button>
    </div>

    <div v-if="gitStore.operationError || aiError" class="error-msg">
      {{ gitStore.operationError || aiError }}
    </div>

    <div class="action-row">
      <div class="commit-split">
        <button class="commit-btn" type="button" :disabled="!canCommit" @click="onCommit">
          ✓ 提交
        </button>
        <button
          class="commit-menu-btn"
          type="button"
          :disabled="!canCommit"
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
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.msg-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.msg-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  outline: none;
}

.msg-input:focus {
  border-color: var(--composer-border-focus);
}

.gen-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-msg {
  font-size: var(--font-size-xs);
  color: #dc2626;
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
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  font-size: var(--font-size-sm);
  cursor: pointer;
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
