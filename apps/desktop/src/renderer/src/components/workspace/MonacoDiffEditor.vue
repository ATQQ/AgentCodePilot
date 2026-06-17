<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { loadMonaco, getLanguageFromPath } from '@renderer/utils/monaco'

const props = withDefaults(
  defineProps<{
    original: string
    modified: string
    language?: string
    sideBySide?: boolean
  }>(),
  { sideBySide: true }
)

const containerRef = ref<HTMLElement | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let editorInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monacoRef: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentModels: { original: any; modified: any } | null = null

function disposeModels(): void {
  currentModels?.original.dispose()
  currentModels?.modified.dispose()
  currentModels = null
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
}

onMounted(async () => {
  if (!containerRef.value) return
  const monaco = await loadMonaco()
  monacoRef = monaco

  editorInstance = monaco.editor.createDiffEditor(containerRef.value, {
    readOnly: true,
    renderSideBySide: props.sideBySide,
    fontSize: 12,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true
  })

  setEditorModels()
})

onUnmounted(() => {
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
  (sideBySide) => {
    editorInstance?.updateOptions({ renderSideBySide: sideBySide })
  }
)
</script>

<template>
  <div ref="containerRef" class="monaco-diff" />
</template>

<style scoped>
.monaco-diff {
  width: 100%;
  height: 100%;
}
</style>
