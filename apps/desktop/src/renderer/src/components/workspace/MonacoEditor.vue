<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type * as Monaco from 'monaco-editor'
import { loadMonaco, getLanguageFromPath, applyMonacoTheme } from '@renderer/utils/monaco'

export interface EditorSelectionInfo {
  startLine: number
  endLine: number
  bubbleX: number
  bubbleY: number
}

const props = defineProps<{
  value: string
  filePath?: string
  readOnly?: boolean
  languageOverride?: string
}>()

const emit = defineEmits<{
  'update:value': [v: string]
  'selection-change': [selection: EditorSelectionInfo | null]
}>()

const containerRef = ref<HTMLElement | null>(null)
let monacoModule: typeof Monaco | null = null
let editorInstance: Monaco.editor.IStandaloneCodeEditor | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let selectionDisposable: Monaco.IDisposable | null = null
let scrollDisposable: Monaco.IDisposable | null = null

function resolveLanguage(): string {
  return (
    props.languageOverride ?? (props.filePath ? getLanguageFromPath(props.filePath) : 'plaintext')
  )
}

function layoutEditor(): void {
  editorInstance?.layout()
}

function emitSelectionChange(): void {
  if (!editorInstance) {
    emit('selection-change', null)
    return
  }

  const sel = editorInstance.getSelection()
  if (!sel || sel.isEmpty()) {
    emit('selection-change', null)
    return
  }

  const domNode = editorInstance.getDomNode()
  if (!domNode) {
    emit('selection-change', null)
    return
  }

  const startPos = editorInstance.getScrolledVisiblePosition({
    lineNumber: sel.startLineNumber,
    column: sel.startColumn
  })
  const endPos = editorInstance.getScrolledVisiblePosition({
    lineNumber: sel.endLineNumber,
    column: sel.endColumn
  })
  if (!startPos || !endPos) {
    emit('selection-change', null)
    return
  }

  const editorRect = domNode.getBoundingClientRect()
  const topY = Math.min(startPos.top, endPos.top)
  const centerX = (startPos.left + endPos.left) / 2

  emit('selection-change', {
    startLine: sel.startLineNumber,
    endLine: sel.endLineNumber,
    bubbleX: editorRect.left + centerX,
    bubbleY: editorRect.top + topY
  })
}

function clearSelection(): void {
  if (!editorInstance) return
  const pos = editorInstance.getPosition()
  if (pos) {
    editorInstance.setSelection({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column
    })
  }
  emit('selection-change', null)
}

async function mountEditor(): Promise<void> {
  const container = containerRef.value
  if (!container) return

  monacoModule = await loadMonaco()
  applyMonacoTheme(monacoModule)

  editorInstance = monacoModule.editor.create(container, {
    value: props.value,
    language: resolveLanguage(),
    readOnly: props.readOnly ?? true,
    fontSize: 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'off'
  })

  editorInstance.onDidChangeModelContent(() => {
    emit('update:value', editorInstance!.getValue())
  })

  selectionDisposable = editorInstance.onDidChangeCursorSelection(() => {
    emitSelectionChange()
  })
  scrollDisposable = editorInstance.onDidScrollChange(() => {
    emitSelectionChange()
  })

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
}

function destroyEditor(): void {
  selectionDisposable?.dispose()
  selectionDisposable = null
  scrollDisposable?.dispose()
  scrollDisposable = null
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  editorInstance?.dispose()
  editorInstance = null
  monacoModule = null
}

onMounted(() => {
  void mountEditor()
})

onUnmounted(() => {
  destroyEditor()
})

watch(
  () => props.readOnly,
  (v) => editorInstance?.updateOptions({ readOnly: v ?? true })
)

watch(
  () => props.value,
  (v) => {
    if (editorInstance && editorInstance.getValue() !== v) {
      editorInstance.setValue(v)
    }
  }
)

watch(
  () => [props.filePath, props.languageOverride] as const,
  async () => {
    if (!editorInstance || !monacoModule) return
    const model = editorInstance.getModel()
    if (model) monacoModule.editor.setModelLanguage(model, resolveLanguage())
  }
)

defineExpose({ clearSelection })
</script>

<template>
  <div ref="containerRef" class="monaco-editor-view" />
</template>

<style scoped>
.monaco-editor-view {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
