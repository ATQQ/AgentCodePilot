<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, Plus } from '@element-plus/icons-vue'
import type {
  GatewayLogViewerStatus,
  GatewayProviderPublicPayload,
  GatewaySettingsPayload,
  GatewayTakeoverApp,
  GatewayTakeoverStatus,
  ProviderConfigPayload,
  ProviderTestResultPayload
} from '../../../../preload/types'

type GatewayTab = 'service' | 'providers' | 'claudeCli' | 'claudeDesktop' | 'codex'

const { t } = useI18n()

const loading = ref(true)
const saving = ref(false)
const activeTab = ref<GatewayTab>('service')
const settings = ref<GatewaySettingsPayload | null>(null)
const status = reactive({ running: false, host: '127.0.0.1', port: 3456, token: '' })
const takeover = ref<GatewayTakeoverStatus | null>(null)
const providers = ref<GatewayProviderPublicPayload[]>([])
const presets = ref<ProviderConfigPayload[]>([])
const logViewer = ref<GatewayLogViewerStatus | null>(null)

const editing = ref(false)
const testingIds = ref<Record<string, boolean>>({})
const testingDraft = ref(false)
const form = reactive({
  id: '',
  name: '',
  modelsText: '',
  defaultModel: '',
  openaiEnabled: true,
  openaiBaseUrl: '',
  openaiApiKey: '',
  anthropicEnabled: false,
  anthropicBaseUrl: '',
  anthropicApiKey: ''
})

type WireProtocol = 'openai-chat' | 'anthropic'

const ALL_CHANNEL_PROTOCOLS: WireProtocol[] = ['openai-chat', 'anthropic']

function protocolLabel(protocol: WireProtocol): string {
  return protocol === 'anthropic' ? 'Anthropic Messages' : 'OpenAI Chat'
}

function availableProtocols(provider: GatewayProviderPublicPayload): WireProtocol[] {
  const keys = Object.keys(provider.config.protocols || {}) as WireProtocol[]
  if (keys.length) return keys.filter((k) => provider.config.protocols[k]?.baseUrl)
  return provider.config.baseUrl ? [provider.config.adapter] : []
}

function channelProtocol(channel: GatewayTakeoverApp): WireProtocol {
  const bound = settings.value?.channelProtocols?.[channel]
  if (bound === 'openai-chat' || bound === 'anthropic') return bound
  if (channel === 'codex') return 'openai-chat'
  return 'anthropic'
}
const baseUrlDisplay = computed(() => {
  if (!settings.value) return ''
  return `http://${settings.value.host}:${settings.value.port}`
})

const channelTabs = computed(() => [
  {
    key: 'claudeCli' as const,
    label: t('settings.gateway.takeoverClaudeCli'),
    enabled: Boolean(takeover.value?.claudeCli),
    disabled: false
  },
  {
    key: 'claudeDesktop' as const,
    label: t('settings.gateway.takeoverClaudeDesktop'),
    enabled: Boolean(takeover.value?.claudeDesktop),
    disabled: !takeover.value?.claudeDesktopSupported
  },
  {
    key: 'codex' as const,
    label: t('settings.gateway.takeoverCodex'),
    enabled: Boolean(takeover.value?.codex),
    disabled: false
  }
])

function backedUpAt(app: 'claude' | 'claude-desktop' | 'codex'): string {
  return takeover.value?.backedUpAt?.[app] || ''
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [gwSettings, gwStatus, gwTakeover, list, presetList, viewer] = await Promise.all([
      window.agentAPI.gateway.getSettings(),
      window.agentAPI.gateway.status(),
      window.agentAPI.gateway.takeoverGet(),
      window.agentAPI.providers.list(),
      window.agentAPI.providers.presets(),
      window.agentAPI.gateway.logViewerStatus()
    ])
    settings.value = gwSettings
    status.running = gwStatus.running
    status.host = gwStatus.host
    status.port = gwStatus.port
    status.token = gwStatus.token
    takeover.value = gwTakeover
    providers.value = list
    presets.value = presetList
    logViewer.value = viewer
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})

async function toggleEnabled(enabled: boolean): Promise<void> {
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({ enabled })
    const gwStatus = await window.agentAPI.gateway.status()
    status.running = gwStatus.running
    status.token = gwStatus.token
    ElMessage.success(enabled ? t('settings.gateway.started') : t('settings.gateway.stopped'))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

async function saveHostPort(): Promise<void> {
  if (!settings.value) return
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({
      host: settings.value.host,
      port: settings.value.port
    })
    const gwStatus = await window.agentAPI.gateway.status()
    status.running = gwStatus.running
    status.host = gwStatus.host
    status.port = gwStatus.port
    status.token = gwStatus.token
    ElMessage.success(t('common.saveSuccess'))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

async function copyToken(): Promise<void> {
  const token = status.token || settings.value?.token || ''
  if (!token) return
  try {
    await navigator.clipboard.writeText(token)
    ElMessage.success(t('settings.gateway.tokenCopied'))
  } catch {
    ElMessage.error(t('settings.gateway.tokenCopyFailed'))
  }
}

async function setTakeover(app: GatewayTakeoverApp, enabled: boolean): Promise<void> {
  saving.value = true
  try {
    takeover.value = await window.agentAPI.gateway.takeoverSet(app, enabled)
    settings.value = await window.agentAPI.gateway.getSettings()
    const gwStatus = await window.agentAPI.gateway.status()
    status.running = gwStatus.running
    status.token = gwStatus.token
    ElMessage.success(
      enabled ? t('settings.gateway.takeoverEnabled') : t('settings.gateway.takeoverDisabled')
    )
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
    await refresh()
  } finally {
    saving.value = false
  }
}

function openCreate(preset?: ProviderConfigPayload): void {
  editing.value = true
  form.id = preset?.id || `provider-${Date.now().toString(36)}`
  form.name = preset?.name || ''
  const protocols =
    (preset?.config.protocols as GatewayProviderPublicPayload['config']['protocols'] | undefined) ||
    undefined
  const legacyAdapter =
    (preset?.config.adapter as WireProtocol | undefined) ||
    (preset?.type === 'anthropic' ? 'anthropic' : 'openai-chat')
  const legacyBase = typeof preset?.config.baseUrl === 'string' ? preset.config.baseUrl : ''
  form.modelsText = Array.isArray(preset?.config.models)
    ? (preset!.config.models as string[]).join(', ')
    : ''
  form.defaultModel =
    typeof preset?.config.defaultModel === 'string' ? preset.config.defaultModel : ''

  const openai = protocols?.['openai-chat']
  const anthropic = protocols?.anthropic
  form.openaiEnabled = Boolean(openai?.baseUrl) || legacyAdapter === 'openai-chat'
  form.openaiBaseUrl = openai?.baseUrl || (legacyAdapter === 'openai-chat' ? legacyBase : '')
  form.openaiApiKey = ''

  form.anthropicEnabled = Boolean(anthropic?.baseUrl) || legacyAdapter === 'anthropic'
  form.anthropicBaseUrl = anthropic?.baseUrl || (legacyAdapter === 'anthropic' ? legacyBase : '')
  form.anthropicApiKey = ''
}

function openEdit(provider: GatewayProviderPublicPayload): void {
  editing.value = true
  form.id = provider.id
  form.name = provider.name
  form.modelsText = (provider.config.models || []).join(', ')
  form.defaultModel = provider.config.defaultModel || ''

  const openai = provider.config.protocols?.['openai-chat']
  const anthropic = provider.config.protocols?.anthropic
  const legacyIsOpenAi = provider.config.adapter === 'openai-chat'
  const legacyIsAnthropic = provider.config.adapter === 'anthropic'

  form.openaiEnabled = Boolean(openai?.baseUrl) || legacyIsOpenAi
  form.openaiBaseUrl = openai?.baseUrl || (legacyIsOpenAi ? provider.config.baseUrl : '') || ''
  form.openaiApiKey = openai?.apiKey || (legacyIsOpenAi ? provider.config.apiKey : '') || ''

  form.anthropicEnabled = Boolean(anthropic?.baseUrl) || legacyIsAnthropic
  form.anthropicBaseUrl =
    anthropic?.baseUrl || (legacyIsAnthropic ? provider.config.baseUrl : '') || ''
  form.anthropicApiKey =
    anthropic?.apiKey || (legacyIsAnthropic ? provider.config.apiKey : '') || ''
}

function cancelEdit(): void {
  editing.value = false
}

function parseModels(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function saveProvider(): Promise<void> {
  if (!form.id.trim() || !form.name.trim()) {
    ElMessage.warning(t('settings.gateway.providerRequired'))
    return
  }
  if (!form.openaiEnabled && !form.anthropicEnabled) {
    ElMessage.warning(t('settings.gateway.protocolRequired'))
    return
  }
  if (form.openaiEnabled && !form.openaiBaseUrl.trim()) {
    ElMessage.warning(t('settings.gateway.providerRequired'))
    return
  }
  if (form.anthropicEnabled && !form.anthropicBaseUrl.trim()) {
    ElMessage.warning(t('settings.gateway.providerRequired'))
    return
  }

  saving.value = true
  try {
    const protocols: Record<string, Record<string, unknown>> = {}
    if (form.openaiEnabled) {
      protocols['openai-chat'] = {
        baseUrl: form.openaiBaseUrl.trim(),
        apiKey: form.openaiApiKey.trim()
      }
    }
    if (form.anthropicEnabled) {
      protocols.anthropic = {
        baseUrl: form.anthropicBaseUrl.trim(),
        apiKey: form.anthropicApiKey.trim()
      }
    }
    const adapter: WireProtocol = form.openaiEnabled ? 'openai-chat' : 'anthropic'
    await window.agentAPI.providers.save({
      id: form.id.trim(),
      name: form.name.trim(),
      type: adapter,
      config: {
        adapter,
        models: parseModels(form.modelsText),
        defaultModel: form.defaultModel.trim() || undefined,
        protocols
      }
    })
    editing.value = false
    providers.value = await window.agentAPI.providers.list()
    ElMessage.success(t('common.saveSuccess'))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

async function deleteProvider(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm(t('settings.gateway.deleteConfirm'), t('common.confirm'), {
      type: 'warning'
    })
  } catch {
    return
  }
  saving.value = true
  try {
    await window.agentAPI.providers.delete(id)
    providers.value = await window.agentAPI.providers.list()
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function setDefaultProvider(id: string): Promise<void> {
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({ defaultProviderId: id })
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function setChannelProtocol(
  channel: GatewayTakeoverApp,
  protocol: WireProtocol
): Promise<void> {
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({
      channelProtocols: { [channel]: protocol }
    })
    ElMessage.success(t('common.saveSuccess'))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

async function toggleLogging(enabled: boolean): Promise<void> {
  if (!settings.value) return
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({
      logging: {
        ...settings.value.logging,
        enabled
      }
    })
    logViewer.value = await window.agentAPI.gateway.logViewerStatus()
    ElMessage.success(t('common.saveSuccess'))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

async function toggleOpenBrowser(openBrowser: boolean): Promise<void> {
  if (!settings.value) return
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({
      logging: {
        ...settings.value.logging,
        openBrowser
      }
    })
  } finally {
    saving.value = false
  }
}

async function saveViewerPort(): Promise<void> {
  if (!settings.value) return
  saving.value = true
  try {
    settings.value = await window.agentAPI.gateway.updateSettings({
      logging: {
        ...settings.value.logging,
        viewerPort: settings.value.logging.viewerPort
      }
    })
    logViewer.value = await window.agentAPI.gateway.logViewerStatus()
    ElMessage.success(t('common.saveSuccess'))
  } finally {
    saving.value = false
  }
}

async function openLogViewer(): Promise<void> {
  saving.value = true
  try {
    logViewer.value = await window.agentAPI.gateway.logViewerOpen()
    settings.value = await window.agentAPI.gateway.getSettings()
    ElMessage.success(t('settings.gateway.logViewerOpened'))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

function onToggleEnabled(): void {
  void toggleEnabled(!settings.value?.enabled)
}

function onToggleLogging(): void {
  void toggleLogging(!settings.value?.logging.enabled)
}

function onToggleOpenBrowser(): void {
  void toggleOpenBrowser(!settings.value?.logging.openBrowser)
}

function onToggleClaudeCli(): void {
  void setTakeover('claudeCli', !takeover.value?.claudeCli)
}

function onToggleClaudeDesktop(): void {
  void setTakeover('claudeDesktop', !takeover.value?.claudeDesktop)
}

function onToggleCodex(): void {
  void setTakeover('codex', !takeover.value?.codex)
}

function onToggleChannel(key: 'claudeCli' | 'claudeDesktop' | 'codex'): void {
  if (key === 'claudeCli') onToggleClaudeCli()
  else if (key === 'claudeDesktop') onToggleClaudeDesktop()
  else onToggleCodex()
}

function channelEnabled(key: 'claudeCli' | 'claudeDesktop' | 'codex'): boolean {
  if (key === 'claudeCli') return Boolean(takeover.value?.claudeCli)
  if (key === 'claudeDesktop') return Boolean(takeover.value?.claudeDesktop)
  return Boolean(takeover.value?.codex)
}

function onPresetCommand(id: string): void {
  openCreate(presets.value.find((p) => p.id === id))
}

function onAddProvider(): void {
  openCreate()
}

function buildDraftFromForm() {
  const protocols: {
    'openai-chat'?: { baseUrl: string; apiKey?: string }
    anthropic?: { baseUrl: string; apiKey?: string }
  } = {}
  if (form.openaiEnabled && form.openaiBaseUrl.trim()) {
    protocols['openai-chat'] = {
      baseUrl: form.openaiBaseUrl.trim(),
      apiKey: form.openaiApiKey.trim() || undefined
    }
  }
  if (form.anthropicEnabled && form.anthropicBaseUrl.trim()) {
    protocols.anthropic = {
      baseUrl: form.anthropicBaseUrl.trim(),
      apiKey: form.anthropicApiKey.trim() || undefined
    }
  }
  return {
    models: parseModels(form.modelsText),
    defaultModel: form.defaultModel.trim() || undefined,
    protocols
  }
}

function showTestResult(result: ProviderTestResultPayload): void {
  const lines = result.results.map((r) => {
    const label = protocolLabel(r.protocol)
    if (r.ok) return `${label}: ${r.latencyMs}ms`
    return `${label}: ${r.error || t('settings.gateway.testFailed')}`
  })
  const detail = lines.join('；')
  if (result.ok) {
    const ms = Math.max(...result.results.map((r) => r.latencyMs), 0)
    ElMessage.success(`${t('settings.gateway.testOk', { ms })} · ${detail}`)
  } else if (result.results.some((r) => r.ok)) {
    ElMessage.warning(`${t('settings.gateway.testPartial')} · ${detail}`)
  } else {
    ElMessage.error(`${t('settings.gateway.testFailed')} · ${detail}`)
  }
}

async function testSavedProvider(providerId: string): Promise<void> {
  if (testingIds.value[providerId]) return
  testingIds.value = { ...testingIds.value, [providerId]: true }
  try {
    const result = await window.agentAPI.providers.test({ providerId })
    showTestResult(result)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    const next = { ...testingIds.value }
    delete next[providerId]
    testingIds.value = next
  }
}

async function testDraftProvider(): Promise<void> {
  if (!form.openaiEnabled && !form.anthropicEnabled) {
    ElMessage.warning(t('settings.gateway.testNeedProtocol'))
    return
  }
  if (
    (form.openaiEnabled && !form.openaiBaseUrl.trim()) ||
    (form.anthropicEnabled && !form.anthropicBaseUrl.trim())
  ) {
    ElMessage.warning(t('settings.gateway.testNeedProtocol'))
    return
  }
  testingDraft.value = true
  try {
    const result = await window.agentAPI.providers.test({
      providerId: form.id.trim() || undefined,
      draft: buildDraftFromForm()
    })
    showTestResult(result)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    testingDraft.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="content-section">
    <h1 class="page-title">{{ t('settings.gateway.title') }}</h1>
    <p class="page-desc">{{ t('settings.gateway.desc') }}</p>

    <el-tabs v-model="activeTab" class="gateway-tabs">
      <el-tab-pane :label="t('settings.gateway.tabService')" name="service">
        <div class="setting-card">
          <div class="setting-row">
            <div>
              <div class="setting-label">{{ t('settings.gateway.enable') }}</div>
              <div class="setting-desc">
                {{
                  status.running
                    ? t('settings.gateway.runningAt', { url: baseUrlDisplay })
                    : t('settings.gateway.stoppedDesc')
                }}
              </div>
            </div>
            <button
              type="button"
              class="toggle-switch"
              :class="{ active: settings?.enabled }"
              role="switch"
              :aria-checked="Boolean(settings?.enabled)"
              :disabled="saving"
              @click="onToggleEnabled"
            />
          </div>

          <div class="setting-row">
            <div class="setting-label">{{ t('settings.gateway.hostPort') }}</div>
            <div v-if="settings" class="inline-fields">
              <el-input v-model="settings.host" style="width: 140px" />
              <el-input-number
                v-model="settings.port"
                :min="1"
                :max="65535"
                controls-position="right"
              />
              <el-button :disabled="saving" @click="saveHostPort">
                {{ t('common.save') }}
              </el-button>
            </div>
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">{{ t('settings.gateway.token') }}</div>
              <div class="setting-desc mono">{{ status.token || settings?.token || '—' }}</div>
            </div>
            <el-button :icon="CopyDocument" @click="copyToken">
              {{ t('settings.gateway.copyToken') }}
            </el-button>
          </div>
        </div>

        <h2 class="section-title">{{ t('settings.gateway.loggingTitle') }}</h2>
        <p class="page-desc">{{ t('settings.gateway.loggingDesc') }}</p>
        <div class="setting-card">
          <div class="setting-row">
            <div>
              <div class="setting-label">{{ t('settings.gateway.loggingEnable') }}</div>
              <div class="setting-desc mono">
                {{ t('settings.gateway.logsDir') }}: {{ logViewer?.logsDir || '—' }}
              </div>
            </div>
            <button
              type="button"
              class="toggle-switch"
              :class="{ active: settings?.logging?.enabled }"
              role="switch"
              :disabled="saving"
              @click="onToggleLogging"
            />
          </div>
          <div class="setting-row">
            <div>
              <div class="setting-label">{{ t('settings.gateway.loggingOpenBrowser') }}</div>
            </div>
            <button
              type="button"
              class="toggle-switch"
              :class="{ active: settings?.logging?.openBrowser }"
              role="switch"
              :disabled="saving"
              @click="onToggleOpenBrowser"
            />
          </div>
          <div class="setting-row">
            <div class="setting-label">{{ t('settings.gateway.loggingViewerPort') }}</div>
            <div v-if="settings" class="inline-fields">
              <el-input-number
                v-model="settings.logging.viewerPort"
                :min="1"
                :max="65535"
                controls-position="right"
              />
              <el-button :disabled="saving" @click="saveViewerPort">
                {{ t('common.save') }}
              </el-button>
              <el-button type="primary" :disabled="saving" @click="openLogViewer">
                {{ t('settings.gateway.openLogViewer') }}
              </el-button>
            </div>
          </div>
          <div v-if="logViewer?.running" class="setting-row">
            <div class="setting-desc mono">{{ logViewer.url }}</div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.gateway.tabProviders')" name="providers">
        <p class="page-desc">{{ t('settings.gateway.providersDesc') }}</p>
        <div class="preset-row">
          <el-button :icon="Plus" type="primary" @click="onAddProvider">
            {{ t('settings.gateway.addProvider') }}
          </el-button>
          <el-dropdown trigger="click" @command="onPresetCommand">
            <el-button>{{ t('settings.gateway.fromPreset') }}</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="p in presets" :key="p.id" :command="p.id">
                  {{ p.name }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div v-if="editing" class="setting-card edit-card">
          <div class="form-grid">
            <el-input v-model="form.id" :placeholder="t('settings.gateway.providerId')" />
            <el-input v-model="form.name" :placeholder="t('settings.gateway.providerName')" />
            <div class="field-label">{{ t('settings.gateway.defaultModel') }}</div>
            <el-input
              v-model="form.defaultModel"
              :placeholder="t('settings.gateway.defaultModel')"
            />
            <div class="field-label">{{ t('settings.gateway.modelsLabel') }}</div>
            <el-input
              v-model="form.modelsText"
              type="textarea"
              :rows="2"
              :placeholder="t('settings.gateway.modelsPlaceholder')"
            />
          </div>

          <div class="protocol-block">
            <label class="protocol-toggle">
              <input v-model="form.openaiEnabled" type="checkbox" />
              <span>OpenAI Chat</span>
            </label>
            <div v-if="form.openaiEnabled" class="form-grid">
              <el-input
                v-model="form.openaiBaseUrl"
                placeholder="https://api.example.com 或 .../v3"
              />
              <el-input
                v-model="form.openaiApiKey"
                :placeholder="t('settings.gateway.apiKeyPlaceholder')"
              />
            </div>
          </div>

          <div class="protocol-block">
            <label class="protocol-toggle">
              <input v-model="form.anthropicEnabled" type="checkbox" />
              <span>Anthropic Messages</span>
            </label>
            <div v-if="form.anthropicEnabled" class="form-grid">
              <el-input
                v-model="form.anthropicBaseUrl"
                placeholder="https://api.anthropic.com 或 .../api/coding"
              />
              <el-input
                v-model="form.anthropicApiKey"
                :placeholder="t('settings.gateway.apiKeyPlaceholder')"
              />
            </div>
          </div>

          <div class="form-actions">
            <el-button @click="cancelEdit">{{ t('common.cancel') }}</el-button>
            <el-button :loading="testingDraft" :disabled="saving" @click="testDraftProvider">
              {{ t('settings.gateway.testConnection') }}
            </el-button>
            <el-button type="primary" :loading="saving" @click="saveProvider">
              {{ t('common.save') }}
            </el-button>
          </div>
        </div>

        <div v-if="providers.length === 0" class="empty">
          {{ t('settings.gateway.noProviders') }}
        </div>
        <div v-for="provider in providers" :key="provider.id" class="setting-card provider-card">
          <div class="provider-head">
            <div>
              <div class="setting-label">{{ provider.name }}</div>
              <div class="setting-desc mono">{{ provider.id }}</div>
              <div class="setting-desc mono">
                {{ t('settings.gateway.defaultModel') }}:
                {{ provider.config.defaultModel || '—' }}
              </div>
              <div class="setting-desc mono">
                {{ t('settings.gateway.modelsLabel') }}:
                {{ (provider.config.models || []).join(', ') || '—' }}
              </div>
              <div
                v-for="proto in availableProtocols(provider)"
                :key="proto"
                class="setting-desc mono"
              >
                <div>
                  {{ protocolLabel(proto) }} ·
                  {{ provider.config.protocols[proto]?.baseUrl || provider.config.baseUrl }}
                </div>
                <div>
                  Key:
                  {{
                    (
                      provider.config.protocols[proto]?.apiKey ||
                      (proto === provider.config.adapter ? provider.config.apiKey : '') ||
                      ''
                    ).trim() || t('settings.gateway.noApiKey')
                  }}
                </div>
              </div>
            </div>
            <div class="provider-actions">
              <el-button
                size="small"
                :type="settings?.defaultProviderId === provider.id ? 'primary' : 'default'"
                @click="() => setDefaultProvider(provider.id)"
              >
                {{
                  settings?.defaultProviderId === provider.id
                    ? t('settings.gateway.isDefault')
                    : t('settings.gateway.setDefault')
                }}
              </el-button>
              <el-button
                size="small"
                :loading="Boolean(testingIds[provider.id])"
                @click="() => testSavedProvider(provider.id)"
              >
                {{ t('settings.gateway.testConnection') }}
              </el-button>
              <el-button size="small" @click="() => openEdit(provider)">
                {{ t('common.edit') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="() => deleteProvider(provider.id)"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane
        v-for="channel in channelTabs"
        :key="channel.key"
        :name="channel.key"
        :disabled="channel.disabled && channel.key === 'claudeDesktop'"
      >
        <template #label>
          <span class="tab-label">
            {{ channel.label }}
            <span
              v-if="channel.enabled"
              class="tab-dot"
              :title="t('settings.gateway.takeoverOn')"
            />
          </span>
        </template>

        <p class="page-desc">{{ t('settings.gateway.channelDesc') }}</p>

        <div class="setting-card">
          <div class="setting-row">
            <div>
              <div class="setting-label">{{ t('settings.gateway.channelEnable') }}</div>
              <div class="setting-desc">
                <template v-if="channel.key === 'claudeCli'"> ~/.claude/settings.json </template>
                <template v-else-if="channel.key === 'claudeDesktop'">
                  {{
                    takeover?.claudeDesktopSupported
                      ? t('settings.gateway.takeoverClaudeDesktopDesc')
                      : t('settings.gateway.takeoverUnsupported')
                  }}
                </template>
                <template v-else>~/.codex/config.toml</template>
              </div>
            </div>
            <button
              type="button"
              class="toggle-switch"
              :class="{ active: channelEnabled(channel.key) }"
              role="switch"
              :disabled="
                saving || (channel.key === 'claudeDesktop' && !takeover?.claudeDesktopSupported)
              "
              @click="() => onToggleChannel(channel.key)"
            />
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">{{ t('settings.gateway.channelProtocol') }}</div>
              <div class="setting-desc">{{ t('settings.gateway.channelProtocolDesc') }}</div>
            </div>
            <el-select
              :model-value="channelProtocol(channel.key)"
              style="width: 200px"
              :disabled="saving"
              @change="(v: WireProtocol) => setChannelProtocol(channel.key, v)"
            >
              <el-option
                v-for="proto in ALL_CHANNEL_PROTOCOLS"
                :key="proto"
                :label="protocolLabel(proto)"
                :value="proto"
              />
            </el-select>
          </div>

          <div class="setting-row">
            <div class="setting-label">{{ t('settings.gateway.channelStatus') }}</div>
            <div class="setting-desc">
              <span class="status-pill" :class="{ on: channelEnabled(channel.key) }">
                {{
                  channelEnabled(channel.key)
                    ? t('settings.gateway.takeoverOn')
                    : t('settings.gateway.takeoverOff')
                }}
              </span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">{{ t('settings.gateway.proxyTarget') }}</div>
            <div class="setting-desc mono">
              {{ takeover?.proxyBaseUrl || baseUrlDisplay || '—' }}
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">{{ t('settings.gateway.backupAt') }}</div>
            <div class="setting-desc mono">
              {{
                backedUpAt(
                  channel.key === 'claudeCli'
                    ? 'claude'
                    : channel.key === 'claudeDesktop'
                      ? 'claude-desktop'
                      : 'codex'
                ) || t('settings.gateway.noBackup')
              }}
            </div>
          </div>
        </div>

        <div class="hint-card">
          <div class="setting-label">{{ t('settings.gateway.channelHintTitle') }}</div>
          <div class="setting-desc">
            <template v-if="channel.key === 'claudeCli'">
              {{ t('settings.gateway.channelHintClaudeCli') }}
            </template>
            <template v-else-if="channel.key === 'claudeDesktop'">
              {{ t('settings.gateway.channelHintClaudeDesktop') }}
            </template>
            <template v-else>
              {{ t('settings.gateway.channelHintCodex') }}
            </template>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
}
.page-desc {
  margin: 0 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.section-title {
  margin: 20px 0 8px;
  font-size: 16px;
  font-weight: 600;
}
.gateway-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
.gateway-tabs :deep(.el-tabs__item.is-disabled) {
  opacity: 0.55;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--el-color-success);
  display: inline-block;
}
.setting-card {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 4px 16px;
  margin-bottom: 12px;
}
.hint-card {
  background: var(--el-fill-color-light);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 8px;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.setting-row:last-child {
  border-bottom: none;
}
.setting-label {
  font-size: 14px;
  font-weight: 500;
}
.setting-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  word-break: break-all;
}
.inline-fields {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.toggle-switch {
  width: 44px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: var(--el-fill-color-dark);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}
.toggle-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}
.toggle-switch.active {
  background: var(--el-color-primary);
}
.toggle-switch.active::after {
  transform: translateX(18px);
}
.toggle-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
}
.status-pill.on {
  color: var(--el-color-success);
  border-color: color-mix(in srgb, var(--el-color-success) 45%, var(--el-border-color));
  background: color-mix(in srgb, var(--el-color-success) 12%, transparent);
}
.preset-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.form-grid {
  display: grid;
  gap: 10px;
  padding: 12px 0;
}
.protocol-block {
  border-top: 1px solid var(--el-border-color-extra-light);
  padding: 8px 0 4px;
}
.protocol-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}
.field-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-bottom: 12px;
}
.provider-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
}
.provider-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 320px;
}
.empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 12px 0;
}
</style>
