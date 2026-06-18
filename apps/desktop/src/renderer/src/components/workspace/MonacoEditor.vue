<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type * as Monaco from 'monaco-editor'
import { loadMonaco, getLanguageFromPath, applyMonacoTheme } from '@renderer/utils/monaco'

const props = defineProps<{
  value: string
  filePath?: string
  readOnly?: boolean
  languageOverride?: string
}>()

const emit = defineEmits<{
  'update:value': [v: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
let monacoModule: typeof Monaco | null = null
let editorInstance: Monaco.editor.IStandaloneCodeEditor | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function resolveLanguage(): string {
  return props.languageOverride ?? (props.filePath ? getLanguageFromPath(props.filePath) : 'plaintext')
}

function layoutEditor(): void {
  editorInstance?.layout()
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
