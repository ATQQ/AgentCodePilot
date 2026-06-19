<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { getAgentIcon } from '@renderer/utils/agentIcons'
import {
  DEFAULT_MAX_AGENT_TURNS,
  MIN_MAX_AGENT_TURNS,
  MAX_MAX_AGENT_TURNS,
  clampMaxAgentTurns
} from '../../../../shared/agent-run-settings'
import MockAgentSettingsPanel from '@renderer/components/settings/MockAgentSettingsPanel.vue'
import type { AgentModelOption, ModelCatalogSource, ReplyLanguage } from '@renderer/types'

const { t } = useI18n()
const agentStore = useAgentStore()
const settingsStore = useSettingsStore()

const draftMaxTurns = ref(DEFAULT_MAX_AGENT_TURNS)
const draftReplyLanguage = ref<ReplyLanguage>('auto')

const REPLY_LANGUAGE_OPTIONS: { value: ReplyLanguage; labelKey: string }[] = [
  { value: 'auto', labelKey: 'settings.agentConfig.replyLanguageAuto' },
  { value: 'zh-CN', labelKey: 'settings.agentConfig.replyLanguageZhCN' },
  { value: 'en', labelKey: 'settings.agentConfig.replyLanguageEn' },
  { value: 'ja', labelKey: 'settings.agentConfig.replyLanguageJa' },
  { value: 'ko', labelKey: 'settings.agentConfig.replyLanguageKo' }
]

const activeAgentId = ref('')
const loading = ref(false)
const saving = ref(false)

const draftDefaultModelId = ref('')
const draftModels = ref<AgentModelOption[]>([])
const useCustomModels = ref(false)
const discoveredModels = ref<AgentModelOption[]>([])
const discoveredSource = ref<ModelCatalogSource>('fallback')

const configurableAgents = computed(() => agentStore.agents.filter((agent) => agent.enabled))

const supportsModelConfig = computed(() => activeAgentId.value === 'claude-code')
const supportsMockConfig = computed(() => activeAgentId.value === 'mock')

const sourceLabel = computed(() => {
  const map: Record<ModelCatalogSource, string> = {
    sdk: t('settings.agentConfig.sourceSdk'),
    'claude-settings': t('settings.agentConfig.sourceClaudeSettings'),
    'app-config': t('settings.agentConfig.sourceAppConfig'),
    fallback: t('settings.agentConfig.sourceFallback')
  }
  return map[discoveredSource.value] ?? map.fallback
})

function syncDraftFromCatalog(catalog: {
  models: AgentModelOption[]
  discoveredModels: AgentModelOption[]
  defaultModelId: string
  source: ModelCatalogSource
  discoveredSource: ModelCatalogSource
}): void {
  draftDefaultModelId.value = catalog.defaultModelId
  useCustomModels.value = catalog.source === 'app-config'
  discoveredModels.value = catalog.discoveredModels
  discoveredSource.value = catalog.discoveredSource
  draftModels.value = useCustomModels.value
    ? catalog.models.map((model) => ({ ...model }))
    : catalog.discoveredModels.map((model) => ({ ...model }))
}

async function loadAgent(agentId: string): Promise<void> {
  if (!agentId || agentId === 'mock') return
  loading.value = true
  try {
    const catalog = await window.agentAPI.agents.listModels(agentId, true)
    syncDraftFromCatalog(catalog)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await settingsStore.fetchSettings()
  draftMaxTurns.value = settingsStore.maxAgentTurns
  draftReplyLanguage.value = settingsStore.replyLanguage
  await agentStore.fetchAgents()
  activeAgentId.value = configurableAgents.value[0]?.id ?? 'claude-code'
  if (activeAgentId.value) {
    await loadAgent(activeAgentId.value)
  }
})

async function saveMaxTurns(): Promise<void> {
  const next = clampMaxAgentTurns(draftMaxTurns.value)
  draftMaxTurns.value = next
  await settingsStore.setMaxAgentTurns(next)
}

async function saveReplyLanguage(): Promise<void> {
  await settingsStore.setReplyLanguage(draftReplyLanguage.value)
}

watch(activeAgentId, (agentId) => {
  if (agentId) void loadAgent(agentId)
})

function toggleCustomModels(enabled: boolean): void {
  useCustomModels.value = enabled
  draftModels.value = (enabled ? draftModels.value : discoveredModels.value).map((model) => ({
    ...model
  }))
  if (!enabled && !discoveredModels.value.some((model) => model.id === draftDefaultModelId.value)) {
    draftDefaultModelId.value = discoveredModels.value[0]?.id ?? draftDefaultModelId.value
  }
}

function addModelRow(): void {
  draftModels.value.push({ id: '', name: '', description: '' })
}

function removeModelRow(index: number): void {
  draftModels.value.splice(index, 1)
}

async function refreshDiscovered(): Promise<void> {
  await loadAgent(activeAgentId.value)
}

async function saveConfig(): Promise<void> {
  if (!supportsModelConfig.value) return
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

    const catalog = await window.agentAPI.agents.updateConfig(activeAgentId.value, {
      defaultModelId: draftDefaultModelId.value,
      models
    })
    syncDraftFromCatalog(catalog)
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function resetConfig(): Promise<void> {
  if (!supportsModelConfig.value) return
  saving.value = true
  try {
    const config = await window.agentAPI.agents.getConfig(activeAgentId.value)
    const catalog = await window.agentAPI.agents.updateConfig(activeAgentId.value, {
      defaultModelId: config.defaultModelId,
      models: []
    })
    syncDraftFromCatalog(catalog)
    ElMessage.success(t('settings.agentConfig.resetSuccess'))
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
          <div class="setting-label">{{ t('settings.agentConfig.replyLanguage') }}</div>
          <div class="setting-desc">{{ t('settings.agentConfig.replyLanguageDesc') }}</div>
        </div>
        <select v-model="draftReplyLanguage" class="model-select" @change="saveReplyLanguage">
          <option v-for="opt in REPLY_LANGUAGE_OPTIONS" :key="opt.value" :value="opt.value">
            {{ t(opt.labelKey) }}
          </option>
        </select>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.agentConfig.maxTurns') }}</div>
          <div class="setting-desc">
            {{ t('settings.agentConfig.maxTurnsDesc', { min: MIN_MAX_AGENT_TURNS, max: MAX_MAX_AGENT_TURNS, default: DEFAULT_MAX_AGENT_TURNS }) }}
          </div>
        </div>
        <input
          v-model.number="draftMaxTurns"
          type="number"
          class="turns-input"
          :min="MIN_MAX_AGENT_TURNS"
          :max="MAX_MAX_AGENT_TURNS"
          step="1"
          @change="saveMaxTurns"
        />
      </div>
    </div>

    <div v-if="configurableAgents.length" class="agent-tabs">
      <button
        v-for="agent in configurableAgents"
        :key="agent.id"
        class="agent-tab"
        :class="{ active: activeAgentId === agent.id }"
        @click="activeAgentId = agent.id"
      >
        <img :src="getAgentIcon(agent.id)" class="agent-tab-icon" width="16" height="16" alt="" />
        <span>{{ agent.name }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading-hint">{{ t('common.loading') }}</div>

    <template v-else-if="supportsModelConfig">
      <div class="setting-card">
        <div class="setting-row">
          <div>
            <div class="setting-label">{{ t('settings.agentConfig.discoveredSource') }}</div>
            <div class="setting-desc">{{ sourceLabel }}</div>
          </div>
          <button class="ghost-btn" :disabled="loading" @click="refreshDiscovered">
            {{ t('settings.agentConfig.refresh') }}
          </button>
        </div>

        <div class="discovered-list">
          <div v-for="model in discoveredModels" :key="model.id" class="discovered-item">
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
              v-for="model in useCustomModels ? draftModels : discoveredModels"
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
          <button
            type="button"
            class="toggle-switch"
            :class="{ active: useCustomModels }"
            role="switch"
            :aria-checked="useCustomModels"
            @click="toggleCustomModels(!useCustomModels)"
          />
        </div>

        <div v-if="useCustomModels" class="custom-models">
          <div v-for="(model, index) in draftModels" :key="index" class="custom-model-row">
            <input
              v-model="model.id"
              class="field-input"
              :placeholder="t('settings.agentConfig.modelId')"
            />
            <input
              v-model="model.name"
              class="field-input"
              :placeholder="t('settings.agentConfig.modelName')"
            />
            <input
              v-model="model.description"
              class="field-input field-input--wide"
              :placeholder="t('settings.agentConfig.modelDescription')"
            />
            <button class="icon-btn" @click="removeModelRow(index)">×</button>
          </div>
          <button class="ghost-btn" @click="addModelRow">
            {{ t('settings.agentConfig.addModel') }}
          </button>
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
    </template>

    <MockAgentSettingsPanel v-else-if="supportsMockConfig" />

    <div v-else class="setting-card empty-state">
      <p>{{ t('settings.agentConfig.noConfig', { agent: activeAgentId }) }}</p>
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

.agent-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--btn-secondary-bg);
}

.agent-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.agent-tab:hover {
  color: var(--content-text);
}

.agent-tab.active {
  background: var(--content-bg);
  color: var(--content-text);
  box-shadow: var(--shadow-sm);
}

.agent-tab-icon {
  border-radius: 50%;
  flex-shrink: 0;
}

.loading-hint {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
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
  background: var(--btn-secondary-bg);
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
  background: var(--btn-secondary-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  padding: 8px 10px;
}

.model-select {
  min-width: 180px;
}

.turns-input {
  width: 96px;
  text-align: center;
}

.custom-models {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--sidebar-border);
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

.toggle-switch {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 11px;
  background: var(--sidebar-border);
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--content-bg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s;
}

.toggle-switch.active {
  background: var(--accent-color);
}

.toggle-switch.active::after {
  transform: translateX(18px);
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
  background: var(--btn-secondary-bg);
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

.empty-state {
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}
</style>
