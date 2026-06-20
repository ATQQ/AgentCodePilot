<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import type * as Monaco from 'monaco-editor'
import { loadMonaco, getLanguageFromPath, applyMonacoTheme } from '@renderer/utils/monaco'
import { useSettingsStore } from '@renderer/stores/settings.store'
import EditorSelectionBubble from './EditorSelectionBubble.vue'

export interface DiffEditorSelectionInfo {
  startLine: number
  endLine: number
  bubbleX: number
  bubbleY: number
}

const props = withDefaults(
  defineProps<{
    original: string
    modified: string
    filePath?: string
    sideBySide?: boolean
    modifiedEditable?: boolean
    enableSelectionChat?: boolean
  }>(),
  {
    sideBySide: true,
    modifiedEditable: false,
    enableSelectionChat: true
  }
)

const emit = defineEmits<{
  'update:modified': [value: string]
  'add-selection-to-chat': [startLine: number, endLine: number]
}>()

const settingsStore = useSettingsStore()
const containerRef = ref<HTMLElement | null>(null)
const selection = ref<DiffEditorSelectionInfo | null>(null)

let monacoModule: typeof Monaco | null = null
let diffEditor: Monaco.editor.IStandaloneDiffEditor | null = null
let modifiedEditor: Monaco.editor.IStandaloneCodeEditor | null = null
let originalModel: Monaco.editor.ITextModel | null = null
let modifiedModel: Monaco.editor.ITextModel | null = null
let language = ''
let disposed = false
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let selectionDisposable: Monaco.IDisposable | null = null
let scrollDisposable: Monaco.IDisposable | null = null
let contentDisposable: Monaco.IDisposable | null = null
let suppressModifiedEmit = false

const isDark = computed(() => {
  if (settingsStore.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settingsStore.theme === 'dark'
})

function resolveLanguage(): string {
  return props.filePath ? getLanguageFromPath(props.filePath) : 'plaintext'
}

function detachModelsFromEditor(): void {
  if (!diffEditor || (!originalModel && !modifiedModel)) return
  diffEditor.setModel(null)
}

function disposeModels(): void {
  detachModelsFromEditor()
  originalModel?.dispose()
  modifiedModel?.dispose()
  originalModel = null
  modifiedModel = null
  language = ''
}

function layoutEditor(): void {
  diffEditor?.layout()
}

function applyEditableOptions(): void {
  diffEditor?.updateOptions({
    readOnly: !props.modifiedEditable,
    originalEditable: false
  })
}

function emitSelectionChange(): void {
  if (!props.enableSelectionChat || !modifiedEditor) {
    selection.value = null
    return
  }

  const sel = modifiedEditor.getSelection()
  if (!sel || sel.isEmpty()) {
    selection.value = null
    return
  }

  const domNode = modifiedEditor.getDomNode()
  if (!domNode) {
    selection.value = null
    return
  }

  const startPos = modifiedEditor.getScrolledVisiblePosition({
    lineNumber: sel.startLineNumber,
    column: sel.startColumn
  })
  const endPos = modifiedEditor.getScrolledVisiblePosition({
    lineNumber: sel.endLineNumber,
    column: sel.endColumn
  })
  if (!startPos || !endPos) {
    selection.value = null
    return
  }

  const editorRect = domNode.getBoundingClientRect()
  const topY = Math.min(startPos.top, endPos.top)
  const centerX = (startPos.left + endPos.left) / 2

  selection.value = {
    startLine: sel.startLineNumber,
    endLine: sel.endLineNumber,
    bubbleX: editorRect.left + centerX,
    bubbleY: editorRect.top + topY
  }
}

function clearSelection(): void {
  if (!modifiedEditor) return
  const pos = modifiedEditor.getPosition()
  if (pos) {
    modifiedEditor.setSelection({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column
    })
  }
  selection.value = null
}

function bindModifiedEditorListeners(): void {
  selectionDisposable?.dispose()
  scrollDisposable?.dispose()
  contentDisposable?.dispose()
  selectionDisposable = null
  scrollDisposable = null
  contentDisposable = null

  modifiedEditor = diffEditor?.getModifiedEditor() ?? null
  if (!modifiedEditor) return

  selectionDisposable = modifiedEditor.onDidChangeCursorSelection(() => {
    emitSelectionChange()
  })
  scrollDisposable = modifiedEditor.onDidScrollChange(() => {
    emitSelectionChange()
  })

  if (props.modifiedEditable) {
    contentDisposable = modifiedEditor.onDidChangeModelContent(() => {
      if (suppressModifiedEmit || !modifiedModel) return
      emit('update:modified', modifiedModel.getValue())
    })
  }
}

function createModels(): void {
  if (!monacoModule || !diffEditor) return

  disposeModels()
  language = resolveLanguage()
  originalModel = monacoModule.editor.createModel(props.original, language)
  modifiedModel = monacoModule.editor.createModel(props.modified, language)
  diffEditor.setModel({ original: originalModel, modified: modifiedModel })
  bindModifiedEditorListeners()
}

function syncModels(): void {
  if (!monacoModule || !diffEditor || disposed) return

  const nextLanguage = resolveLanguage()

  if (!originalModel || !modifiedModel || language !== nextLanguage) {
    createModels()
    layoutEditor()
    return
  }

  if (originalModel.getValue() !== props.original) {
    originalModel.setValue(props.original)
  }
  if (modifiedModel.getValue() !== props.modified) {
    suppressModifiedEmit = true
    modifiedModel.setValue(props.modified)
    suppressModifiedEmit = false
  }
  layoutEditor()
}

function applyViewMode(): void {
  diffEditor?.updateOptions({
    renderSideBySide: props.sideBySide,
    useInlineViewWhenSpaceIsLimited: false
  })
  layoutEditor()
}

function addSelectionToChat(): void {
  if (!selection.value) return
  emit('add-selection-to-chat', selection.value.startLine, selection.value.endLine)
  clearSelection()
}

function handleKeydown(e: KeyboardEvent): void {
  if (!props.enableSelectionChat || !selection.value) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    e.stopPropagation()
    addSelectionToChat()
  }
}

async function mountEditor(): Promise<void> {
  const container = containerRef.value
  if (!container) return

  monacoModule = await loadMonaco()
  applyMonacoTheme(monacoModule)

  diffEditor = monacoModule.editor.createDiffEditor(container, {
    readOnly: !props.modifiedEditable,
    originalEditable: false,
    renderSideBySide: props.sideBySide,
    useInlineViewWhenSpaceIsLimited: false,
    renderIndicators: true,
    ignoreTrimWhitespace: false,
    diffWordWrap: 'on',
    fontSize: 12,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    diffAlgorithm: 'advanced',
    hideUnchangedRegions: { enabled: false },
    hover: { enabled: false },
    quickSuggestions: props.modifiedEditable,
    parameterHints: { enabled: false },
    codeLens: false,
    contextmenu: false
  })

  createModels()
  applyViewMode()

  resizeObserver = new ResizeObserver(() => {
    layoutEditor()
    emitSelectionChange()
  })
  resizeObserver.observe(container)

  themeObserver = new MutationObserver(() => {
    if (monacoModule) applyMonacoTheme(monacoModule)
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })

  document.addEventListener('keydown', handleKeydown, true)
}

function destroyEditor(): void {
  if (disposed) return
  disposed = true

  document.removeEventListener('keydown', handleKeydown, true)

  selectionDisposable?.dispose()
  scrollDisposable?.dispose()
  contentDisposable?.dispose()
  selectionDisposable = null
  scrollDisposable = null
  contentDisposable = null
  modifiedEditor = null

  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null

  disposeModels()
  diffEditor?.dispose()
  diffEditor = null
  monacoModule = null
}

onMounted(() => {
  void mountEditor()
})

onUnmounted(() => {
  destroyEditor()
})

watch(
  () => [props.original, props.modified, props.filePath] as const,
  () => syncModels()
)

watch(
  () => props.sideBySide,
  () => applyViewMode()
)

watch(
  () => props.modifiedEditable,
  () => {
    applyEditableOptions()
    bindModifiedEditorListeners()
  }
)

watch(isDark, () => {
  if (monacoModule) applyMonacoTheme(monacoModule)
})

defineExpose({ clearSelection })
</script>

<template>
  <div class="monaco-diff-editor-wrap">
    <div ref="containerRef" class="monaco-diff-editor" />
    <EditorSelectionBubble
      v-if="enableSelectionChat"
      :visible="!!selection"
      :x="selection?.bubbleX ?? 0"
      :y="selection?.bubbleY ?? 0"
      @add-to-chat="addSelectionToChat"
    />
  </div>
</template>

<style scoped>
.monaco-diff-editor-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.monaco-diff-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.monaco-diff-editor :deep(.editor.original) {
  border-right: 1px solid var(--sidebar-border);
}

.monaco-diff-editor :deep(.gutter.monaco-editor) {
  background: var(--sidebar-bg);
}
</style>
