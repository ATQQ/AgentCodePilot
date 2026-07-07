<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  visible: boolean
  title: string
  log: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const logRef = ref<HTMLTextAreaElement | null>(null)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    requestAnimationFrame(() => {
      logRef.value?.focus()
      logRef.value?.setSelectionRange(0, 0)
    })
  }
)

async function copyLog(): Promise<void> {
  if (!props.log) return
  try {
    await navigator.clipboard.writeText(props.log)
    ElMessage.success(t('review.errorCopied'))
  } catch {
    logRef.value?.focus()
    logRef.value?.select()
    ElMessage.warning(t('review.errorCopyManual'))
  }
}

function handleClose(): void {
  emit('close')
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') handleClose()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="git-log-dialog-overlay"
        role="presentation"
        @click.self="handleClose"
      >
        <div
          class="git-log-dialog"
          role="dialog"
          aria-modal="true"
          @click.stop
          @keydown="handleKeydown"
        >
          <div class="dialog-header">
            <h3 class="dialog-title">{{ title }}</h3>
            <button
              type="button"
              class="dialog-close"
              :title="t('common.close')"
              @click="handleClose"
            >
              ×
            </button>
          </div>
          <textarea
            ref="logRef"
            class="dialog-log elegant-scroll"
            readonly
            :value="log"
            spellcheck="false"
          />
          <div class="dialog-actions">
            <button type="button" class="dialog-btn" @click="handleClose">
              {{ t('common.close') }}
            </button>
            <button type="button" class="dialog-btn primary" @click="copyLog">
              {{ t('review.copyErrorLog') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.git-log-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--content-bg) 35%, transparent);
}

.git-log-dialog {
  width: min(720px, calc(100vw - 32px));
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.dialog-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.dialog-log {
  flex: 1;
  min-height: 240px;
  max-height: min(60vh, 520px);
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  white-space: pre;
  overflow: auto;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.dialog-btn {
  padding: 6px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.dialog-btn:hover {
  background: var(--btn-ghost-hover);
}

.dialog-btn.primary {
  border-color: transparent;
  background: var(--btn-primary-bg, var(--sidebar-item-active));
  color: var(--btn-primary-text, var(--sidebar-text-active));
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
