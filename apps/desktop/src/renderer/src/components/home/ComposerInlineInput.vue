<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import type { FileReference } from '@renderer/types'
import {
  formatFileReferenceLabel,
  formatFileReferenceTooltip,
  serializeEditorContent
} from '@renderer/utils/fileReference'

const props = defineProps<{
  placeholder?: string
}>()

const emit = defineEmits<{
  submit: []
  planTrigger: []
  input: []
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const isEmpty = ref(true)
const tooltip = ref<{ text: string; x: number; y: number } | null>(null)

const MAX_HEIGHT = 200

function getEditor(): HTMLDivElement | null {
  return editorRef.value
}

function syncEmptyState(): void {
  const editor = getEditor()
  if (!editor) return
  isEmpty.value = !serializeEditorContent(editor)
}

function resizeEditor(): void {
  const editor = getEditor()
  if (!editor) return
  editor.style.height = 'auto'
  const nextHeight = Math.min(editor.scrollHeight, MAX_HEIGHT)
  editor.style.height = `${nextHeight}px`
  editor.style.overflowY = editor.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
}

function isEditorFocused(): boolean {
  const editor = getEditor()
  return !!editor && document.activeElement === editor
}

function getInsertRange(): Range {
  const editor = getEditor()
  if (!editor) throw new Error('Editor not mounted')

  const selection = window.getSelection()

  if (isEditorFocused() && selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      return range
    }
  }

  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  return range
}

function createFileRefChip(ref: FileReference): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.className = 'inline-file-ref'
  chip.contentEditable = 'false'
  chip.dataset.path = ref.path
  if (ref.startLine !== undefined) chip.dataset.startLine = String(ref.startLine)
  if (ref.endLine !== undefined) chip.dataset.endLine = String(ref.endLine)

  const at = document.createElement('span')
  at.className = 'inline-file-ref-at'
  at.textContent = '@'

  const label = document.createElement('span')
  label.className = 'inline-file-ref-label'
  label.textContent = formatFileReferenceLabel(ref)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'inline-file-ref-remove'
  removeBtn.tabIndex = -1
  removeBtn.textContent = '×'
  removeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    chip.remove()
    syncEmptyState()
    resizeEditor()
    emit('input')
    editorRef.value?.focus()
  })

  chip.append(at, label, removeBtn)
  return chip
}

function insertNodesAtSelection(nodes: Node[]): void {
  const editor = getEditor()
  if (!editor) return

  const range = getInsertRange()
  range.deleteContents()

  const fragment = document.createDocumentFragment()
  for (const node of nodes) fragment.appendChild(node)

  const lastNode = nodes[nodes.length - 1]
  range.insertNode(fragment)

  const selection = window.getSelection()
  if (!selection || !lastNode) return

  const after = document.createRange()
  after.setStartAfter(lastNode)
  after.collapse(true)

  editor.focus()
  selection.removeAllRanges()
  selection.addRange(after)
}

function insertFileRef(ref: FileReference): void {
  const chip = createFileRefChip(ref)
  const trailingSpace = document.createTextNode(' ')
  insertNodesAtSelection([chip, trailingSpace])
  syncEmptyState()
  resizeEditor()
  emit('input')
}

function insertText(text: string): void {
  if (!text) return
  insertNodesAtSelection([document.createTextNode(text)])
  syncEmptyState()
  resizeEditor()
  emit('input')
}

function getContent(): string {
  const editor = getEditor()
  if (!editor) return ''
  return serializeEditorContent(editor)
}

function clear(): void {
  const editor = getEditor()
  if (!editor) return
  editor.innerHTML = ''
  syncEmptyState()
  resizeEditor()
}

function setText(text: string): void {
  clear()
  if (text) insertText(text)
}

function focus(): void {
  getEditor()?.focus()
}

function isContentEmpty(): boolean {
  return isEmpty.value
}

function handleInput(): void {
  const editor = getEditor()
  if (!editor) return

  const text = serializeEditorContent(editor)
  if (text.endsWith('@plan')) {
    const withoutTrigger = text.slice(0, -5)
    editor.textContent = withoutTrigger
    syncEmptyState()
    resizeEditor()
    emit('planTrigger')
    return
  }

  syncEmptyState()
  resizeEditor()
  emit('input')
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('submit')
    return
  }

  if (e.key !== 'Backspace' && e.key !== 'Delete') return

  const editor = getEditor()
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0 || !selection.isCollapsed) return

  const range = selection.getRangeAt(0)
  const { startContainer, startOffset } = range

  if (e.key === 'Backspace') {
    const chip = findAdjacentChip(startContainer, startOffset, 'before')
    if (chip) {
      e.preventDefault()
      chip.remove()
      syncEmptyState()
      resizeEditor()
      emit('input')
    }
    return
  }

  const chip = findAdjacentChip(startContainer, startOffset, 'after')
  if (chip) {
    e.preventDefault()
    chip.remove()
    syncEmptyState()
    resizeEditor()
    emit('input')
  }
}

function findAdjacentChip(
  container: Node,
  offset: number,
  direction: 'before' | 'after'
): HTMLElement | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.textContent ?? ''
    if (direction === 'before' && offset === 0) {
      const prev = container.previousSibling
      if (prev instanceof HTMLElement && prev.classList.contains('inline-file-ref')) return prev
    }
    if (direction === 'after' && offset === text.length) {
      const next = container.nextSibling
      if (next instanceof HTMLElement && next.classList.contains('inline-file-ref')) return next
    }
    return null
  }

  if (!(container instanceof HTMLElement)) return null
  const child = direction === 'before' ? container.childNodes[offset - 1] : container.childNodes[offset]
  if (child instanceof HTMLElement && child.classList.contains('inline-file-ref')) return child
  return null
}

function handlePaste(e: ClipboardEvent): void {
  const text = e.clipboardData?.getData('text/plain')
  if (!text) return
  e.preventDefault()
  insertText(text)
}

function showTooltipForChip(chip: HTMLElement): void {
  const ref = {
    path: chip.dataset.path ?? '',
    startLine: chip.dataset.startLine ? Number(chip.dataset.startLine) : undefined,
    endLine: chip.dataset.endLine ? Number(chip.dataset.endLine) : undefined
  }
  const rect = chip.getBoundingClientRect()
  tooltip.value = {
    text: formatFileReferenceTooltip(ref),
    x: rect.left + rect.width / 2,
    y: rect.top
  }
}

function handleMouseOver(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  const chip = target?.closest('.inline-file-ref') as HTMLElement | null
  if (chip) {
    showTooltipForChip(chip)
    return
  }
  tooltip.value = null
}

function handleMouseOut(e: MouseEvent): void {
  const related = e.relatedTarget as HTMLElement | null
  if (related?.closest('.inline-file-ref') || related?.closest('.inline-file-ref-tooltip')) return
  tooltip.value = null
}

onMounted(() => {
  nextTick(() => {
    syncEmptyState()
    resizeEditor()
  })
})

onUnmounted(() => {
  tooltip.value = null
})

defineExpose({
  insertFileRef,
  insertText,
  getContent,
  clear,
  setText,
  focus,
  isContentEmpty,
  resizeEditor
})
</script>

<template>
  <div class="composer-inline-input">
    <div
      ref="editorRef"
      class="composer-editor elegant-scroll"
      :class="{ 'is-empty': isEmpty }"
      :data-placeholder="placeholder"
      contenteditable
      spellcheck="false"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @mouseover="handleMouseOver"
      @mouseout="handleMouseOut"
    />
    <Teleport to="body">
      <div
        v-if="tooltip"
        class="inline-file-ref-tooltip"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
        @mouseleave="tooltip = null"
      >
        <span class="inline-file-ref-tooltip-path">{{ tooltip.text.split('\n')[0] }}</span>
        <span v-if="tooltip.text.includes('\n')" class="inline-file-ref-tooltip-lines">
          {{ tooltip.text.split('\n').slice(1).join('\n') }}
        </span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.composer-inline-input {
  position: relative;
  width: 100%;
  min-width: 0;
}

.composer-editor {
  width: 100%;
  min-height: 40px;
  max-height: 200px;
  padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-sm);
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-base);
  font-family: inherit;
  line-height: 1.65;
  outline: none;
  overflow-y: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}

.composer-editor.is-empty:before {
  content: attr(data-placeholder);
  color: var(--composer-placeholder);
  pointer-events: none;
}

.composer-editor :deep(.inline-file-ref) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100% - 4px);
  margin: 0 1px;
  padding: 1px 4px 1px 5px;
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 85%, var(--content-text-secondary));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--sidebar-item-hover) 70%, var(--content-bg));
  color: var(--content-text);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  vertical-align: baseline;
  user-select: none;
  white-space: nowrap;
}

.composer-editor :deep(.inline-file-ref-at) {
  color: var(--content-text-secondary);
  font-weight: 600;
}

.composer-editor :deep(.inline-file-ref-label) {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.composer-editor :deep(.inline-file-ref-remove) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-tertiary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.composer-editor :deep(.inline-file-ref-remove:hover) {
  background: color-mix(in srgb, var(--content-text-secondary) 16%, transparent);
  color: var(--content-text);
}
</style>

<style>
.inline-file-ref-tooltip {
  position: fixed;
  z-index: 10000;
  transform: translate(-50%, calc(-100% - 8px));
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: min(520px, calc(100vw - 24px));
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

.inline-file-ref-tooltip-path {
  color: var(--content-text);
  font-size: var(--font-size-xs);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.45;
  word-break: break-all;
  white-space: pre-wrap;
}

.inline-file-ref-tooltip-lines {
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.35;
}
</style>
