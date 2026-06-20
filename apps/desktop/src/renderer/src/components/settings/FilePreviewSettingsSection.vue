<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { DEFAULT_FILE_PREVIEW } from '@renderer/constants/defaults'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const textExtensions = ref<string[]>([])
const imageExtensions = ref<string[]>([])
const textInput = ref('')
const imageInput = ref('')
const saving = ref(false)

const textCount = computed(() => textExtensions.value.length)
const imageCount = computed(() => imageExtensions.value.length)

function syncDraft(): void {
  textExtensions.value = [...settingsStore.filePreview.textExtensions].sort((a, b) =>
    a.localeCompare(b)
  )
  imageExtensions.value = [...settingsStore.filePreview.imageExtensions].sort((a, b) =>
    a.localeCompare(b)
  )
}

onMounted(async () => {
  await settingsStore.fetchSettings()
  syncDraft()
})

function normalizeExt(raw: string): string {
  return raw.trim().replace(/^\./, '').toLowerCase()
}

function addExtensions(target: 'text' | 'image', raw: string): void {
  const list = target === 'text' ? textExtensions : imageExtensions
  const parts = raw
    .split(/[\n,;\s]+/)
    .map(normalizeExt)
    .filter(Boolean)
  if (!parts.length) return
  const merged = new Set(list.value)
  for (const part of parts) merged.add(part)
  list.value = [...merged].sort((a, b) => a.localeCompare(b))
}

async function copyExtensions(target: 'text' | 'image'): Promise<void> {
  const list = target === 'text' ? textExtensions : imageExtensions
  if (!list.value.length) return
  await navigator.clipboard.writeText(list.value.join(', '))
  ElMessage.success(t('settings.filePreview.copySuccess'))
}

function removeExtension(target: 'text' | 'image', ext: string): void {
  const list = target === 'text' ? textExtensions : imageExtensions
  list.value = list.value.filter((item) => item !== ext)
}

function onTextInputKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  addExtensions('text', textInput.value)
  textInput.value = ''
}

function onTextInputBlur(): void {
  addExtensions('text', textInput.value)
  textInput.value = ''
}

function onImageInputKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  addExtensions('image', imageInput.value)
  imageInput.value = ''
}

function onImageInputBlur(): void {
  addExtensions('image', imageInput.value)
  imageInput.value = ''
}

async function save(): Promise<void> {
  saving.value = true
  try {
    await settingsStore.setFilePreview({
      textExtensions: [...new Set(textExtensions.value)].sort((a, b) => a.localeCompare(b)),
      imageExtensions: [...new Set(imageExtensions.value)].sort((a, b) => a.localeCompare(b))
    })
    syncDraft()
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

function resetExtensions(): void {
  textExtensions.value = [...DEFAULT_FILE_PREVIEW.textExtensions]
  imageExtensions.value = [...DEFAULT_FILE_PREVIEW.imageExtensions]
}
</script>

<template>
  <div class="content-section">
    <h1 class="page-title">{{ t('settings.filePreview.title') }}</h1>
    <p class="page-desc">{{ t('settings.filePreview.desc') }}</p>

    <div class="setting-card">
      <div class="setting-block">
        <div class="setting-header">
          <div>
            <div class="setting-label">{{ t('settings.filePreview.textExtensions') }}</div>
            <div class="setting-desc">{{ t('settings.filePreview.textExtensionsDesc') }}</div>
          </div>
          <div class="header-actions">
            <button type="button" class="link-btn" @click="copyExtensions('text')">
              {{ t('settings.filePreview.copyAll') }}
            </button>
            <span class="ext-count">{{ textCount }}</span>
          </div>
        </div>
        <div class="ext-chips elegant-scroll">
          <span v-for="ext in textExtensions" :key="ext" class="ext-chip">
            .{{ ext }}
            <button type="button" class="chip-remove" @click="removeExtension('text', ext)">
              ×
            </button>
          </span>
          <input
            v-model="textInput"
            class="ext-input"
            :placeholder="t('settings.filePreview.addExtension')"
            @keydown="onTextInputKeydown"
            @blur="onTextInputBlur"
          />
        </div>
      </div>

      <div class="setting-block">
        <div class="setting-header">
          <div>
            <div class="setting-label">{{ t('settings.filePreview.imageExtensions') }}</div>
            <div class="setting-desc">{{ t('settings.filePreview.imageExtensionsDesc') }}</div>
          </div>
          <div class="header-actions">
            <button type="button" class="link-btn" @click="copyExtensions('image')">
              {{ t('settings.filePreview.copyAll') }}
            </button>
            <span class="ext-count">{{ imageCount }}</span>
          </div>
        </div>
        <div class="ext-chips ext-chips--compact elegant-scroll">
          <span v-for="ext in imageExtensions" :key="ext" class="ext-chip">
            .{{ ext }}
            <button type="button" class="chip-remove" @click="removeExtension('image', ext)">
              ×
            </button>
          </span>
          <input
            v-model="imageInput"
            class="ext-input"
            :placeholder="t('settings.filePreview.addExtension')"
            @keydown="onImageInputKeydown"
            @blur="onImageInputBlur"
          />
        </div>
      </div>

      <div class="setting-actions">
        <button class="secondary-btn" type="button" @click="resetExtensions">
          {{ t('settings.filePreview.resetExtensions') }}
        </button>
        <button class="primary-btn" type="button" :disabled="saving" @click="save">
          {{ saving ? t('settings.filePreview.saving') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-desc {
  margin: 0 0 var(--spacing-lg);
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}

.setting-card {
  padding: var(--spacing-lg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
}

.setting-block + .setting-block {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--sidebar-border);
}

.setting-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: var(--spacing-sm);
}

.setting-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--content-text);
}

.setting-desc {
  margin-top: 4px;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  color: var(--accent-color);
}

.ext-count {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--btn-secondary-bg);
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
}

.ext-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 168px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
}

.ext-chips--compact {
  max-height: none;
}

.ext-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--content-text);
}

.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--content-text-tertiary);
  cursor: pointer;
  line-height: 1;
}

.chip-remove:hover {
  color: var(--content-text);
  background: var(--sidebar-item-hover);
}

.ext-input {
  flex: 1 1 120px;
  min-width: 120px;
  padding: 4px 6px;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  outline: none;
}

.ext-input::placeholder {
  color: var(--content-text-tertiary);
}

.setting-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.secondary-btn,
.primary-btn {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.secondary-btn {
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
}

.primary-btn {
  border: none;
  background: var(--accent-color);
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
