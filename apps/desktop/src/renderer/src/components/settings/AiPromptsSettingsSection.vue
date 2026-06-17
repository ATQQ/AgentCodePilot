<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@renderer/stores/settings.store'
import {
  DEFAULT_AI_PROMPTS,
  DEFAULT_FILE_PREVIEW
} from '@renderer/constants/defaults'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const commitMessagePrompt = ref('')
const autoCommitPrompt = ref('')
const textExtensionsText = ref('')
const imageExtensionsText = ref('')
const saving = ref(false)

function syncDraft(): void {
  commitMessagePrompt.value = settingsStore.aiPrompts.commitMessage ?? DEFAULT_AI_PROMPTS.commitMessage ?? ''
  autoCommitPrompt.value = settingsStore.aiPrompts.autoCommit ?? DEFAULT_AI_PROMPTS.autoCommit ?? ''
  textExtensionsText.value = settingsStore.extensionsToText(settingsStore.filePreview.textExtensions)
  imageExtensionsText.value = settingsStore.extensionsToText(settingsStore.filePreview.imageExtensions)
}

onMounted(async () => {
  await settingsStore.fetchSettings()
  syncDraft()
})

async function save(): Promise<void> {
  saving.value = true
  try {
    await settingsStore.setAiPrompts({
      commitMessage: commitMessagePrompt.value.trim() || DEFAULT_AI_PROMPTS.commitMessage,
      autoCommit: autoCommitPrompt.value.trim() || DEFAULT_AI_PROMPTS.autoCommit
    })
    await settingsStore.setFilePreview({
      textExtensions: settingsStore.textToExtensions(textExtensionsText.value),
      imageExtensions: settingsStore.textToExtensions(imageExtensionsText.value)
    })
    syncDraft()
  } finally {
    saving.value = false
  }
}

function resetPrompts(): void {
  commitMessagePrompt.value = DEFAULT_AI_PROMPTS.commitMessage ?? ''
  autoCommitPrompt.value = DEFAULT_AI_PROMPTS.autoCommit ?? ''
}

function resetExtensions(): void {
  textExtensionsText.value = settingsStore.extensionsToText(DEFAULT_FILE_PREVIEW.textExtensions)
  imageExtensionsText.value = settingsStore.extensionsToText(DEFAULT_FILE_PREVIEW.imageExtensions)
}
</script>

<template>
  <div class="content-section">
    <h1 class="page-title">{{ t('settings.aiFeatures.title') }}</h1>
    <p class="page-desc">{{ t('settings.aiFeatures.desc') }}</p>

    <div class="setting-card">
      <div class="setting-block">
        <div class="setting-label">{{ t('settings.aiFeatures.commitMessage') }}</div>
        <div class="setting-desc">{{ t('settings.aiFeatures.commitMessageDesc') }}</div>
        <textarea
          v-model="commitMessagePrompt"
          class="prompt-textarea"
          rows="8"
          spellcheck="false"
        />
      </div>

      <div class="setting-block">
        <div class="setting-label">{{ t('settings.aiFeatures.autoCommit') }}</div>
        <div class="setting-desc">{{ t('settings.aiFeatures.autoCommitDesc') }}</div>
        <textarea
          v-model="autoCommitPrompt"
          class="prompt-textarea"
          rows="4"
          spellcheck="false"
        />
      </div>

      <div class="setting-actions">
        <button class="secondary-btn" type="button" @click="resetPrompts">
          {{ t('settings.aiFeatures.resetPrompts') }}
        </button>
      </div>
    </div>

    <div class="setting-card">
      <h2 class="section-subtitle">{{ t('settings.aiFeatures.filePreview') }}</h2>

      <div class="setting-block">
        <div class="setting-label">{{ t('settings.aiFeatures.textExtensions') }}</div>
        <div class="setting-desc">{{ t('settings.aiFeatures.textExtensionsDesc') }}</div>
        <textarea
          v-model="textExtensionsText"
          class="prompt-textarea"
          rows="4"
          spellcheck="false"
        />
      </div>

      <div class="setting-block">
        <div class="setting-label">{{ t('settings.aiFeatures.imageExtensions') }}</div>
        <div class="setting-desc">{{ t('settings.aiFeatures.imageExtensionsDesc') }}</div>
        <textarea
          v-model="imageExtensionsText"
          class="prompt-textarea"
          rows="2"
          spellcheck="false"
        />
      </div>

      <div class="setting-actions">
        <button class="secondary-btn" type="button" @click="resetExtensions">
          {{ t('settings.aiFeatures.resetExtensions') }}
        </button>
      </div>
    </div>

    <div class="footer-actions">
      <button class="primary-btn" type="button" :disabled="saving" @click="save">
        {{ saving ? t('settings.aiFeatures.saving') : t('settings.aiFeatures.save') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.page-desc {
  margin: 0 0 var(--spacing-lg);
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}

.section-subtitle {
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--content-text);
}

.setting-block {
  margin-bottom: var(--spacing-md);
}

.setting-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--content-text);
  margin-bottom: 4px;
}

.setting-desc {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.prompt-textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.prompt-textarea:focus {
  outline: none;
  border-color: var(--composer-border-focus);
}

.setting-actions {
  display: flex;
  gap: var(--spacing-sm);
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

.footer-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-md);
}
</style>
