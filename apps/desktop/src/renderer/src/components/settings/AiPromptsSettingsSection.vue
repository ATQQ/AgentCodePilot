<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { View, Edit } from '@element-plus/icons-vue'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { DEFAULT_AI_PROMPTS } from '@renderer/constants/defaults'

type PromptKey = 'commitMessage' | 'autoCommit'

interface PromptItem {
  key: PromptKey
  labelKey: string
  descKey: string
}

interface PromptCategory {
  key: string
  labelKey: string
  items: PromptItem[]
}

const { t } = useI18n()
const settingsStore = useSettingsStore()

const promptDrafts = ref<Record<PromptKey, string>>({
  commitMessage: '',
  autoCommit: ''
})
const saving = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref<'preview' | 'edit'>('preview')
const activePromptKey = ref<PromptKey | null>(null)
const editDraft = ref('')

const categories: PromptCategory[] = [
  {
    key: 'git',
    labelKey: 'settings.aiFeatures.categoryGit',
    items: [
      {
        key: 'commitMessage',
        labelKey: 'settings.aiFeatures.commitMessage',
        descKey: 'settings.aiFeatures.commitMessageDesc'
      },
      {
        key: 'autoCommit',
        labelKey: 'settings.aiFeatures.autoCommit',
        descKey: 'settings.aiFeatures.autoCommitDesc'
      }
    ]
  }
]

const activePromptLabel = computed(() => {
  if (!activePromptKey.value) return ''
  for (const category of categories) {
    const item = category.items.find((entry) => entry.key === activePromptKey.value)
    if (item) return t(item.labelKey)
  }
  return ''
})

function syncDraft(): void {
  promptDrafts.value = {
    commitMessage: settingsStore.aiPrompts.commitMessage ?? DEFAULT_AI_PROMPTS.commitMessage ?? '',
    autoCommit: settingsStore.aiPrompts.autoCommit ?? DEFAULT_AI_PROMPTS.autoCommit ?? ''
  }
}

onMounted(async () => {
  await settingsStore.fetchSettings()
  syncDraft()
})

function getPromptPreview(key: PromptKey): string {
  const value = promptDrafts.value[key].trim()
  if (!value) return t('settings.aiFeatures.emptyPrompt')
  return value.length > 120 ? `${value.slice(0, 120)}…` : value
}

function openPreview(key: PromptKey): void {
  activePromptKey.value = key
  dialogMode.value = 'preview'
  dialogVisible.value = true
}

function openEdit(key: PromptKey): void {
  activePromptKey.value = key
  editDraft.value = promptDrafts.value[key]
  dialogMode.value = 'edit'
  dialogVisible.value = true
}

function closeDialog(): void {
  dialogVisible.value = false
  activePromptKey.value = null
}

async function persistPrompts(next: Record<PromptKey, string>): Promise<void> {
  saving.value = true
  try {
    await settingsStore.setAiPrompts({
      commitMessage: next.commitMessage.trim() || DEFAULT_AI_PROMPTS.commitMessage,
      autoCommit: next.autoCommit.trim() || DEFAULT_AI_PROMPTS.autoCommit
    })
    syncDraft()
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function applyEdit(): Promise<void> {
  if (!activePromptKey.value) return
  const next = {
    ...promptDrafts.value,
    [activePromptKey.value]: editDraft.value
  }
  await persistPrompts(next)
  closeDialog()
}

async function resetPrompt(key: PromptKey): Promise<void> {
  const next = {
    ...promptDrafts.value,
    [key]: DEFAULT_AI_PROMPTS[key] ?? ''
  }
  await persistPrompts(next)
}
</script>

<template>
  <div class="content-section">
    <h1 class="page-title">{{ t('settings.aiFeatures.title') }}</h1>
    <p class="page-desc">{{ t('settings.aiFeatures.desc') }}</p>

    <div v-for="category in categories" :key="category.key" class="setting-card">
      <h2 class="category-title">{{ t(category.labelKey) }}</h2>

      <div class="prompt-list">
        <div v-for="item in category.items" :key="item.key" class="prompt-row">
          <div class="prompt-main">
            <div class="prompt-label">{{ t(item.labelKey) }}</div>
            <div class="prompt-desc">{{ t(item.descKey) }}</div>
            <div class="prompt-preview">{{ getPromptPreview(item.key) }}</div>
          </div>
          <div class="prompt-actions">
            <button
              type="button"
              class="icon-action-btn"
              :title="t('settings.aiFeatures.preview')"
              @click="openPreview(item.key)"
            >
              <el-icon :size="14"><View /></el-icon>
            </button>
            <button
              type="button"
              class="icon-action-btn"
              :title="t('settings.aiFeatures.edit')"
              @click="openEdit(item.key)"
            >
              <el-icon :size="14"><Edit /></el-icon>
            </button>
            <button
              type="button"
              class="text-action-btn"
              :disabled="saving"
              @click="resetPrompt(item.key)"
            >
              {{ t('settings.aiFeatures.resetItem') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="activePromptLabel"
      width="640px"
      destroy-on-close
      @close="closeDialog"
    >
      <template v-if="dialogMode === 'preview' && activePromptKey">
        <pre class="dialog-prompt elegant-scroll">{{ promptDrafts[activePromptKey] }}</pre>
      </template>
      <template v-else-if="dialogMode === 'edit'">
        <textarea v-model="editDraft" class="dialog-textarea" rows="14" spellcheck="false" />
      </template>
      <template #footer>
        <button v-if="dialogMode === 'preview'" class="secondary-btn" type="button" @click="closeDialog">
          {{ t('common.close') }}
        </button>
        <template v-else>
          <button class="secondary-btn" type="button" :disabled="saving" @click="closeDialog">
            {{ t('common.cancel') }}
          </button>
          <button class="primary-btn" type="button" :disabled="saving" @click="applyEdit">
            {{ saving ? t('settings.aiFeatures.saving') : t('common.save') }}
          </button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-desc {
  margin: 0 0 var(--spacing-lg);
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}

.setting-card {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
}

.category-title {
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--content-text);
}

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  transition: border-color 0.15s;
}

.prompt-row:hover {
  border-color: var(--composer-border-focus);
}

.prompt-main {
  min-width: 0;
  flex: 1;
}

.prompt-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--content-text);
}

.prompt-desc {
  margin-top: 2px;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.prompt-preview {
  margin-top: 6px;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.prompt-row:hover .prompt-actions {
  opacity: 1;
}

.icon-action-btn,
.text-action-btn {
  border: none;
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background 0.15s, color 0.15s;
}

.icon-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.icon-action-btn:hover,
.text-action-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.text-action-btn {
  padding: 4px 8px;
  font-size: var(--font-size-xs);
}

.text-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-prompt {
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 420px;
  overflow: auto;
}

.dialog-textarea {
  width: 100%;
  min-height: 280px;
  padding: 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.dialog-textarea:focus {
  outline: none;
  border-color: var(--composer-border-focus);
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
