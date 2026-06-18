<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useFileExplorerStore } from '@renderer/stores/fileExplorer.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { toLocalFileUrl } from '@renderer/utils/localFile'
import { resolveFileKind, getFileExtension } from '@renderer/utils/fileKind'

const FileCodeBlockPreview = defineAsyncComponent(
  () => import('./FileCodeBlockPreview.vue')
)

const props = defineProps<{
  filePath: string
}>()

const fileStore = useFileExplorerStore()
const composerStore = useComposerStore()
const settingsStore = useSettingsStore()

const imageSrc = ref('')
const imageLoadFailed = ref(false)
const showAddExtensionPrompt = ref(false)

const fileName = computed(() => props.filePath.split('/').pop() ?? props.filePath)

const fileKind = computed(() =>
  resolveFileKind(props.filePath, settingsStore.filePreview, fileStore.forceTextRead)
)

const isEditable = computed(() => fileKind.value === 'text' && !fileStore.fileReadError)

const fileExtension = computed(() => getFileExtension(props.filePath))

const isDark = computed(() => {
  if (settingsStore.theme === 'dark') return true
  if (settingsStore.theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
})

function initImageSrc(): void {
  imageLoadFailed.value = false
  imageSrc.value = toLocalFileUrl(props.filePath)
}

initImageSrc()

watch(
  () => props.filePath,
  () => {
    initImageSrc()
    showAddExtensionPrompt.value = false
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
  fileStore.setEditMode(!fileStore.editMode)
}

async function saveFile(): Promise<void> {
  const ok = await fileStore.saveFile()
  if (ok) {
    fileStore.setEditMode(false)
  }
}

function addToChat(): void {
  composerStore.addFileReference(props.filePath)
}

async function readAsText(): Promise<void> {
  await fileStore.readFileAsText(props.filePath)
  if (!fileStore.fileReadError) {
    showAddExtensionPrompt.value = true
  }
}

async function confirmAddExtension(): Promise<void> {
  if (fileExtension.value) {
    await settingsStore.addTextExtension(fileExtension.value)
  }
  showAddExtensionPrompt.value = false
}
</script>

<template>
  <div class="file-preview">
    <div class="fp-toolbar">
      <span class="fp-name">{{ fileName }}</span>
      <div class="fp-actions">
        <button class="action-btn" @click="addToChat">添加到对话</button>
        <button v-if="isEditable" class="action-btn" @click="toggleEdit">
          {{ fileStore.editMode ? '只读' : '编辑' }}
        </button>
        <button
          v-if="fileStore.editMode"
          class="action-btn primary"
          @click="saveFile"
        >保存</button>
      </div>
    </div>

    <div class="fp-content">
      <div v-if="fileStore.fileLoading" class="center-msg">加载中…</div>

      <div v-else-if="fileStore.fileReadError" class="center-msg column">
        <span>{{ fileStore.fileReadError }}</span>
        <button class="action-btn" @click="readAsText">按文本格式读取</button>
      </div>

      <img
        v-else-if="fileKind === 'image'"
        :src="imageSrc"
        class="img-preview"
        @error="onImageError"
      />

      <Suspense v-else-if="fileKind === 'text'">
        <FileCodeBlockPreview
          :value="fileStore.editMode ? fileStore.dirtyContent : fileStore.fileContent"
          :file-path="filePath"
          :read-only="!fileStore.editMode"
          :is-dark="isDark"
          @update:value="(v) => fileStore.dirtyContent = v"
        />
        <template #fallback>
          <div class="center-msg">加载编辑器…</div>
        </template>
      </Suspense>

      <div v-else class="center-msg column">
        <span>无法预览此文件类型</span>
        <button class="action-btn" @click="readAsText">按文本格式读取</button>
      </div>
    </div>

    <div v-if="showAddExtensionPrompt && fileExtension" class="extension-prompt">
      <span>预览正常？可将 <code>.{{ fileExtension }}</code> 加入文本预览列表</span>
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
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.fp-name {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.fp-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  padding: 3px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.action-btn:hover {
  background: var(--sidebar-item-hover);
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
