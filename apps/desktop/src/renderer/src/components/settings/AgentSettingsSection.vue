<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModelStore } from '@renderer/stores/model.store'
import type { AgentModelOption, ModelCatalogSource } from '@renderer/types'

const { t } = useI18n()
const modelStore = useModelStore()

const draftDefaultModelId = ref('')
const draftModels = ref<AgentModelOption[]>([])
const useCustomModels = ref(false)
const saving = ref(false)

const sourceLabel = computed(() => {
  const map: Record<ModelCatalogSource, string> = {
    sdk: t('settings.agentConfig.sourceSdk'),
    'claude-settings': t('settings.agentConfig.sourceClaudeSettings'),
    'app-config': t('settings.agentConfig.sourceAppConfig'),
    fallback: t('settings.agentConfig.sourceFallback')
  }
  return map[modelStore.discoveredSource] ?? map.fallback
})

function syncDraftFromStore(): void {
  draftDefaultModelId.value = modelStore.defaultModelId
  useCustomModels.value = modelStore.catalogSource === 'app-config'
  draftModels.value = useCustomModels.value
    ? modelStore.models.map((model) => ({ ...model }))
    : modelStore.discoveredModels.map((model) => ({ ...model }))
}

onMounted(async () => {
  await modelStore.fetchCatalog('claude-code', true)
  syncDraftFromStore()
})

function toggleCustomModels(enabled: boolean): void {
  useCustomModels.value = enabled
  draftModels.value = (enabled ? modelStore.models : modelStore.discoveredModels).map((model) => ({
    ...model
  }))
}

function addModelRow(): void {
  draftModels.value.push({ id: '', name: '', description: '' })
}

function removeModelRow(index: number): void {
  draftModels.value.splice(index, 1)
}

async function refreshDiscovered(): Promise<void> {
  await modelStore.fetchCatalog('claude-code', true)
  syncDraftFromStore()
}

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    const models = useCustomModels.value
      ? draftModels.value
          .filter((model) => model.id.trim() && model.name.trim())
          .map((model) => ({
            id: model.id.trim(),
            name: model.name.trim(),
            description: model.description?.trim() || undefined
          }))
      : []

    await modelStore.saveAgentConfig({
      defaultModelId: draftDefaultModelId.value,
      models
    })
    syncDraftFromStore()
  } finally {
    saving.value = false
  }
}

async function resetConfig(): Promise<void> {
  saving.value = true
  try {
    await modelStore.resetToDiscovered()
    syncDraftFromStore()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="agent-settings">
    <h1 class="page-title">{{ t('settings.agentConfig.title') }}</h1>
    <p class="page-desc">{{ t('settings.agentConfig.desc') }}</p>

    <div class="setting-card">
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.agentConfig.discoveredSource') }}</div>
          <div class="setting-desc">{{ sourceLabel }}</div>
        </div>
        <button class="ghost-btn" :disabled="modelStore.loading" @click="refreshDiscovered">
          {{ t('settings.agentConfig.refresh') }}
        </button>
      </div>

      <div class="discovered-list">
        <div v-for="model in modelStore.discoveredModels" :key="model.id" class="discovered-item">
          <div class="discovered-name">{{ model.name }}</div>
          <div class="discovered-meta">{{ model.id }}</div>
          <div v-if="model.description" class="discovered-desc">{{ model.description }}</div>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.agentConfig.defaultModel') }}</div>
          <div class="setting-desc">{{ t('settings.agentConfig.defaultModelDesc') }}</div>
        </div>
        <select v-model="draftDefaultModelId" class="model-select">
          <option
            v-for="model in (useCustomModels ? draftModels : modelStore.discoveredModels)"
            :key="model.id"
            :value="model.id"
          >
            {{ model.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.agentConfig.customModels') }}</div>
          <div class="setting-desc">{{ t('settings.agentConfig.customModelsDesc') }}</div>
        </div>
        <el-switch :model-value="useCustomModels" @change="toggleCustomModels($event as boolean)" />
      </div>

      <div v-if="useCustomModels" class="custom-models">
        <div v-for="(model, index) in draftModels" :key="index" class="custom-model-row">
          <input v-model="model.id" class="field-input" :placeholder="t('settings.agentConfig.modelId')" />
          <input v-model="model.name" class="field-input" :placeholder="t('settings.agentConfig.modelName')" />
          <input
            v-model="model.description"
            class="field-input field-input--wide"
            :placeholder="t('settings.agentConfig.modelDescription')"
          />
          <button class="icon-btn" @click="removeModelRow(index)">×</button>
        </div>
        <button class="ghost-btn" @click="addModelRow">{{ t('settings.agentConfig.addModel') }}</button>
      </div>
    </div>

    <div class="actions">
      <button class="primary-btn" :disabled="saving" @click="saveConfig">
        {{ t('common.save') }}
      </button>
      <button class="ghost-btn" :disabled="saving" @click="resetConfig">
        {{ t('settings.agentConfig.reset') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.agent-settings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--content-text);
}

.page-desc {
  margin: -8px 0 0;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}

.setting-card {
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.setting-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.setting-desc {
  margin-top: 4px;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.discovered-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.discovered-item {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--btn-ghost-hover);
}

.discovered-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.discovered-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--content-text-tertiary);
}

.discovered-desc {
  margin-top: 4px;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.model-select,
.field-input {
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  padding: 8px 10px;
}

.model-select {
  min-width: 180px;
}

.custom-models {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.custom-model-row {
  display: grid;
  grid-template-columns: 120px 140px 1fr 32px;
  gap: var(--spacing-sm);
  align-items: center;
}

.field-input--wide {
  min-width: 0;
}

.icon-btn,
.ghost-btn,
.primary-btn {
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.ghost-btn {
  padding: 8px 12px;
  background: var(--btn-ghost-hover);
  color: var(--content-text-secondary);
}

.primary-btn {
  padding: 8px 14px;
  background: var(--accent-color);
  color: white;
}

.icon-btn {
  width: 32px;
  height: 32px;
  background: transparent;
  color: var(--content-text-secondary);
}

.actions {
  display: flex;
  gap: var(--spacing-sm);
}
</style>
