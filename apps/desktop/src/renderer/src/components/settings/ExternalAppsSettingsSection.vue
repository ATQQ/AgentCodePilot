<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@renderer/stores/settings.store'
import {
  getDefaultExternalAppsForSettings,
  getExternalAppProtocolHint,
  getBuiltinReferenceApps,
  getPlatformBuiltinApps
} from '@renderer/constants/externalApps'
import type { ExternalAppDefinition } from '@renderer/types'
import { isWindowsPlatform } from '@renderer/utils/externalAppIcons'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const customName = ref('')
const customProtocol = ref('')
const saving = ref(false)

const runtimePlatform = computed(() => (isWindowsPlatform() ? 'win32' : 'darwin') as NodeJS.Platform)

const platformApps = computed(() => getPlatformBuiltinApps(runtimePlatform.value))

const builtinReferenceApps = computed(() => getBuiltinReferenceApps(runtimePlatform.value))

const allApps = computed(() =>
  getDefaultExternalAppsForSettings(settingsStore.externalApps, runtimePlatform.value)
)

function formatProtocolHint(app: ExternalAppDefinition): string {
  const hint = getExternalAppProtocolHint(app)
  if (!hint) return t('settings.externalApps.builtin')
  if (hint === 'showItemInFolder') return t('settings.externalApps.protocolHintReveal')
  if (hint === 'system-terminal') return t('settings.externalApps.protocolHintTerminal')
  return hint
}

onMounted(async () => {
  await settingsStore.fetchSettings()
})

async function setDefault(appId: string): Promise<void> {
  saving.value = true
  try {
    await settingsStore.setDefaultExternalApp(appId)
  } finally {
    saving.value = false
  }
}

async function addCustom(): Promise<void> {
  saving.value = true
  try {
    await settingsStore.addCustomExternalApp(customName.value, customProtocol.value)
    customName.value = ''
    customProtocol.value = ''
  } finally {
    saving.value = false
  }
}

async function removeCustom(id: string): Promise<void> {
  saving.value = true
  try {
    await settingsStore.removeCustomExternalApp(id)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="content-section">
    <h1 class="page-title">{{ t('settings.externalApps.title') }}</h1>
    <p class="page-desc">{{ t('settings.externalApps.desc') }}</p>

    <div class="setting-card">
      <h2 class="section-subtitle">{{ t('settings.externalApps.defaultTitle') }}</h2>
      <p class="section-desc">{{ t('settings.externalApps.defaultDesc') }}</p>

      <div class="app-list">
        <label
          v-for="app in allApps"
          :key="app.id"
          class="app-row"
        >
          <input
            type="radio"
            name="defaultExternalApp"
            :value="app.id"
            :checked="settingsStore.getResolvedDefaultAppId() === app.id"
            :disabled="saving"
            @change="setDefault(app.id)"
          />
          <span class="app-name">{{ app.name }}</span>
          <span class="app-tag">{{ formatProtocolHint(app) }}</span>
        </label>
      </div>
    </div>

    <div class="setting-card">
      <h2 class="section-subtitle">{{ t('settings.externalApps.builtinProtocolsTitle') }}</h2>
      <p class="section-desc">{{ t('settings.externalApps.builtinProtocolsDesc') }}</p>

      <div class="builtin-protocol-list">
        <div
          v-for="app in builtinReferenceApps"
          :key="app.id"
          class="builtin-protocol-row"
        >
          <span class="builtin-protocol-name">{{ app.name }}</span>
          <code class="builtin-protocol-value">{{ formatProtocolHint(app) }}</code>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <h2 class="section-subtitle">{{ t('settings.externalApps.customTitle') }}</h2>
      <p class="section-desc">{{ t('settings.externalApps.customDesc') }}</p>

      <div class="builtin-hint">
        {{ t('settings.externalApps.builtinHint', { apps: platformApps.map((a) => a.name).join('、') }) }}
      </div>

      <div v-if="settingsStore.externalApps.customApps.length" class="custom-list">
        <div
          v-for="app in settingsStore.externalApps.customApps"
          :key="app.id"
          class="custom-row"
        >
          <div class="custom-meta">
            <div class="custom-name">{{ app.name }}</div>
            <div class="custom-protocol">{{ app.protocol }}</div>
          </div>
          <button class="danger-btn" type="button" :disabled="saving" @click="removeCustom(app.id)">
            {{ t('settings.externalApps.remove') }}
          </button>
        </div>
      </div>

      <div class="add-form">
        <input
          v-model="customName"
          class="text-input"
          :placeholder="t('settings.externalApps.namePlaceholder')"
        />
        <input
          v-model="customProtocol"
          class="text-input protocol-input"
          :placeholder="t('settings.externalApps.protocolPlaceholder')"
        />
        <button
          class="primary-btn"
          type="button"
          :disabled="saving || !customName.trim() || !customProtocol.includes('{path}')"
          @click="addCustom"
        >
          {{ t('settings.externalApps.add') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-desc,
.section-desc {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
  margin: -8px 0 var(--spacing-md);
}

.section-subtitle {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--content-text);
  margin: 0 0 4px;
}

.setting-card {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
}

.app-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  cursor: pointer;
}

.app-name {
  font-size: var(--font-size-sm);
  color: var(--content-text);
  flex-shrink: 0;
}

.app-tag {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.builtin-protocol-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.builtin-protocol-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
}

.builtin-protocol-name {
  flex-shrink: 0;
  font-size: var(--font-size-sm);
  color: var(--content-text);
}

.builtin-protocol-value {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  word-break: break-all;
  text-align: right;
}

.builtin-hint {
  margin-bottom: var(--spacing-md);
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  line-height: 1.5;
}

.custom-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: var(--spacing-md);
}

.custom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
}

.custom-name {
  font-size: var(--font-size-sm);
  color: var(--content-text);
}

.custom-protocol {
  margin-top: 2px;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  word-break: break-all;
}

.add-form {
  display: grid;
  grid-template-columns: 1fr 1.4fr auto;
  gap: 8px;
}

.text-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
}

.text-input:focus {
  border-color: var(--composer-border-focus);
}

.primary-btn,
.danger-btn {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.primary-btn {
  border: none;
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger-btn {
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
  flex-shrink: 0;
}

.danger-btn:hover:not(:disabled) {
  color: #dc2626;
  border-color: #dc2626;
}
</style>
