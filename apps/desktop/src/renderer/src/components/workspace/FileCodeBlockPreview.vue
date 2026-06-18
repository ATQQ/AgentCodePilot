<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type * as Monaco from 'monaco-editor'
import { CodeBlockNode } from 'markstream-vue'
import { loadMonaco, getLanguageFromPath } from '@renderer/utils/monaco'
import {
  CODE_BLOCK_THEME,
  CODE_BLOCK_MONACO_THEMES
} from '@renderer/constants/codeBlockTheme'

const props = defineProps<{
  value: string
  filePath: string
  readOnly?: boolean
  isDark: boolean
  languageOverride?: string
}>()

const emit = defineEmits<{ 'update:value': [v: string] }>()

const rootRef = ref<HTMLElement | null>(null)
let changeDisposable: Monaco.IDisposable | null = null
let resizeObserver: ResizeObserver | null = null
let styleObserver: MutationObserver | null = null
let monacoModule: typeof Monaco | null = null

const language = computed(() => props.languageOverride ?? getLanguageFromPath(props.filePath))

const codeNode = computed(() => {
  const lang = language.value
  const code = props.value
  return {
    type: 'code_block' as const,
    language: lang,
    code,
    raw: `\`\`\`${lang}\n${code}\n\`\`\``
  }
})

const codeBlockTheme = CODE_BLOCK_THEME

const monacoOptions = computed(() => ({
  readOnly: props.readOnly ?? true,
  MAX_HEIGHT: 65536,
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13
}))

async function getMonaco(): Promise<typeof Monaco> {
  if (!monacoModule) {
    monacoModule = await loadMonaco()
  }
  return monacoModule
}

function findEditorInContainer(): Monaco.editor.ICodeEditor | null {
  const container = rootRef.value?.querySelector('.code-editor-container')
  if (!container || !monacoModule) return null

  const editors = monacoModule.editor.getEditors()
  return (
    editors.find((editor) => {
      const node = editor.getDomNode()
      return node && container.contains(node)
    }) ?? null
  )
}

async function waitForEditor(): Promise<Monaco.editor.ICodeEditor | null> {
  await getMonaco()
  for (let i = 0; i < 60; i++) {
    const editor = findEditorInContainer()
    if (editor) return editor
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

function syncEditorHeight(): void {
  const layer = rootRef.value?.querySelector('.code-editor-layer') as HTMLElement | null
  const container = rootRef.value?.querySelector('.code-editor-container') as HTMLElement | null
  if (!layer || !container) return

  const height = layer.clientHeight
  if (height <= 0) return

  const current = Number.parseFloat(container.style.height)
  if (Number.isFinite(current) && Math.abs(current - height) < 2) {
    findEditorInContainer()?.layout()
    return
  }

  container.style.height = `${height}px`
  container.style.minHeight = `${height}px`
  container.style.maxHeight = 'none'

  findEditorInContainer()?.layout()
}

async function bindChangeListener(): Promise<void> {
  changeDisposable?.dispose()
  changeDisposable = null

  if (props.readOnly) return

  const editor = await waitForEditor()
  if (!editor) return

  editor.updateOptions({ readOnly: false })
  changeDisposable = editor.onDidChangeModelContent(() => {
    emit('update:value', editor.getValue())
  })
}

watch(
  () => props.readOnly,
  async (readOnly) => {
    await nextTick()
    if (readOnly) {
      changeDisposable?.dispose()
      changeDisposable = null
      findEditorInContainer()?.updateOptions({ readOnly: true })
      return
    }
    await bindChangeListener()
  }
)

watch(
  () => [props.filePath, props.value] as const,
  async () => {
    await nextTick()
    syncEditorHeight()
    await bindChangeListener()
  }
)

function startHeightSync(): void {
  const container = rootRef.value?.querySelector('.code-editor-container') as HTMLElement | null
  if (!container) return

  styleObserver?.disconnect()
  styleObserver = new MutationObserver(() => {
    syncEditorHeight()
  })
  styleObserver.observe(container, { attributes: true, attributeFilter: ['style'] })
}

onMounted(() => {
  if (rootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      syncEditorHeight()
    })
    resizeObserver.observe(rootRef.value)
  }

  void waitForEditor().then(() => {
    startHeightSync()
    syncEditorHeight()
    void bindChangeListener()
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  styleObserver?.disconnect()
  changeDisposable?.dispose()
})
</script>

<template>
  <div ref="rootRef" class="markstream-vue file-code-block-preview" :class="{ dark: isDark }">
    <CodeBlockNode
      :node="codeNode"
      :is-dark="isDark"
      :loading="false"
      :stream="false"
      :theme="codeBlockTheme"
      :themes="CODE_BLOCK_MONACO_THEMES"
      :monaco-options="monacoOptions"
      :show-header="true"
      :show-expand-button="false"
      :show-collapse-button="false"
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
}

.file-code-block-preview :deep(.code-block-container) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  max-height: none;
  margin: 0;
  width: 100%;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
}

.file-code-block-preview :deep(.code-editor-layer) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.file-code-block-preview :deep(.code-editor-container) {
  flex: 1;
  width: 100%;
  overflow: hidden;
}

.file-code-block-preview :deep(.monaco-editor) {
  height: 100% !important;
}
</style>
