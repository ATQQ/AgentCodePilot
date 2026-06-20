<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@renderer/stores/settings.store'
import {
  getDefaultExternalAppsForSettings,
  getExternalAppProtocolHint,
  isBuiltinAppVisible
} from '@renderer/constants/externalApps'
import ExternalAppIcon from '@renderer/components/common/ExternalAppIcon.vue'
import type { ExternalAppDefinition } from '@renderer/types'
import { isWindowsPlatform } from '@renderer/utils/externalAppIcons'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const customName = ref('')
const customProtocol = ref('')
const customIconUrl = ref('')
const customIconSvg = ref('')
const saving = ref(false)
const editingCustomId = ref<string | null>(null)
const editIconUrl = ref('')
const editIconSvg = ref('')

const runtimePlatform = computed((): 'win32' | 'darwin' =>
  isWindowsPlatform() ? 'win32' : 'darwin'
)

const allApps = computed(() =>
  getDefaultExternalAppsForSettings(settingsStore.externalApps, runtimePlatform.value)
)

function formatProtocolHint(app: ExternalAppDefinition): string {
  const hint = getExternalAppProtocolHint(app)
  if (!hint) return ''
  if (hint === 'showItemInFolder') return t('settings.externalApps.protocolHintReveal')
  if (hint === 'system-terminal') return t('settings.externalApps.protocolHintTerminal')
  return hint
}

function isAppVisible(app: ExternalAppDefinition): boolean {
  if (!app.builtin) return true
  return isBuiltinAppVisible(app.id, settingsStore.externalApps)
}

onMounted(async () => {
  await settingsStore.fetchSettings()
})

async function setDefault(appId: string): Promise<void> {
  saving.value = true
  try {
    await settingsStore.setDefaultExternalApp(appId)
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function toggleVisibility(app: ExternalAppDefinition, visible: boolean): Promise<void> {
  if (!app.builtin) return
  saving.value = true
  try {
    await settingsStore.toggleBuiltinExternalApp(app.id, visible)
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function addCustom(): Promise<void> {
  saving.value = true
  try {
    await settingsStore.addCustomExternalApp(
      customName.value,
      customProtocol.value,
      customIconUrl.value,
      customIconSvg.value
    )
    customName.value = ''
    customProtocol.value = ''
    customIconUrl.value = ''
    customIconSvg.value = ''
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function removeCustom(id: string): Promise<void> {
  saving.value = true
  try {
    await settingsStore.removeCustomExternalApp(id)
    if (editingCustomId.value === id) editingCustomId.value = null
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

function startEditCustom(app: ExternalAppDefinition): void {
  const custom = settingsStore.externalApps.customApps.find((entry) => entry.id === app.id)
  if (!custom) return
  editingCustomId.value = app.id
  editIconUrl.value = custom.iconUrl ?? ''
  editIconSvg.value = custom.iconSvg ?? ''
}

async function saveCustomIcon(): Promise<void> {
  if (!editingCustomId.value) return
  saving.value = true
  try {
    await settingsStore.updateCustomExternalApp(editingCustomId.value, {
      iconUrl: editIconUrl.value.trim() || undefined,
      iconSvg: editIconSvg.value.trim() || undefined
    })
    editingCustomId.value = null
    ElMessage.success(t('common.saveSuccess'))
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
        <div
          v-for="app in allApps"
          :key="app.id"
          class="app-row"
          :class="{ disabled: app.builtin && !isAppVisible(app) }"
        >
          <label v-if="isAppVisible(app)" class="default-radio">
            <input
              type="radio"
              name="defaultExternalApp"
              :value="app.id"
              :checked="settingsStore.getResolvedDefaultAppId() === app.id"
              :disabled="saving"
              @change="setDefault(app.id)"
            />
          </label>
          <span v-else class="default-radio-spacer" />

          <ExternalAppIcon
            :app-id="app.id"
            :icon-url="app.iconUrl"
            :icon-svg="app.iconSvg"
            :size="20"
          />

          <div class="app-meta">
            <div class="app-name-row">
              <span class="app-name">{{ app.name }}</span>
              <span v-if="app.builtin" class="app-badge">{{
                t('settings.externalApps.builtin')
              }}</span>
            </div>
            <code v-if="formatProtocolHint(app)" class="app-protocol">{{
              formatProtocolHint(app)
            }}</code>
          </div>

          <label
            v-if="app.builtin"
            class="visibility-toggle"
            :title="t('settings.externalApps.visibility')"
          >
            <input
              type="checkbox"
              :checked="isAppVisible(app)"
              :disabled="saving"
              @change="toggleVisibility(app, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('settings.externalApps.showInMenu') }}</span>
          </label>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <h2 class="section-subtitle">{{ t('settings.externalApps.customTitle') }}</h2>
      <p class="section-desc">{{ t('settings.externalApps.customDesc') }}</p>

      <div v-if="settingsStore.externalApps.customApps.length" class="custom-list">
        <div v-for="app in settingsStore.externalApps.customApps" :key="app.id" class="custom-row">
          <ExternalAppIcon
            :app-id="app.id"
            :icon-url="app.iconUrl"
            :icon-svg="app.iconSvg"
            :size="20"
          />
          <div class="custom-meta">
            <div class="custom-name">{{ app.name }}</div>
            <div class="custom-protocol">{{ app.protocol }}</div>
          </div>
          <div class="custom-actions">
            <button
              class="ghost-btn"
              type="button"
              :disabled="saving"
              @click="startEditCustom({ ...app, kind: 'protocol', builtin: false })"
            >
              {{ t('settings.externalApps.editIcon') }}
            </button>
            <button
              class="danger-btn"
              type="button"
              :disabled="saving"
              @click="removeCustom(app.id)"
            >
              {{ t('settings.externalApps.remove') }}
            </button>
          </div>
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
          class="text-input"
          :placeholder="t('settings.externalApps.protocolPlaceholder')"
        />
        <input
          v-model="customIconUrl"
          class="text-input"
          :placeholder="t('settings.externalApps.iconUrlPlaceholder')"
        />
        <textarea
          v-model="customIconSvg"
          class="text-area"
          rows="2"
          :placeholder="t('settings.externalApps.iconSvgPlaceholder')"
        />
        <button
          class="primary-btn add-btn"
          type="button"
          :disabled="saving || !customName.trim() || !customProtocol.includes('{path}')"
          @click="addCustom"
        >
          {{ t('settings.externalApps.add') }}
        </button>
      </div>
    </div>

    <el-dialog
      v-if="editingCustomId"
      :model-value="true"
      :title="t('settings.externalApps.editIconTitle')"
      width="520px"
      destroy-on-close
      @close="editingCustomId = null"
    >
      <div class="icon-edit-form">
        <label class="field-label">{{ t('settings.externalApps.iconUrlPlaceholder') }}</label>
        <input v-model="editIconUrl" class="text-input" />
        <label class="field-label">{{ t('settings.externalApps.iconSvgPlaceholder') }}</label>
        <textarea v-model="editIconSvg" class="text-area" rows="4" spellcheck="false" />
      </div>
      <template #footer>
        <button class="ghost-btn" type="button" @click="editingCustomId = null">
          {{ t('common.cancel') }}
        </button>
        <button class="primary-btn" type="button" :disabled="saving" @click="saveCustomIcon">
          {{ t('common.save') }}
        </button>
      </template>
    </el-dialog>
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
  gap: 6px;
}

.app-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
}

.app-row.disabled {
  opacity: 0.55;
}

.default-radio,
.default-radio-spacer {
  width: 16px;
  flex-shrink: 0;
}

.app-meta {
  min-width: 0;
  flex: 1;
}

.app-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-name {
  font-size: var(--font-size-sm);
  color: var(--content-text);
}

.app-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--sidebar-item-hover);
  font-size: 10px;
  color: var(--content-text-tertiary);
}

.app-protocol {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--content-text-tertiary);
  word-break: break-all;
}

.visibility-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  cursor: pointer;
  white-space: nowrap;
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
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
}

.custom-meta {
  min-width: 0;
  flex: 1;
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

.custom-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.add-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.text-input,
.text-area {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--btn-secondary-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
  box-sizing: border-box;
}

.text-area {
  grid-column: 1 / -1;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.add-btn {
  grid-column: 1 / -1;
  justify-self: start;
}

.text-input:focus,
.text-area:focus {
  border-color: var(--composer-border-focus);
}

.primary-btn,
.danger-btn,
.ghost-btn {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.primary-btn {
  border: none;
  background: var(--accent-color);
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost-btn {
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
}

.danger-btn {
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
}

.danger-btn:hover:not(:disabled) {
  color: #dc2626;
  border-color: #dc2626;
}

.icon-edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}
</style>
