<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import type { EditorSelectionInfo } from './MonacoEditor.vue'
import EditorSelectionBubble from './EditorSelectionBubble.vue'

const MonacoEditor = defineAsyncComponent(() => import('./MonacoEditor.vue'))

const props = defineProps<{
  value: string
  filePath: string
  readOnly?: boolean
  isDark: boolean
  languageOverride?: string
}>()

const emit = defineEmits<{
  'update:value': [v: string]
  'add-selection-to-chat': [startLine: number, endLine: number]
}>()

const editorRef = ref<InstanceType<typeof MonacoEditor> | null>(null)
const selection = ref<EditorSelectionInfo | null>(null)

function onSelectionChange(info: EditorSelectionInfo | null): void {
  selection.value = info
}

function addSelectionToChat(): void {
  if (!selection.value) return
  emit('add-selection-to-chat', selection.value.startLine, selection.value.endLine)
  editorRef.value?.clearSelection()
  selection.value = null
}

function handleKeydown(e: KeyboardEvent): void {
  if (!selection.value) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
    e.preventDefault()
    e.stopPropagation()
    addSelectionToChat()
  }
}

function handleDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  if (target?.closest('.editor-selection-bubble')) return
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
  document.addEventListener('mousedown', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, true)
  document.removeEventListener('mousedown', handleDocumentClick)
})
</script>

<template>
  <div class="file-code-block-preview">
    <MonacoEditor
      ref="editorRef"
      :value="value"
      :file-path="filePath"
      :read-only="readOnly"
      :language-override="languageOverride"
      @update:value="$emit('update:value', $event)"
      @selection-change="onSelectionChange"
    />
    <EditorSelectionBubble
      :visible="!!selection"
      :x="selection?.bubbleX ?? 0"
      :y="selection?.bubbleY ?? 0"
      @add-to-chat="addSelectionToChat"
    />
  </div>
</template>

<style scoped>
.file-code-block-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  width: 100%;
  position: relative;
}
</style>
