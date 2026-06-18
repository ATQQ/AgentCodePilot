<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { loadMonaco, getLanguageFromPath, applyMonacoTheme } from '@renderer/utils/monaco'
import { useSettingsStore } from '@renderer/stores/settings.store'

const props = withDefaults(
  defineProps<{
    original: string
    modified: string
    language?: string
    sideBySide?: boolean
  }>(),
  { sideBySide: true }
)

const settingsStore = useSettingsStore()
const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let editorInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monacoRef: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentModels: { original: any; modified: any } | null = null
let themeObserver: MutationObserver | null = null

const isDark = computed(() => {
  if (settingsStore.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settingsStore.theme === 'dark'
})

function disposeModels(): void {
  currentModels?.original.dispose()
  currentModels?.modified.dispose()
  currentModels = null
}

function getDiffOptions(): Record<string, unknown> {
  return {
    readOnly: true,
    renderSideBySide: props.sideBySide,
    useInlineViewWhenSpaceIsLimited: false,
    renderIndicators: true,
    ignoreTrimWhitespace: false,
    diffWordWrap: 'on',
    fontSize: 12,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    originalEditable: false,
    diffAlgorithm: 'advanced'
  }
}

function setEditorModels(): void {
  if (!editorInstance || !monacoRef) return
  disposeModels()
  const lang = props.language ? getLanguageFromPath('file.' + props.language) : 'plaintext'
  currentModels = {
    original: monacoRef.editor.createModel(props.original, lang),
    modified: monacoRef.editor.createModel(props.modified, lang)
  }
  editorInstance.setModel(currentModels)
  layoutEditor()
}

function applyViewMode(): void {
  if (!editorInstance) return
  editorInstance.updateOptions({
    renderSideBySide: props.sideBySide,
    useInlineViewWhenSpaceIsLimited: false
  })
  layoutEditor()
}

function layoutEditor(): void {
  requestAnimationFrame(() => editorInstance?.layout())
}

function syncContainerHeight(): void {
  const host = containerRef.value?.parentElement
  if (!host || !containerRef.value) return
  const height = host.clientHeight
  if (height > 0) {
    containerRef.value.style.height = `${height}px`
    layoutEditor()
  }
}

onMounted(async () => {
  if (!containerRef.value) return
  const monaco = await loadMonaco()
  monacoRef = monaco
  applyMonacoTheme(monaco)

  editorInstance = monaco.editor.createDiffEditor(containerRef.value, getDiffOptions())
  setEditorModels()
  syncContainerHeight()

  if (containerRef.value.parentElement) {
    resizeObserver = new ResizeObserver(() => syncContainerHeight())
    resizeObserver.observe(containerRef.value.parentElement)
  }

  themeObserver = new MutationObserver(() => {
    if (monacoRef) applyMonacoTheme(monacoRef)
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  disposeModels()
  editorInstance?.dispose()
})

watch(
  () => [props.original, props.modified, props.language],
  () => {
    setEditorModels()
  }
)

watch(
  () => props.sideBySide,
  () => {
    applyViewMode()
  }
)

watch(isDark, () => {
  if (monacoRef) applyMonacoTheme(monacoRef)
})
</script>

<template>
  <div ref="containerRef" class="monaco-diff" />
</template>

<style scoped>
.monaco-diff {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 200px;
  flex: 1;
}

.monaco-diff :deep(.editor.original) {
  border-right: 1px solid var(--sidebar-border);
}

.monaco-diff :deep(.gutter.monaco-editor) {
  background: var(--sidebar-bg);
}
</style>
