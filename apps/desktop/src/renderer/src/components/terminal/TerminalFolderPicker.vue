<script setup lang="ts">
import { useWorkspaceStore } from '@renderer/stores/workspace.store'

const props = defineProps<{
  folders: string[]
}>()

const emit = defineEmits<{
  select: [path: string]
  cancel: []
}>()

const workspaceStore = useWorkspaceStore()

function folderLabel(path: string): string {
  const project = workspaceStore.projects.find((p) => p.path === path)
  if (project) return project.name
  return path.split('/').pop() || path
}

async function pickOther(): Promise<void> {
  const path = await window.agentAPI.dialog.selectFolder()
  if (path) emit('select', path)
}
</script>

<template>
  <div class="folder-picker-overlay" @click.self="emit('cancel')">
    <div class="folder-picker">
      <div class="picker-header">选择终端目录</div>
      <div class="folder-list">
        <button
          v-for="folder in folders"
          :key="folder"
          class="folder-item"
          @click="emit('select', folder)"
        >
          <span class="folder-name">{{ folderLabel(folder) }}</span>
          <span class="folder-path">{{ folder }}</span>
        </button>
      </div>
      <button class="other-btn" @click="pickOther">其他目录…</button>
      <button class="cancel-btn" @click="emit('cancel')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.folder-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.folder-picker {
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  padding: 16px;
  min-width: 320px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.picker-header {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
  margin-bottom: 12px;
}

.folder-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.folder-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.folder-item:hover {
  background: var(--sidebar-item-hover);
}

.folder-name {
  font-size: var(--font-size-sm);
  color: var(--content-text);
  font-weight: 500;
}

.folder-path {
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.other-btn,
.cancel-btn {
  margin-top: 8px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.other-btn {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.other-btn:hover {
  background: var(--sidebar-item-active);
}

.cancel-btn {
  background: transparent;
  color: var(--content-text-tertiary);
}

.cancel-btn:hover {
  color: var(--content-text);
}
</style>
