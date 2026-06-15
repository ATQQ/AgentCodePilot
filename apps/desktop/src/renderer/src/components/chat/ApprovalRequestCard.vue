<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApprovalRequest } from '@renderer/types'
import { getToolLabel } from '@renderer/utils/toolCall'

const props = defineProps<{
  request: ApprovalRequest
}>()

const emit = defineEmits<{
  respond: [allowed: boolean, scope: 'once' | 'conversation']
}>()

const { t } = useI18n()
const scope = ref<'once' | 'conversation'>('conversation')
const showScopeMenu = ref(false)

function handleAllow(): void {
  emit('respond', true, scope.value)
}

function handleDeny(): void {
  emit('respond', false, scope.value)
}

function selectScope(value: 'once' | 'conversation'): void {
  scope.value = value
  showScopeMenu.value = false
}

function truncatePath(path: string, max = 48): string {
  if (path.length <= max) return path
  const home = path.replace(/^\/Users\/[^/]+/, '~')
  if (home.length <= max) return home
  return '…' + home.slice(-max + 1)
}
</script>

<template>
  <div class="approval-card" :class="{ resolved: request.status !== 'pending' }">
    <div class="approval-header">
      <span class="approval-shield">🛡</span>
      <span class="approval-title">{{ request.title }}</span>
    </div>

    <div class="approval-body">
      <div class="approval-field">
        <div class="field-label">{{ t('approval.operation') }}</div>
        <div class="field-value">{{ getToolLabel(request.toolName) }}</div>
      </div>
      <div v-if="request.detail" class="approval-field">
        <div class="field-label">{{ t('approval.path') }}</div>
        <div class="field-value mono">{{ truncatePath(request.detail) }}</div>
      </div>
      <div class="approval-field">
        <div class="field-label">{{ t('approval.description') }}</div>
        <div class="field-desc">{{ request.description || t('approval.defaultDescription') }}</div>
      </div>
    </div>

    <div v-if="request.status === 'pending'" class="approval-actions">
      <div class="scope-wrapper">
        <button class="scope-btn" type="button" @click="showScopeMenu = !showScopeMenu">
          <span>{{ scope === 'conversation' ? t('approval.scopeConversation') : t('approval.scopeOnce') }}</span>
          <span class="chevron">▾</span>
        </button>
        <div v-if="showScopeMenu" class="scope-menu">
          <button
            class="scope-item"
            :class="{ active: scope === 'conversation' }"
            @click="selectScope('conversation')"
          >
            {{ t('approval.scopeConversation') }}
          </button>
          <button
            class="scope-item"
            :class="{ active: scope === 'once' }"
            @click="selectScope('once')"
          >
            {{ t('approval.scopeOnce') }}
          </button>
        </div>
      </div>
      <div class="action-buttons">
        <button class="btn-deny" type="button" @click="handleDeny">{{ t('approval.deny') }}</button>
        <button class="btn-allow" type="button" @click="handleAllow">{{ t('approval.allow') }}</button>
      </div>
    </div>

    <div v-else class="approval-resolved">
      {{ request.status === 'allowed' ? t('approval.allowed') : t('approval.denied') }}
    </div>
  </div>
</template>

<style scoped>
.approval-card {
  margin: 8px 0 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  overflow: hidden;
}

.approval-card.resolved {
  opacity: 0.75;
}

.approval-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
}

.approval-shield {
  font-size: 14px;
}

.approval-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.approval-body {
  padding: 0 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.approval-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  color: var(--content-text-tertiary);
}

.field-value {
  font-size: var(--font-size-sm);
  color: var(--content-text);
}

.field-value.mono {
  font-family: var(--font-mono, monospace);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  word-break: break-all;
}

.field-desc {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  line-height: 1.5;
}

.approval-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--sidebar-border);
}

.scope-wrapper {
  position: relative;
}

.scope-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.scope-btn:hover {
  background: var(--sidebar-item-hover);
}

.chevron {
  font-size: 10px;
  opacity: 0.6;
}

.scope-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 140px;
  padding: 4px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
  z-index: 20;
}

.scope-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
}

.scope-item:hover,
.scope-item.active {
  background: var(--sidebar-item-hover);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-deny,
.btn-allow {
  padding: 6px 16px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn-deny {
  border: 1px solid var(--sidebar-border);
  background: var(--content-bg);
  color: var(--content-text);
}

.btn-deny:hover {
  background: var(--sidebar-item-hover);
}

.btn-allow {
  border: none;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}

.btn-allow:hover {
  opacity: 0.9;
}

.approval-resolved {
  padding: 10px 14px 12px;
  border-top: 1px solid var(--sidebar-border);
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}
</style>
