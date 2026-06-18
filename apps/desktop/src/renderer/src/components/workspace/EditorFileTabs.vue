<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

const props = defineProps<{
  tabs: string[]
  active: string | null
}>()

const emit = defineEmits<{
  select: [path: string]
  close: [path: string]
  'close-others': [path: string]
  'close-all': []
}>()

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  path: null as string | null
})

const menuRef = ref<HTMLElement | null>(null)

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

function clampMenuPosition(x: number, y: number, menuWidth: number, menuHeight: number) {
  const padding = 8
  const maxX = window.innerWidth - menuWidth - padding
  const maxY = window.innerHeight - menuHeight - padding
  return {
    x: Math.min(Math.max(padding, x), Math.max(padding, maxX)),
    y: Math.min(Math.max(padding, y), Math.max(padding, maxY))
  }
}

async function openContextMenu(e: MouseEvent, path: string): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.visible = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.path = path
  await nextTick()
  const menu = menuRef.value
  const pos = clampMenuPosition(
    contextMenu.x,
    contextMenu.y,
    menu?.offsetWidth ?? 180,
    menu?.offsetHeight ?? 120
  )
  contextMenu.x = pos.x
  contextMenu.y = pos.y
}

function closeContextMenu(): void {
  contextMenu.visible = false
  contextMenu.path = null
}

function handleClose(): void {
  if (contextMenu.path) emit('close', contextMenu.path)
  closeContextMenu()
}

function handleCloseOthers(): void {
  if (contextMenu.path) emit('close-others', contextMenu.path)
  closeContextMenu()
}

function handleCloseAll(): void {
  emit('close-all')
  closeContextMenu()
}

function onDocumentClick(): void {
  if (contextMenu.visible) closeContextMenu()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div v-if="tabs.length > 0" class="editor-file-tabs elegant-scroll">
    <button
      v-for="path in tabs"
      :key="path"
      class="tab-item"
      :class="{ active: active === path }"
      :title="path"
      @click="emit('select', path)"
      @contextmenu="openContextMenu($event, path)"
    >
      <span class="tab-label">{{ fileName(path) }}</span>
      <span
        class="tab-close"
        title="关闭"
        @click.stop="emit('close', path)"
      >×</span>
    </button>

    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="tab-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button class="ctx-item" @click="handleClose">
        <span>关闭</span>
        <span class="ctx-shortcut">⌘ W</span>
      </button>
      <button
        class="ctx-item"
        :disabled="tabs.length <= 1"
        @click="handleCloseOthers"
      >
        <span>关闭其它</span>
        <span class="ctx-shortcut">⌥ ⌘ T</span>
      </button>
      <button class="ctx-item" @click="handleCloseAll">
        <span>全部关闭</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-file-tabs {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  border-bottom: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  min-height: 32px;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 0 10px;
  border: none;
  border-right: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  flex-shrink: 0;
}

.tab-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.tab-item.active {
  background: var(--content-bg);
  color: var(--sidebar-text-active);
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1;
  color: var(--content-text-tertiary);
  flex-shrink: 0;
}

.tab-close:hover {
  background: var(--sidebar-item-active);
  color: var(--content-text);
}

.tab-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-align: left;
}

.ctx-item:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
}

.ctx-item:disabled {
  color: var(--content-text-tertiary);
  cursor: default;
}

.ctx-shortcut {
  color: var(--content-text-tertiary);
  font-size: 11px;
}
</style>
