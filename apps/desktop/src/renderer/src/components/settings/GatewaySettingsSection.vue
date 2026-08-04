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
  ProviderRemoteModelPayload,
  ProviderTestResultPayload
} from '../../../../preload/types'

type GatewayTab = 'service' | 'providers' | 'localAccess'
type ChannelKey = 'claudeCli' | 'claudeDesktop' | 'codex'

const { t } = useI18n()

const loading = ref(true)
const saving = ref(false)
const activeTab = ref<GatewayTab>('service')
const activeChannel = ref<ChannelKey>('claudeCli')
const settings = ref<GatewaySettingsPayload | null>(null)
const status = reactive({ running: false, host: '127.0.0.1', port: 3456, token: '' })
const takeover = ref<GatewayTakeoverStatus | null>(null)
const providers = ref<GatewayProviderPublicPayload[]>([])
const presets = ref<ProviderConfigPayload[]>([])
const logViewer = ref<GatewayLogViewerStatus | null>(null)

const editing = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const detailProvider = ref<GatewayProviderPublicPayload | null>(null)
const testingIds = ref<Record<string, boolean>>({})
const testingDraft = ref(false)
const fetchingModels = ref(false)
const fetchedModels = ref<ProviderRemoteModelPayload[]>([])
const modelFilter = ref('')

type WireProtocol = 'openai-chat' | 'anthropic' | 'openai-responses'
type KvRow = { key: string; value: string }
type ProtocolOverrides = {
  headers?: Record<string, string>
  bodyDefaults?: Record<string, unknown>
}

const form = reactive({
  id: '',
  name: '',
  modelsText: '',
  defaultModel: '',
  openaiEnabled: true,
  openaiBaseUrl: '',
  openaiApiKey: '',
  openaiHeaders: [] as KvRow[],
  openaiBodyDefaults: [] as KvRow[],
  responsesEnabled: false,
  responsesBaseUrl: '',
  responsesApiKey: '',
  responsesHeaders: [] as KvRow[],
  responsesBodyDefaults: [] as KvRow[],
  anthropicEnabled: false,
  anthropicBaseUrl: '',
  anthropicApiKey: '',
  anthropicHeaders: [] as KvRow[],
  anthropicBodyDefaults: [] as KvRow[]
})

const drawerTitle = computed(() =>
  formMode.value === 'edit' ? t('settings.gateway.editProvider') : t('settings.gateway.addProvider')
)

const detailVisible = computed({
  get: () => detailProvider.value !== null,
  set: (visible: boolean) => {
    if (!visible) detailProvider.value = null
  }
})

function emptyKvRows(): KvRow[] {
  return []
}

function objectToKvRows(obj?: Record<string, unknown> | null): KvRow[] {
  if (!obj) return emptyKvRows()
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value)
  }))
}

function headersFromKv(rows: KvRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const name = row.key.trim()
    if (!name) continue
    out[name] = row.value
  }
  return Object.keys(out).length ? out : undefined
}

function bodyDefaultsFromKv(rows: KvRow[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    const name = row.key.trim()
    if (!name) continue
    const raw = row.value.trim()
    if (!raw) {
      out[name] = ''
      continue
    }
    try {
      out[name] = JSON.parse(raw) as unknown
    } catch {
      out[name] = row.value
    }
  }
  return Object.keys(out).length ? out : undefined
}

function overridesFromKv(headers: KvRow[], bodyDefaults: KvRow[]): ProtocolOverrides {
  const headerMap = headersFromKv(headers)
  const bodyMap = bodyDefaultsFromKv(bodyDefaults)
  return {
    ...(headerMap ? { headers: headerMap } : {}),
    ...(bodyMap ? { bodyDefaults: bodyMap } : {})
  }
}

function attachProtocolOverrides(
  endpoint: Record<string, unknown>,
  overrides: ProtocolOverrides
): Record<string, unknown> {
  if (overrides.headers) endpoint.headers = overrides.headers
  if (overrides.bodyDefaults) endpoint.bodyDefaults = overrides.bodyDefaults
  return endpoint
}

function addKvRow(rows: KvRow[]): void {
  rows.push({ key: '', value: '' })
}

function removeKvRow(rows: KvRow[], index: number): void {
  rows.splice(index, 1)
}

function loadEndpointOverrides(
  endpoint?: {
    headers?: Record<string, string>
    bodyDefaults?: Record<string, unknown>
  } | null
): { headers: KvRow[]; bodyDefaults: KvRow[] } {
  return {
    headers: objectToKvRows(endpoint?.headers),
    bodyDefaults: objectToKvRows(endpoint?.bodyDefaults)
  }
}

function formatOverridesPreview(
  endpoint?: {
    headers?: Record<string, string>
    bodyDefaults?: Record<string, unknown>
  } | null
): string {
  if (!endpoint) return '—'
  const parts: string[] = []
  if (endpoint.headers && Object.keys(endpoint.headers).length) {
    parts.push(`headers: ${JSON.stringify(endpoint.headers)}`)
  }
  if (endpoint.bodyDefaults && Object.keys(endpoint.bodyDefaults).length) {
    parts.push(`bodyDefaults: ${JSON.stringify(endpoint.bodyDefaults)}`)
  }
  return parts.length ? parts.join('\n') : '—'
}

function primaryBaseUrl(provider: GatewayProviderPublicPayload): string {
  const protocols = availableProtocols(provider)
  if (protocols.length === 1) {
    return provider.config.protocols[protocols[0]]?.baseUrl || provider.config.baseUrl || '—'
  }
  if (protocols.length > 1) {
    return protocols
      .map((p) => provider.config.protocols[p]?.baseUrl || '')
      .filter(Boolean)
      .join(' · ')
  }
  return provider.config.baseUrl || '—'
}

function openDetail(provider: GatewayProviderPublicPayload): void {
  detailProvider.value = provider
}

function editFromDetail(): void {
  const provider = detailProvider.value
  detailProvider.value = null
  if (provider) openEdit(provider)
}

function protocolHasApiKey(
  provider: GatewayProviderPublicPayload,
  protocol: WireProtocol
): boolean {
  const endpoint = provider.config.protocols[protocol]
  if (endpoint?.hasApiKey) return true
  const key =
    endpoint?.apiKey || (protocol === provider.config.adapter ? provider.config.apiKey : '') || ''
  return (
    Boolean(key.trim()) ||
    Boolean(provider.config.hasApiKey && protocol === provider.config.adapter)
  )
}

function parseModels(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const enteredModels = computed(() => parseModels(form.modelsText))

const filteredFetchedModels = computed(() => {
  const q = modelFilter.value.trim().toLowerCase()
  if (!q) return fetchedModels.value
  return fetchedModels.value.filter((m) => {
    const name = (m.name || '').toLowerCase()
    return m.id.toLowerCase().includes(q) || name.includes(q)
  })
})

const fetchedCheckedIds = computed(() => {
  const entered = new Set(enteredModels.value)
  return fetchedModels.value.filter((m) => entered.has(m.id)).map((m) => m.id)
})

function syncDefaultModel(): void {
  const models = enteredModels.value
  if (!form.defaultModel) {
    if (models.length) form.defaultModel = models[0]
    return
  }
  if (!models.includes(form.defaultModel)) {
    form.defaultModel = models[0] || ''
  }
}

function setEnteredModels(models: string[]): void {
  form.modelsText = [...new Set(models.map((m) => m.trim()).filter(Boolean))].join(', ')
  syncDefaultModel()
}

function onFetchedSelectionChange(checkedIds: string[] | string | number | boolean): void {
  const checked = Array.isArray(checkedIds)
    ? checkedIds.map(String)
    : checkedIds == null || checkedIds === false
      ? []
      : [String(checkedIds)]
  const fetchedIds = new Set(fetchedModels.value.map((m) => m.id))
  const keptManual = enteredModels.value.filter((id) => !fetchedIds.has(id))
  setEnteredModels([...keptManual, ...checked])
}

function clearFetchState(): void {
  fetchedModels.value = []
  modelFilter.value = ''
  fetchingModels.value = false
}

function protocolLabel(protocol: WireProtocol): string {
  if (protocol === 'anthropic') return 'Anthropic Messages'
  if (protocol === 'openai-responses') return 'OpenAI Responses（透传）'
  return 'OpenAI Chat（网关转换）'
}

function availableProtocols(provider: GatewayProviderPublicPayload): WireProtocol[] {
  const keys = Object.keys(provider.config.protocols || {}) as WireProtocol[]
  if (keys.length) return keys.filter((k) => provider.config.protocols[k]?.baseUrl)
  return provider.config.baseUrl ? [provider.config.adapter as WireProtocol] : []
}

function channelProtocol(channel: GatewayTakeoverApp): WireProtocol {
  const bound = settings.value?.channelProtocols?.[channel]
  if (bound === 'openai-chat' || bound === 'anthropic' || bound === 'openai-responses') return bound
  if (channel === 'codex') return 'openai-chat'
  return 'anthropic'
}

function channelProtocolsFor(channel: GatewayTakeoverApp): WireProtocol[] {
  if (channel === 'codex') return ['openai-chat', 'openai-responses', 'anthropic']
  return ['openai-chat', 'anthropic']
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
  formMode.value = 'create'
  editing.value = true
  clearFetchState()
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
  syncDefaultModel()

  const openai = protocols?.['openai-chat']
  const responses = protocols?.['openai-responses']
  const anthropic = protocols?.anthropic
  form.openaiEnabled = Boolean(openai?.baseUrl) || legacyAdapter === 'openai-chat'
  form.openaiBaseUrl = openai?.baseUrl || (legacyAdapter === 'openai-chat' ? legacyBase : '')
  form.openaiApiKey = ''
  const openaiOverrides = loadEndpointOverrides(openai)
  form.openaiHeaders = openaiOverrides.headers
  form.openaiBodyDefaults = openaiOverrides.bodyDefaults

  form.responsesEnabled = Boolean(responses?.baseUrl) || legacyAdapter === 'openai-responses'
  form.responsesBaseUrl =
    responses?.baseUrl || (legacyAdapter === 'openai-responses' ? legacyBase : '')
  form.responsesApiKey = ''
  const responsesOverrides = loadEndpointOverrides(responses)
  form.responsesHeaders = responsesOverrides.headers
  form.responsesBodyDefaults = responsesOverrides.bodyDefaults

  form.anthropicEnabled = Boolean(anthropic?.baseUrl) || legacyAdapter === 'anthropic'
  form.anthropicBaseUrl = anthropic?.baseUrl || (legacyAdapter === 'anthropic' ? legacyBase : '')
  form.anthropicApiKey = ''
  const anthropicOverrides = loadEndpointOverrides(anthropic)
  form.anthropicHeaders = anthropicOverrides.headers
  form.anthropicBodyDefaults = anthropicOverrides.bodyDefaults
}

function openEdit(provider: GatewayProviderPublicPayload): void {
  formMode.value = 'edit'
  editing.value = true
  clearFetchState()
  form.id = provider.id
  form.name = provider.name
  form.modelsText = (provider.config.models || []).join(', ')
  form.defaultModel = provider.config.defaultModel || ''
  syncDefaultModel()

  const openai = provider.config.protocols?.['openai-chat']
  const responses = provider.config.protocols?.['openai-responses']
  const anthropic = provider.config.protocols?.anthropic
  const legacyIsOpenAi = provider.config.adapter === 'openai-chat'
  const legacyIsResponses = provider.config.adapter === 'openai-responses'
  const legacyIsAnthropic = provider.config.adapter === 'anthropic'

  form.openaiEnabled = Boolean(openai?.baseUrl) || legacyIsOpenAi
  form.openaiBaseUrl = openai?.baseUrl || (legacyIsOpenAi ? provider.config.baseUrl : '') || ''
  form.openaiApiKey = openai?.apiKey || (legacyIsOpenAi ? provider.config.apiKey : '') || ''
  const openaiOverrides = loadEndpointOverrides(openai)
  form.openaiHeaders = openaiOverrides.headers
  form.openaiBodyDefaults = openaiOverrides.bodyDefaults

  form.responsesEnabled = Boolean(responses?.baseUrl) || legacyIsResponses
  form.responsesBaseUrl =
    responses?.baseUrl || (legacyIsResponses ? provider.config.baseUrl : '') || ''
  form.responsesApiKey =
    responses?.apiKey || (legacyIsResponses ? provider.config.apiKey : '') || ''
  const responsesOverrides = loadEndpointOverrides(responses)
  form.responsesHeaders = responsesOverrides.headers
  form.responsesBodyDefaults = responsesOverrides.bodyDefaults

  form.anthropicEnabled = Boolean(anthropic?.baseUrl) || legacyIsAnthropic
  form.anthropicBaseUrl =
    anthropic?.baseUrl || (legacyIsAnthropic ? provider.config.baseUrl : '') || ''
  form.anthropicApiKey =
    anthropic?.apiKey || (legacyIsAnthropic ? provider.config.apiKey : '') || ''
  const anthropicOverrides = loadEndpointOverrides(anthropic)
  form.anthropicHeaders = anthropicOverrides.headers
  form.anthropicBodyDefaults = anthropicOverrides.bodyDefaults
}

function cancelEdit(): void {
  editing.value = false
  clearFetchState()
}

function onModelsTextInput(): void {
  syncDefaultModel()
}

async function saveProvider(): Promise<void> {
  if (!form.id.trim()) {
    form.id = `provider-${Date.now().toString(36)}`
  }
  if (!form.name.trim()) {
    ElMessage.warning(t('settings.gateway.providerRequired'))
    return
  }
  if (!form.openaiEnabled && !form.responsesEnabled && !form.anthropicEnabled) {
    ElMessage.warning(t('settings.gateway.protocolRequired'))
    return
  }
  if (form.openaiEnabled && !form.openaiBaseUrl.trim()) {
    ElMessage.warning(t('settings.gateway.providerRequired'))
    return
  }
  if (form.responsesEnabled && !form.responsesBaseUrl.trim()) {
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
      protocols['openai-chat'] = attachProtocolOverrides(
        {
          baseUrl: form.openaiBaseUrl.trim(),
          apiKey: form.openaiApiKey.trim()
        },
        overridesFromKv(form.openaiHeaders, form.openaiBodyDefaults)
      )
    }
    if (form.responsesEnabled) {
      protocols['openai-responses'] = attachProtocolOverrides(
        {
          baseUrl: form.responsesBaseUrl.trim(),
          apiKey: form.responsesApiKey.trim()
        },
        overridesFromKv(form.responsesHeaders, form.responsesBodyDefaults)
      )
    }
    if (form.anthropicEnabled) {
      protocols.anthropic = attachProtocolOverrides(
        {
          baseUrl: form.anthropicBaseUrl.trim(),
          apiKey: form.anthropicApiKey.trim()
        },
        overridesFromKv(form.anthropicHeaders, form.anthropicBodyDefaults)
      )
    }
    const adapter: WireProtocol = form.openaiEnabled
      ? 'openai-chat'
      : form.responsesEnabled
        ? 'openai-responses'
        : 'anthropic'
    const models = parseModels(form.modelsText)
    const defaultModel =
      form.defaultModel.trim() && models.includes(form.defaultModel.trim())
        ? form.defaultModel.trim()
        : models[0]
    await window.agentAPI.providers.save({
      id: form.id.trim(),
      name: form.name.trim(),
      type: adapter,
      config: {
        adapter,
        models,
        defaultModel: defaultModel || undefined,
        protocols
      }
    })
    editing.value = false
    clearFetchState()
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
    'openai-chat'?: {
      baseUrl: string
      apiKey?: string
      headers?: Record<string, string>
      bodyDefaults?: Record<string, unknown>
    }
    'openai-responses'?: {
      baseUrl: string
      apiKey?: string
      headers?: Record<string, string>
      bodyDefaults?: Record<string, unknown>
    }
    anthropic?: {
      baseUrl: string
      apiKey?: string
      headers?: Record<string, string>
      bodyDefaults?: Record<string, unknown>
    }
  } = {}
  if (form.openaiEnabled && form.openaiBaseUrl.trim()) {
    protocols['openai-chat'] = attachProtocolOverrides(
      {
        baseUrl: form.openaiBaseUrl.trim(),
        apiKey: form.openaiApiKey.trim() || undefined
      },
      overridesFromKv(form.openaiHeaders, form.openaiBodyDefaults)
    ) as (typeof protocols)['openai-chat']
  }
  if (form.responsesEnabled && form.responsesBaseUrl.trim()) {
    protocols['openai-responses'] = attachProtocolOverrides(
      {
        baseUrl: form.responsesBaseUrl.trim(),
        apiKey: form.responsesApiKey.trim() || undefined
      },
      overridesFromKv(form.responsesHeaders, form.responsesBodyDefaults)
    ) as (typeof protocols)['openai-responses']
  }
  if (form.anthropicEnabled && form.anthropicBaseUrl.trim()) {
    protocols.anthropic = attachProtocolOverrides(
      {
        baseUrl: form.anthropicBaseUrl.trim(),
        apiKey: form.anthropicApiKey.trim() || undefined
      },
      overridesFromKv(form.anthropicHeaders, form.anthropicBodyDefaults)
    ) as (typeof protocols)['anthropic']
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
  if (!form.openaiEnabled && !form.responsesEnabled && !form.anthropicEnabled) {
    ElMessage.warning(t('settings.gateway.testNeedProtocol'))
    return
  }
  if (
    (form.openaiEnabled && !form.openaiBaseUrl.trim()) ||
    (form.responsesEnabled && !form.responsesBaseUrl.trim()) ||
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

async function fetchDraftModels(): Promise<void> {
  if (!form.openaiEnabled && !form.responsesEnabled && !form.anthropicEnabled) {
    ElMessage.warning(t('settings.gateway.testNeedProtocol'))
    return
  }
  if (
    (form.openaiEnabled && !form.openaiBaseUrl.trim()) ||
    (form.responsesEnabled && !form.responsesBaseUrl.trim()) ||
    (form.anthropicEnabled && !form.anthropicBaseUrl.trim())
  ) {
    ElMessage.warning(t('settings.gateway.testNeedProtocol'))
    return
  }
  fetchingModels.value = true
  try {
    const result = await window.agentAPI.providers.fetchModels({
      providerId: form.id.trim() || undefined,
      draft: buildDraftFromForm()
    })
    fetchedModels.value = result.models
    if (result.ok) {
      if (result.errors.length) {
        const detail = result.errors
          .map((e) => `${protocolLabel(e.protocol)}: ${e.error}`)
          .join('；')
        ElMessage.warning(
          `${t('settings.gateway.fetchModelsPartial', { count: result.models.length })} · ${detail}`
        )
      } else {
        ElMessage.success(t('settings.gateway.fetchModelsOk', { count: result.models.length }))
      }
    } else {
      const detail = result.errors.map((e) => `${protocolLabel(e.protocol)}: ${e.error}`).join('；')
      ElMessage.error(
        detail
          ? `${t('settings.gateway.fetchModelsFailed')} · ${detail}`
          : t('settings.gateway.fetchModelsFailed')
      )
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    fetchingModels.value = false
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

        <div v-if="providers.length === 0" class="empty">
          {{ t('settings.gateway.noProviders') }}
        </div>
        <div v-for="provider in providers" :key="provider.id" class="provider-card">
          <div class="provider-main">
            <div class="provider-title-row">
              <div class="setting-label">{{ provider.name }}</div>
              <span v-if="settings?.defaultProviderId === provider.id" class="default-badge">
                {{ t('settings.gateway.isDefault') }}
              </span>
            </div>
            <div class="setting-desc mono">{{ primaryBaseUrl(provider) }}</div>
            <div class="protocol-tags">
              <span v-for="proto in availableProtocols(provider)" :key="proto" class="proto-tag">
                {{ protocolLabel(proto) }}
              </span>
            </div>
          </div>
          <div class="provider-actions">
            <el-button size="small" @click="() => openDetail(provider)">
              {{ t('settings.gateway.viewMore') }}
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

        <el-drawer
          v-model="editing"
          :title="drawerTitle"
          size="560px"
          destroy-on-close
          class="provider-drawer"
          @close="cancelEdit"
        >
          <div class="drawer-body">
            <div class="form-grid">
              <div class="field-label">{{ t('settings.gateway.providerName') }}</div>
              <el-input v-model="form.name" :placeholder="t('settings.gateway.providerName')" />
            </div>

            <div class="protocol-block">
              <label class="protocol-toggle">
                <input v-model="form.openaiEnabled" type="checkbox" />
                <span>OpenAI Chat（网关可转换为 Responses）</span>
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
                <div class="field-label">{{ t('settings.gateway.headersLabel') }}</div>
                <div class="setting-desc">{{ t('settings.gateway.headersDesc') }}</div>
                <div v-for="(row, idx) in form.openaiHeaders" :key="`oh-${idx}`" class="kv-row">
                  <el-input v-model="row.key" :placeholder="t('settings.gateway.kvKey')" />
                  <el-input v-model="row.value" :placeholder="t('settings.gateway.kvValue')" />
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="() => removeKvRow(form.openaiHeaders, idx)"
                  />
                </div>
                <el-button size="small" @click="addKvRow(form.openaiHeaders)">
                  {{ t('settings.gateway.addKvRow') }}
                </el-button>
                <div class="field-label">{{ t('settings.gateway.bodyDefaultsLabel') }}</div>
                <div class="setting-desc">{{ t('settings.gateway.bodyDefaultsDesc') }}</div>
                <div
                  v-for="(row, idx) in form.openaiBodyDefaults"
                  :key="`ob-${idx}`"
                  class="kv-row"
                >
                  <el-input v-model="row.key" :placeholder="t('settings.gateway.kvKey')" />
                  <el-input
                    v-model="row.value"
                    :placeholder="t('settings.gateway.bodyValuePlaceholder')"
                  />
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="() => removeKvRow(form.openaiBodyDefaults, idx)"
                  />
                </div>
                <el-button size="small" @click="addKvRow(form.openaiBodyDefaults)">
                  {{ t('settings.gateway.addKvRow') }}
                </el-button>
              </div>
            </div>

            <div class="protocol-block">
              <label class="protocol-toggle">
                <input v-model="form.responsesEnabled" type="checkbox" />
                <span>OpenAI Responses（原生透传）</span>
              </label>
              <div v-if="form.responsesEnabled" class="form-grid">
                <el-input v-model="form.responsesBaseUrl" placeholder="https://api.openai.com/v1" />
                <el-input
                  v-model="form.responsesApiKey"
                  :placeholder="t('settings.gateway.apiKeyPlaceholder')"
                />
                <div class="field-label">{{ t('settings.gateway.headersLabel') }}</div>
                <div class="setting-desc">{{ t('settings.gateway.headersDesc') }}</div>
                <div v-for="(row, idx) in form.responsesHeaders" :key="`rh-${idx}`" class="kv-row">
                  <el-input v-model="row.key" :placeholder="t('settings.gateway.kvKey')" />
                  <el-input v-model="row.value" :placeholder="t('settings.gateway.kvValue')" />
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="() => removeKvRow(form.responsesHeaders, idx)"
                  />
                </div>
                <el-button size="small" @click="addKvRow(form.responsesHeaders)">
                  {{ t('settings.gateway.addKvRow') }}
                </el-button>
                <div class="field-label">{{ t('settings.gateway.bodyDefaultsLabel') }}</div>
                <div class="setting-desc">{{ t('settings.gateway.bodyDefaultsDesc') }}</div>
                <div
                  v-for="(row, idx) in form.responsesBodyDefaults"
                  :key="`rb-${idx}`"
                  class="kv-row"
                >
                  <el-input v-model="row.key" :placeholder="t('settings.gateway.kvKey')" />
                  <el-input
                    v-model="row.value"
                    :placeholder="t('settings.gateway.bodyValuePlaceholder')"
                  />
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="() => removeKvRow(form.responsesBodyDefaults, idx)"
                  />
                </div>
                <el-button size="small" @click="addKvRow(form.responsesBodyDefaults)">
                  {{ t('settings.gateway.addKvRow') }}
                </el-button>
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
                <div class="field-label">{{ t('settings.gateway.headersLabel') }}</div>
                <div class="setting-desc">{{ t('settings.gateway.headersDesc') }}</div>
                <div v-for="(row, idx) in form.anthropicHeaders" :key="`ah-${idx}`" class="kv-row">
                  <el-input v-model="row.key" :placeholder="t('settings.gateway.kvKey')" />
                  <el-input v-model="row.value" :placeholder="t('settings.gateway.kvValue')" />
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="() => removeKvRow(form.anthropicHeaders, idx)"
                  />
                </div>
                <el-button size="small" @click="addKvRow(form.anthropicHeaders)">
                  {{ t('settings.gateway.addKvRow') }}
                </el-button>
                <div class="field-label">{{ t('settings.gateway.bodyDefaultsLabel') }}</div>
                <div class="setting-desc">{{ t('settings.gateway.bodyDefaultsDesc') }}</div>
                <div
                  v-for="(row, idx) in form.anthropicBodyDefaults"
                  :key="`ab-${idx}`"
                  class="kv-row"
                >
                  <el-input v-model="row.key" :placeholder="t('settings.gateway.kvKey')" />
                  <el-input
                    v-model="row.value"
                    :placeholder="t('settings.gateway.bodyValuePlaceholder')"
                  />
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="() => removeKvRow(form.anthropicBodyDefaults, idx)"
                  />
                </div>
                <el-button size="small" @click="addKvRow(form.anthropicBodyDefaults)">
                  {{ t('settings.gateway.addKvRow') }}
                </el-button>
              </div>
            </div>

            <div class="form-grid">
              <div class="field-label">{{ t('settings.gateway.modelsLabel') }}</div>
              <el-input
                v-model="form.modelsText"
                type="textarea"
                :rows="2"
                :placeholder="t('settings.gateway.modelsPlaceholder')"
                @input="onModelsTextInput"
              />
              <div class="models-fetch-row">
                <el-button
                  :loading="fetchingModels"
                  :disabled="saving || testingDraft"
                  @click="fetchDraftModels"
                >
                  {{ t('settings.gateway.fetchModels') }}
                </el-button>
                <span v-if="fetchedModels.length" class="setting-desc">
                  {{ t('settings.gateway.fetchModelsHint', { count: fetchedModels.length }) }}
                </span>
              </div>
              <div v-if="fetchedModels.length" class="fetched-models">
                <el-input
                  v-model="modelFilter"
                  clearable
                  size="small"
                  :placeholder="t('settings.gateway.fetchModelsFilter')"
                />
                <el-checkbox-group
                  class="fetched-models-list"
                  :model-value="fetchedCheckedIds"
                  @change="onFetchedSelectionChange"
                >
                  <el-checkbox
                    v-for="m in filteredFetchedModels"
                    :key="m.id"
                    :label="m.id"
                    :value="m.id"
                  >
                    <span class="mono">{{ m.id }}</span>
                    <span v-if="m.name && m.name !== m.id" class="model-name">{{ m.name }}</span>
                  </el-checkbox>
                </el-checkbox-group>
              </div>
              <div class="field-label">{{ t('settings.gateway.defaultModel') }}</div>
              <el-select
                v-model="form.defaultModel"
                clearable
                filterable
                :disabled="enteredModels.length === 0"
                :placeholder="
                  enteredModels.length
                    ? t('settings.gateway.defaultModel')
                    : t('settings.gateway.defaultModelNeedList')
                "
              >
                <el-option v-for="m in enteredModels" :key="m" :label="m" :value="m" />
              </el-select>
            </div>
          </div>

          <template #footer>
            <div class="drawer-footer">
              <el-button @click="cancelEdit">{{ t('common.cancel') }}</el-button>
              <el-button
                :loading="testingDraft"
                :disabled="saving || fetchingModels"
                @click="testDraftProvider"
              >
                {{ t('settings.gateway.testConnection') }}
              </el-button>
              <el-button type="primary" :loading="saving" @click="saveProvider">
                {{ t('common.save') }}
              </el-button>
            </div>
          </template>
        </el-drawer>

        <el-dialog
          v-model="detailVisible"
          :title="detailProvider?.name || t('settings.gateway.viewMore')"
          width="560px"
          destroy-on-close
        >
          <template v-if="detailProvider">
            <div class="detail-section">
              <div class="field-label">{{ t('settings.gateway.supportedProtocols') }}</div>
              <div class="protocol-tags">
                <span
                  v-for="proto in availableProtocols(detailProvider)"
                  :key="proto"
                  class="proto-tag"
                >
                  {{ protocolLabel(proto) }}
                </span>
              </div>
            </div>

            <div
              v-for="proto in availableProtocols(detailProvider)"
              :key="proto"
              class="detail-section"
            >
              <div class="setting-label">{{ protocolLabel(proto) }}</div>
              <div class="setting-desc mono">
                Base URL:
                {{
                  detailProvider.config.protocols[proto]?.baseUrl || detailProvider.config.baseUrl
                }}
              </div>
              <div class="setting-desc">
                API Key:
                {{
                  protocolHasApiKey(detailProvider, proto)
                    ? t('settings.gateway.hasApiKey')
                    : t('settings.gateway.noApiKey')
                }}
              </div>
              <pre class="detail-pre">{{
                formatOverridesPreview(detailProvider.config.protocols[proto])
              }}</pre>
            </div>

            <div class="detail-section">
              <div class="field-label">{{ t('settings.gateway.defaultModel') }}</div>
              <div class="setting-desc mono">{{ detailProvider.config.defaultModel || '—' }}</div>
            </div>
            <div class="detail-section">
              <div class="field-label">{{ t('settings.gateway.modelsLabel') }}</div>
              <div class="setting-desc mono">
                {{ (detailProvider.config.models || []).join(', ') || '—' }}
              </div>
            </div>
          </template>
          <template #footer>
            <el-button
              v-if="detailProvider"
              :type="settings?.defaultProviderId === detailProvider.id ? 'primary' : 'default'"
              :disabled="saving"
              @click="setDefaultProvider(detailProvider.id)"
            >
              {{
                settings?.defaultProviderId === detailProvider.id
                  ? t('settings.gateway.isDefault')
                  : t('settings.gateway.setDefault')
              }}
            </el-button>
            <el-button
              v-if="detailProvider"
              :loading="Boolean(testingIds[detailProvider.id])"
              @click="testSavedProvider(detailProvider.id)"
            >
              {{ t('settings.gateway.testConnection') }}
            </el-button>
            <el-button v-if="detailProvider" type="primary" @click="editFromDetail">
              {{ t('common.edit') }}
            </el-button>
            <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.gateway.tabLocalAccess')" name="localAccess">
        <p class="page-desc">{{ t('settings.gateway.localAccessDesc') }}</p>

        <div class="channel-switch">
          <button
            v-for="channel in channelTabs"
            :key="channel.key"
            type="button"
            class="channel-chip"
            :class="{
              active: activeChannel === channel.key,
              enabled: channel.enabled,
              disabled: channel.disabled && channel.key === 'claudeDesktop'
            }"
            :disabled="channel.disabled && channel.key === 'claudeDesktop'"
            @click="() => (activeChannel = channel.key)"
          >
            <span>{{ channel.label }}</span>
            <span
              v-if="channel.enabled"
              class="tab-dot"
              :title="t('settings.gateway.takeoverOn')"
            />
          </button>
        </div>

        <template v-for="channel in channelTabs" :key="channel.key">
          <div v-show="activeChannel === channel.key">
            <p class="page-desc">{{ t('settings.gateway.channelDesc') }}</p>

            <div class="setting-card">
              <div class="setting-row">
                <div>
                  <div class="setting-label">{{ t('settings.gateway.channelEnable') }}</div>
                  <div class="setting-desc">
                    <template v-if="channel.key === 'claudeCli'">
                      ~/.claude/settings.json
                    </template>
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
                  <div class="setting-desc">
                    <template v-if="channel.key === 'codex'">
                      客户端固定 wire_api=responses。选 Chat = 网关做 Responses↔Chat 转换（含
                      tools）；选 Responses = 上游原生透传。
                    </template>
                    <template v-else>{{ t('settings.gateway.channelProtocolDesc') }}</template>
                  </div>
                </div>
                <el-select
                  :model-value="channelProtocol(channel.key)"
                  style="width: 260px"
                  :disabled="saving"
                  @change="(v: WireProtocol) => setChannelProtocol(channel.key, v)"
                >
                  <el-option
                    v-for="proto in channelProtocolsFor(channel.key)"
                    :key="proto"
                    :label="protocolLabel(proto)"
                    :value="proto"
                    :disabled="proto === 'anthropic' && channel.key === 'codex'"
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
          </div>
        </template>
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
.channel-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.channel-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}
.channel-chip:hover:not(:disabled) {
  border-color: var(--el-color-primary-light-5);
}
.channel-chip.active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.channel-chip:disabled,
.channel-chip.disabled {
  opacity: 0.55;
  cursor: not-allowed;
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
.models-fetch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.fetched-models {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-extra-light);
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-fill-color-blank) 70%, transparent);
}
.fetched-models-list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
}
.fetched-models-list :deep(.el-checkbox) {
  margin-right: 0;
  height: auto;
  align-items: flex-start;
  white-space: normal;
}
.model-name {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
.kv-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
.drawer-body {
  padding-right: 4px;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.provider-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
}
.provider-main {
  min-width: 0;
  flex: 1;
}
.provider-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.default-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
}
.protocol-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.proto-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-extra-light);
}
.detail-section {
  margin-bottom: 14px;
}
.detail-pre {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-regular);
}
.provider-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 12px 0;
}
</style>
