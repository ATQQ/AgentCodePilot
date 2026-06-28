<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileEntry } from '@renderer/types'
import { useFileExplorerStore } from '@renderer/stores/fileExplorer.store'

const emit = defineEmits<{
  addToChat: [entry: FileEntry]
  copy: [entry: FileEntry]
  cut: [entry: FileEntry]
  paste: [targetDir: string]
  newFile: [targetDir: string]
  newFolder: [targetDir: string]
  copyAbsolutePath: [entry: FileEntry]
  copyRelativePath: [entry: FileEntry]
  rename: [entry: FileEntry]
  delete: [entry: FileEntry]
}>()

const { t } = useI18n()
const fileStore = useFileExplorerStore()
const menuRef = ref<HTMLElement | null>(null)

const state = reactive({
  visible: false,
  x: 0,
  y: 0,
  entry: null as FileEntry | null,
  targetDir: ''
})

const hasClipboard = computed(() => fileStore.fileClipboard !== null)

const canPaste = computed(() => {
  if (!hasClipboard.value) return false
  return fileStore.canPasteIntoDir(state.targetDir)
})

function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number
): { x: number; y: number } {
  const padding = 8
  const maxX = window.innerWidth - menuWidth - padding
  const maxY = window.innerHeight - menuHeight - padding
  return {
    x: Math.min(Math.max(padding, x), Math.max(padding, maxX)),
    y: Math.min(Math.max(padding, y), Math.max(padding, maxY))
  }
}

async function open(x: number, y: number, entry: FileEntry | null, targetDir: string): Promise<void> {
  state.visible = true
  state.x = x
  state.y = y
  state.entry = entry
  state.targetDir = targetDir
  await nextTick()
  const menu = menuRef.value
  const pos = clampMenuPosition(state.x, state.y, menu?.offsetWidth ?? 200, menu?.offsetHeight ?? 320)
  state.x = pos.x
  state.y = pos.y
}

function close(): void {
  state.visible = false
  state.entry = null
  state.targetDir = ''
}

function onAction(action: () => void): void {
  action()
  close()
}

function onDocumentClick(): void {
  if (state.visible) close()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.visible) close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="state.visible"
        ref="menuRef"
        class="context-menu"
        :style="{ left: `${state.x}px`, top: `${state.y}px` }"
        @click.stop
      >
        <template v-if="state.entry">
          <button
            v-if="!state.entry.isDirectory"
            class="ctx-item"
            @click="onAction(() => emit('addToChat', state.entry!))"
          >
            {{ t('workspace.fileTree.contextMenu.addToChat') }}
          </button>
          <div v-if="!state.entry.isDirectory" class="ctx-divider" />

          <button class="ctx-item" @click="onAction(() => emit('copy', state.entry!))">
            {{ t('workspace.fileTree.contextMenu.copy') }}
          </button>
          <button class="ctx-item" @click="onAction(() => emit('cut', state.entry!))">
            {{ t('workspace.fileTree.contextMenu.cut') }}
          </button>
          <button
            v-if="hasClipboard"
            class="ctx-item"
            :disabled="!canPaste"
            @click="onAction(() => emit('paste', state.targetDir))"
          >
            {{ t('workspace.fileTree.contextMenu.paste') }}
          </button>

          <div class="ctx-divider" />

          <button class="ctx-item" @click="onAction(() => emit('newFile', state.targetDir))">
            {{ t('workspace.fileTree.contextMenu.newFile') }}
          </button>
          <button class="ctx-item" @click="onAction(() => emit('newFolder', state.targetDir))">
            {{ t('workspace.fileTree.contextMenu.newFolder') }}
          </button>

          <div class="ctx-divider" />

          <button
            class="ctx-item"
            @click="onAction(() => emit('copyAbsolutePath', state.entry!))"
          >
            {{ t('workspace.fileTree.contextMenu.copyAbsolutePath') }}
          </button>
          <button
            class="ctx-item"
            @click="onAction(() => emit('copyRelativePath', state.entry!))"
          >
            {{ t('workspace.fileTree.contextMenu.copyRelativePath') }}
          </button>

          <div class="ctx-divider" />

          <button class="ctx-item" @click="onAction(() => emit('rename', state.entry!))">
            {{ t('workspace.fileTree.contextMenu.rename') }}
          </button>
          <button
            class="ctx-item ctx-item--danger"
            @click="onAction(() => emit('delete', state.entry!))"
          >
            {{ t('workspace.fileTree.contextMenu.delete') }}
          </button>
        </template>

        <template v-else>
          <button
            v-if="hasClipboard"
            class="ctx-item"
            :disabled="!canPaste"
            @click="onAction(() => emit('paste', state.targetDir))"
          >
            {{ t('workspace.fileTree.contextMenu.paste') }}
          </button>
          <div v-if="hasClipboard" class="ctx-divider" />
          <button class="ctx-item" @click="onAction(() => emit('newFile', state.targetDir))">
            {{ t('workspace.fileTree.contextMenu.newFile') }}
          </button>
          <button class="ctx-item" @click="onAction(() => emit('newFolder', state.targetDir))">
            {{ t('workspace.fileTree.contextMenu.newFolder') }}
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  min-width: 180px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs);
  z-index: 9999;
}

.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.ctx-item:hover:not(:disabled) {
  background: var(--btn-ghost-hover);
}

.ctx-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctx-item--danger {
  color: #e53e3e;
}

.ctx-item--danger:hover {
  background: rgba(229, 62, 62, 0.08);
}

.ctx-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: var(--spacing-xs) 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
