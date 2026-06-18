<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import type * as Monaco from 'monaco-editor'
import { loadMonaco, getLanguageFromPath, applyMonacoTheme } from '@renderer/utils/monaco'
import { useSettingsStore } from '@renderer/stores/settings.store'

const props = withDefaults(
  defineProps<{
    original: string
    modified: string
    filePath?: string
    sideBySide?: boolean
  }>(),
  { sideBySide: true }
)

const settingsStore = useSettingsStore()
const containerRef = ref<HTMLElement | null>(null)

let monacoModule: typeof Monaco | null = null
let diffEditor: Monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: Monaco.editor.ITextModel | null = null
let modifiedModel: Monaco.editor.ITextModel | null = null
let language = ''
let disposed = false
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

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

function createModels(): void {
  if (!monacoModule || !diffEditor) return

  disposeModels()
  language = resolveLanguage()
  originalModel = monacoModule.editor.createModel(props.original, language)
  modifiedModel = monacoModule.editor.createModel(props.modified, language)
  diffEditor.setModel({ original: originalModel, modified: modifiedModel })
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
    modifiedModel.setValue(props.modified)
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

async function mountEditor(): Promise<void> {
  const container = containerRef.value
  if (!container) return

  monacoModule = await loadMonaco()
  applyMonacoTheme(monacoModule)

  diffEditor = monacoModule.editor.createDiffEditor(container, {
    readOnly: true,
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
    quickSuggestions: false,
    parameterHints: { enabled: false },
    codeLens: false,
    contextmenu: false
  })

  createModels()
  applyViewMode()

  resizeObserver = new ResizeObserver(() => layoutEditor())
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
  if (disposed) return
  disposed = true

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

watch(isDark, () => {
  if (monacoModule) applyMonacoTheme(monacoModule)
})
</script>

<template>
  <div ref="containerRef" class="monaco-diff-editor" />
</template>

<style scoped>
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
