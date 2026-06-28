<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import MarkdownRender from 'markstream-vue'
import { useFileExplorerStore } from '@renderer/stores/fileExplorer.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { useBrowserPreview } from '@renderer/composables/useBrowserPreview'
import { toLocalFileUrl } from '@renderer/utils/localFile'
import { resolveFileKind, getFileExtension } from '@renderer/utils/fileKind'
import { getLanguageFromPath, PREVIEW_LANGUAGE_OPTIONS } from '@renderer/utils/monaco'
import { CODE_BLOCK_PROPS } from '@renderer/constants/codeBlockTheme'

const FileCodeBlockPreview = defineAsyncComponent(() => import('./FileCodeBlockPreview.vue'))

const props = defineProps<{
  filePath: string
}>()

const { t } = useI18n()
const fileStore = useFileExplorerStore()
const composerStore = useComposerStore()
const settingsStore = useSettingsStore()
const layoutStore = useLayoutStore()
const { openInBrowser } = useBrowserPreview()

const imageSrc = ref('')
const imageLoadFailed = ref(false)
const showAddExtensionPrompt = ref(false)
const selectedLanguage = ref('plaintext')
const mdPreviewMode = ref(false)

const fileName = computed(() => props.filePath.split('/').pop() ?? props.filePath)

const fileKind = computed(() =>
  resolveFileKind(props.filePath, settingsStore.filePreview, fileStore.forceTextRead)
)

const isEditable = computed(() => fileKind.value === 'text' && !fileStore.fileReadError)

const isMarkdown = computed(() => {
  const ext = getFileExtension(props.filePath)
  if (ext === 'md' || ext === 'mdx') return true
  return getLanguageFromPath(props.filePath) === 'markdown'
})

const isHtml = computed(() => {
  const ext = getFileExtension(props.filePath)
  return ext === 'html' || ext === 'htm'
})

const fileExtension = computed(() => getFileExtension(props.filePath))

const languageOptions = PREVIEW_LANGUAGE_OPTIONS

const isDark = computed(() => {
  if (settingsStore.theme === 'dark') return true
  if (settingsStore.theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
})

const markdownContent = computed(() =>
  fileStore.editMode ? fileStore.dirtyContent : fileStore.fileContent
)

function initImageSrc(): void {
  imageLoadFailed.value = false
  imageSrc.value = toLocalFileUrl(props.filePath)
}

function resetLanguageSelection(): void {
  selectedLanguage.value = getLanguageFromPath(props.filePath)
}

initImageSrc()
resetLanguageSelection()

watch(
  () => props.filePath,
  () => {
    initImageSrc()
    showAddExtensionPrompt.value = false
    mdPreviewMode.value = false
    resetLanguageSelection()
  }
)

async function onImageError(): Promise<void> {
  if (imageLoadFailed.value) return
  imageLoadFailed.value = true
  const dataUrl = await window.agentAPI.file.getImageDataUrl(props.filePath)
  if (dataUrl) {
    imageSrc.value = dataUrl
  }
}

function toggleEdit(): void {
  if (fileStore.editMode) {
    fileStore.setEditMode(false)
    return
  }
  mdPreviewMode.value = false
  fileStore.setEditMode(true)
}

async function saveFile(): Promise<void> {
  const ok = await fileStore.saveFile()
  if (ok) {
    fileStore.setEditMode(false)
  }
}

async function saveFileFromShortcut(): Promise<void> {
  const ok = await fileStore.saveFile()
  if (ok) {
    fileStore.setEditMode(false)
    ElMessage.success(t('workspace.filePreview.saved'))
  } else {
    ElMessage.error(t('workspace.filePreview.saveFailed'))
  }
}

function enterEditModeFromShortcut(): void {
  mdPreviewMode.value = false
  fileStore.setEditMode(true)
  ElMessage.info(t('workspace.filePreview.enterEditMode'))
}

function toggleMdPreview(): void {
  mdPreviewMode.value = !mdPreviewMode.value
}

function previewHtmlInBrowser(): void {
  openInBrowser(props.filePath)
}

function addToChat(): void {
  composerStore.addFileReference(props.filePath)
}

function addSelectionToChat(startLine: number, endLine: number): void {
  composerStore.addFileReference(props.filePath, startLine, endLine)
}

async function readAsFormat(): Promise<void> {
  const wasUnsupported = fileKind.value === 'unsupported'
  await fileStore.readFileAsText(props.filePath, selectedLanguage.value)
  if (!fileStore.fileReadError && wasUnsupported && fileExtension.value) {
    showAddExtensionPrompt.value = true
  }
}

async function confirmAddExtension(): Promise<void> {
  if (fileExtension.value) {
    await settingsStore.addTextExtension(fileExtension.value)
  }
  showAddExtensionPrompt.value = false
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

function handlePreviewKeydown(e: KeyboardEvent): void {
  if (layoutStore.activeExtensionTab !== 'files' || !layoutStore.rightPanelVisible) return
  if (!isEditable.value || fileStore.fileLoading) return

  const key = e.key.toLowerCase()

  if ((e.metaKey || e.ctrlKey) && key === 's' && !e.altKey) {
    if (!fileStore.editMode) return
    e.preventDefault()
    e.stopPropagation()
    void saveFileFromShortcut()
    return
  }

  if (key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (fileStore.editMode) return
    if (isTypingTarget(e.target)) return
    e.preventDefault()
    e.stopPropagation()
    enterEditModeFromShortcut()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handlePreviewKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handlePreviewKeydown, true)
})
</script>

<template>
  <div class="file-preview">
    <div class="fp-toolbar">
      <div class="fp-actions">
        <button class="action-btn" @click="addToChat">
          {{ t('workspace.filePreview.addToChat') }}
        </button>
        <button v-if="isEditable" class="action-btn" @click="toggleEdit">
          {{
            fileStore.editMode
              ? t('workspace.filePreview.readOnly')
              : t('workspace.filePreview.edit')
          }}
        </button>
        <button v-if="fileStore.editMode" class="action-btn primary" @click="saveFile">
          {{ t('workspace.filePreview.save') }}
        </button>
        <button
          v-if="isMarkdown && isEditable && !fileStore.editMode"
          class="action-btn"
          :class="{ active: mdPreviewMode }"
          @click="toggleMdPreview"
        >
          {{
            mdPreviewMode ? t('workspace.filePreview.source') : t('workspace.filePreview.preview')
          }}
        </button>
        <button
          v-if="isHtml && isEditable && !fileStore.editMode"
          class="action-btn"
          :title="t('chat.openInBrowser')"
          @click="previewHtmlInBrowser"
        >
          {{ t('workspace.filePreview.preview') }}
        </button>
      </div>
      <span class="fp-name" :title="filePath">{{ fileName }}</span>
    </div>

    <div class="fp-content">
      <div v-if="fileStore.fileLoading" class="center-msg">加载中…</div>

      <div v-else-if="fileStore.fileReadError" class="center-msg column">
        <span>{{ fileStore.fileReadError }}</span>
        <div class="read-as-row">
          <span>{{ t('workspace.filePreview.readAsPrefix') }}</span>
          <select v-model="selectedLanguage" class="format-select">
            <option v-for="opt in languageOptions" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
          <span>{{ t('workspace.filePreview.readAsSuffix') }}</span>
          <button class="action-btn primary" @click="readAsFormat">
            {{ t('workspace.filePreview.read') }}
          </button>
        </div>
      </div>

      <img
        v-else-if="fileKind === 'image'"
        :src="imageSrc"
        class="img-preview"
        @error="onImageError"
      />

      <div
        v-else-if="fileKind === 'text' && mdPreviewMode"
        class="md-preview-content elegant-scroll"
      >
        <MarkdownRender
          mode="docs"
          custom-id="file-preview"
          :content="markdownContent"
          :final="true"
          :is-dark="isDark"
          :batch-rendering="true"
          :render-batch-size="16"
          :render-batch-delay="8"
          :code-block-props="CODE_BLOCK_PROPS"
        />
      </div>

      <Suspense v-else-if="fileKind === 'text'">
        <FileCodeBlockPreview
          :value="fileStore.editMode ? fileStore.dirtyContent : fileStore.fileContent"
          :file-path="filePath"
          :read-only="!fileStore.editMode"
          :is-dark="isDark"
          :language-override="fileStore.previewLanguageOverride ?? undefined"
          @update:value="(v) => (fileStore.dirtyContent = v)"
          @add-selection-to-chat="addSelectionToChat"
        />
        <template #fallback>
          <div class="center-msg">加载编辑器…</div>
        </template>
      </Suspense>

      <div v-else class="center-msg column">
        <span>{{ t('workspace.filePreview.unsupported') }}</span>
        <div class="read-as-row">
          <span>{{ t('workspace.filePreview.readAsPrefix') }}</span>
          <select v-model="selectedLanguage" class="format-select">
            <option v-for="opt in languageOptions" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
          <span>{{ t('workspace.filePreview.readAsSuffix') }}</span>
          <button class="action-btn primary" @click="readAsFormat">
            {{ t('workspace.filePreview.read') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showAddExtensionPrompt && fileExtension" class="extension-prompt">
      <span
        >预览正常？可将 <code>.{{ fileExtension }}</code> 加入文本预览列表</span
      >
      <div class="prompt-actions">
        <button class="action-btn" @click="showAddExtensionPrompt = false">取消</button>
        <button class="action-btn primary" @click="confirmAddExtension">确认添加</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.fp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
  min-width: 0;
}

.fp-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.fp-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.action-btn {
  padding: 3px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
}

.action-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.action-btn.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.action-btn.primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border-color: transparent;
}

.fp-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.fp-content :deep(.file-code-block-preview) {
  flex: 1;
  min-height: 0;
}

.md-preview-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
}

.md-preview-content :deep(.markstream-vue) {
  max-width: 100%;
}

.img-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  margin: auto;
}

.center-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}

.center-msg.column {
  flex-direction: column;
  gap: 12px;
}

.read-as-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.format-select {
  padding: 4px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.extension-prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--sidebar-border);
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  flex-shrink: 0;
}

.prompt-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
</style>
