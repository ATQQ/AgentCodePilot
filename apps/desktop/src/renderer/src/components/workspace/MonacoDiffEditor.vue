<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { loadMonaco, getLanguageFromPath } from '@renderer/utils/monaco'

const props = defineProps<{
  original: string
  modified: string
  language?: string
}>()

const containerRef = ref<HTMLElement | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let editorInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monacoRef: any = null

onMounted(async () => {
  if (!containerRef.value) return
  const monaco = await loadMonaco()
  monacoRef = monaco

  const lang = props.language ? getLanguageFromPath('file.' + props.language) : 'plaintext'

  editorInstance = monaco.editor.createDiffEditor(containerRef.value, {
    readOnly: true,
    renderSideBySide: true,
    fontSize: 12,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true
  })

  editorInstance.setModel({
    original: monaco.editor.createModel(props.original, lang),
    modified: monaco.editor.createModel(props.modified, lang)
  })
})

onUnmounted(() => {
  editorInstance?.dispose()
})

watch(
  () => [props.original, props.modified, props.language],
  async () => {
    if (!editorInstance || !monacoRef) return
    const lang = props.language ? getLanguageFromPath('file.' + props.language) : 'plaintext'
    editorInstance.setModel({
      original: monacoRef.editor.createModel(props.original, lang),
      modified: monacoRef.editor.createModel(props.modified, lang)
    })
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
