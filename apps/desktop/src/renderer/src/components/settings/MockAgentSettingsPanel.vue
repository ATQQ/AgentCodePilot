<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { DEFAULT_MOCK_AGENT_CONFIG, resolveMockAgentConfig } from '@renderer/constants/mock-agent'

const { t } = useI18n()

const draftDelayMs = ref(DEFAULT_MOCK_AGENT_CONFIG.initialDelayMs)
const draftResponses = ref<string[]>([...DEFAULT_MOCK_AGENT_CONFIG.responses])
const saving = ref(false)
const expandedIndex = ref(0)

async function loadConfig(): Promise<void> {
  const config = await window.agentAPI.agents.getConfig('mock')
  const resolved = resolveMockAgentConfig(config.mock)
  draftDelayMs.value = resolved.initialDelayMs
  draftResponses.value = resolved.responses.map((item) => item)
}

onMounted(() => {
  void loadConfig()
})

function addResponse(): void {
  draftResponses.value.push('## Mock Response\n\n自定义 Markdown 内容')
  expandedIndex.value = draftResponses.value.length - 1
}

function removeResponse(index: number): void {
  if (draftResponses.value.length <= 1) return
  draftResponses.value.splice(index, 1)
  if (expandedIndex.value >= draftResponses.value.length) {
    expandedIndex.value = draftResponses.value.length - 1
  }
}

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    const responses = draftResponses.value.map((item) => item.trim()).filter(Boolean)
    await window.agentAPI.agents.updateConfig('mock', {
      mock: {
        initialDelayMs: Math.max(0, draftDelayMs.value),
        responses: responses.length > 0 ? responses : DEFAULT_MOCK_AGENT_CONFIG.responses
      }
    })
    await loadConfig()
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function resetConfig(): Promise<void> {
  saving.value = true
  try {
    await window.agentAPI.agents.updateConfig('mock', {
      mock: {
        initialDelayMs: DEFAULT_MOCK_AGENT_CONFIG.initialDelayMs,
        responses: [...DEFAULT_MOCK_AGENT_CONFIG.responses]
      }
    })
    await loadConfig()
    ElMessage.success(t('settings.agentConfig.resetSuccess'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mock-settings">
    <div class="setting-card">
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.agentConfig.mock.initialDelay') }}</div>
          <div class="setting-desc">{{ t('settings.agentConfig.mock.initialDelayDesc') }}</div>
        </div>
        <div class="delay-input-wrap">
          <input
            v-model.number="draftDelayMs"
            type="number"
            min="0"
            step="100"
            class="delay-input"
          />
          <span class="delay-unit">ms</span>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.agentConfig.mock.responses') }}</div>
          <div class="setting-desc">{{ t('settings.agentConfig.mock.responsesDesc') }}</div>
        </div>
        <button class="ghost-btn" type="button" @click="addResponse">
          {{ t('settings.agentConfig.mock.addResponse') }}
        </button>
      </div>

      <div class="response-list">
        <div v-for="(response, index) in draftResponses" :key="index" class="response-item">
          <div class="response-header">
            <button
              type="button"
              class="response-toggle"
              @click="expandedIndex = expandedIndex === index ? -1 : index"
            >
              <span>{{ t('settings.agentConfig.mock.responseItem', { index: index + 1 }) }}</span>
              <span class="response-preview">{{ response.trim().slice(0, 48) || '…' }}</span>
            </button>
            <button
              v-if="draftResponses.length > 1"
              type="button"
              class="icon-btn"
              @click="removeResponse(index)"
            >
              ×
            </button>
          </div>
          <textarea
            v-if="expandedIndex === index"
            v-model="draftResponses[index]"
            class="response-textarea"
            rows="12"
            spellcheck="false"
          />
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="primary-btn" type="button" :disabled="saving" @click="saveConfig">
        {{ t('common.save') }}
      </button>
      <button class="ghost-btn" type="button" :disabled="saving" @click="resetConfig">
        {{ t('settings.agentConfig.reset') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mock-settings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
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

.delay-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.delay-input {
  width: 100px;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
}

.delay-unit {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.response-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.response-item {
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.response-header {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--btn-secondary-bg);
}

.response-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.response-preview {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.response-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  border: none;
  border-top: 1px solid var(--sidebar-border);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.response-textarea:focus {
  outline: none;
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
  width: 28px;
  height: 28px;
  background: transparent;
  color: var(--content-text-secondary);
}

.actions {
  display: flex;
  gap: var(--spacing-sm);
}
</style>
