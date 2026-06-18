<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { loadMonaco, getLanguageFromPath, applyMonacoTheme } from '@renderer/utils/monaco'

const props = defineProps<{
  value: string
  filePath?: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:value': [v: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let editorInstance: any = null

onMounted(async () => {
  if (!containerRef.value) return
  const monaco = await loadMonaco()
  applyMonacoTheme(monaco)
  const lang = props.filePath ? getLanguageFromPath(props.filePath) : 'plaintext'

  editorInstance = monaco.editor.create(containerRef.value, {
    value: props.value,
    language: lang,
    readOnly: props.readOnly ?? true,
    fontSize: 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    theme: document.documentElement.classList.contains('dark') ? 'app-dark' : 'app-light'
  })

  editorInstance.onDidChangeModelContent(() => {
    emit('update:value', editorInstance.getValue())
  })
})

onUnmounted(() => {
  editorInstance?.dispose()
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
  () => props.filePath,
  async (fp) => {
    if (!editorInstance || !fp) return
    const monaco = await loadMonaco()
    const lang = getLanguageFromPath(fp)
    const model = editorInstance.getModel()
    if (model) monaco.editor.setModelLanguage(model, lang)
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
}
</style>
