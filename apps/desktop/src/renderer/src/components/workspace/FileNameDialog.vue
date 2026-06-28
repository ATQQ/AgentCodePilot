<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export type FileNameDialogMode = 'newFile' | 'newFolder' | 'rename'

const props = defineProps<{
  visible: boolean
  mode: FileNameDialogMode
  initialName?: string
}>()

const emit = defineEmits<{
  confirm: [name: string]
  cancel: []
}>()

const { t } = useI18n()
const name = ref('')
const error = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const title = computed(() => {
  if (props.mode === 'newFile') return t('workspace.fileTree.contextMenu.newFileTitle')
  if (props.mode === 'newFolder') return t('workspace.fileTree.contextMenu.newFolderTitle')
  return t('workspace.fileTree.contextMenu.renameTitle')
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      name.value = ''
      error.value = ''
      return
    }
    name.value = props.initialName ?? ''
    error.value = ''
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
)

function validate(): boolean {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = t('workspace.fileTree.contextMenu.emptyName')
    return false
  }
  if (/[/\\]/.test(trimmed)) {
    error.value = t('workspace.fileTree.contextMenu.invalidName')
    return false
  }
  error.value = ''
  return true
}

function handleConfirm(): void {
  if (!validate()) return
  emit('confirm', name.value.trim())
}

function handleCancel(): void {
  emit('cancel')
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') handleConfirm()
  else if (e.key === 'Escape') handleCancel()
}

function setError(message: string): void {
  error.value = message
}

defineExpose({ setError })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="file-name-dialog-overlay" @click.self="handleCancel">
        <div class="file-name-dialog" role="dialog" @click.stop>
          <h3 class="dialog-title">{{ title }}</h3>
          <input
            ref="inputRef"
            v-model="name"
            class="dialog-input"
            :placeholder="t('workspace.fileTree.contextMenu.namePlaceholder')"
            @keydown="handleKeydown"
          />
          <p v-if="error" class="dialog-error">{{ error }}</p>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="handleCancel">{{ t('common.cancel') }}</button>
            <button class="dialog-btn primary" @click="handleConfirm">
              {{ t('common.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.file-name-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--content-bg) 30%, transparent);
}

.file-name-dialog {
  width: min(360px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
}

.dialog-title {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.dialog-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: var(--composer-border-focus);
}

.dialog-error {
  margin: 8px 0 0;
  font-size: var(--font-size-xs);
  color: #e53e3e;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
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
