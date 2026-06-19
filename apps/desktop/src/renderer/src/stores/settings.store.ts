import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode, ApprovalLevel, FilePreviewSettings, AiPromptsSettings, ExternalAppsSettings, CustomExternalApp, ReplyLanguage } from '@renderer/types'
import {
  DEFAULT_FILE_PREVIEW,
  DEFAULT_AI_PROMPTS
} from '@renderer/constants/defaults'
import {
  DEFAULT_MAX_AGENT_TURNS,
  clampMaxAgentTurns
} from '../../../shared/agent-run-settings'
import {
  DEFAULT_EXTERNAL_APPS_SETTINGS,
  findExternalAppById,
  getVisibleExternalApps,
  resolveDefaultAppId
} from '@renderer/constants/externalApps'
import type { ExternalAppDefinition } from '@renderer/types'
import { isWindowsPlatform } from '@renderer/utils/externalAppIcons'

function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function applyThemeToDOM(mode: ThemeMode): void {
  const effective = getEffectiveTheme(mode)
  document.documentElement.classList.toggle('dark', effective === 'dark')
}

function normalizeExtensions(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[\n,;\s]+/)
      .map((s) => s.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean)
  )]
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('light')
  const approvalLevel = ref<ApprovalLevel>('auto')
  const language = ref('zh-CN')
  const replyLanguage = ref<ReplyLanguage>('auto')
  const permissionNotificationsEnabled = ref(true)
  const rememberPanelStatePerConversation = ref(true)
  const filePreview = ref<FilePreviewSettings>({ ...DEFAULT_FILE_PREVIEW })
  const aiPrompts = ref<AiPromptsSettings>({ ...DEFAULT_AI_PROMPTS })
  const externalApps = ref<ExternalAppsSettings>({ ...DEFAULT_EXTERNAL_APPS_SETTINGS })
  const maxAgentTurns = ref(DEFAULT_MAX_AGENT_TURNS)

  applyThemeToDOM(theme.value)

  watch(theme, (newMode) => {
    applyThemeToDOM(newMode)
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') {
      applyThemeToDOM('system')
    }
  })

  async function fetchSettings(): Promise<void> {
    const settings = await window.agentAPI.settings.get()
    theme.value = settings.theme
    approvalLevel.value = settings.approvalLevel
    language.value = settings.language
    replyLanguage.value = settings.replyLanguage
    permissionNotificationsEnabled.value = settings.permissionNotificationsEnabled
    rememberPanelStatePerConversation.value = settings.rememberPanelStatePerConversation
    filePreview.value = settings.filePreview
    aiPrompts.value = settings.aiPrompts
    externalApps.value = settings.externalApps
    maxAgentTurns.value = settings.maxAgentTurns
    applyThemeToDOM(settings.theme)
  }

  async function setTheme(mode: ThemeMode): Promise<void> {
    theme.value = mode
    await window.agentAPI.settings.update({ theme: mode })
  }

  async function setApprovalLevel(level: ApprovalLevel): Promise<void> {
    approvalLevel.value = level
    await window.agentAPI.settings.update({ approvalLevel: level })
  }

  async function setReplyLanguage(lang: ReplyLanguage): Promise<void> {
    replyLanguage.value = lang
    await window.agentAPI.settings.update({ replyLanguage: lang })
  }

  async function setRememberPanelStatePerConversation(enabled: boolean): Promise<void> {
    rememberPanelStatePerConversation.value = enabled
    await window.agentAPI.settings.update({ rememberPanelStatePerConversation: enabled })
  }

  async function setPermissionNotificationsEnabled(enabled: boolean): Promise<void> {
    permissionNotificationsEnabled.value = enabled
    await window.agentAPI.settings.update({ permissionNotificationsEnabled: enabled })
  }

  async function setFilePreview(value: FilePreviewSettings): Promise<void> {
    filePreview.value = value
    await window.agentAPI.settings.update({ filePreview: value })
  }

  async function setAiPrompts(value: AiPromptsSettings): Promise<void> {
    aiPrompts.value = value
    await window.agentAPI.settings.update({ aiPrompts: value })
  }

  async function setExternalApps(value: ExternalAppsSettings): Promise<void> {
    externalApps.value = value
    await window.agentAPI.settings.update({ externalApps: value })
  }

  async function addCustomExternalApp(
    name: string,
    protocol: string,
    iconUrl?: string,
    iconSvg?: string
  ): Promise<void> {
    const trimmedName = name.trim()
    const trimmedProtocol = protocol.trim()
    if (!trimmedName || !trimmedProtocol.includes('{path}')) return
    const id = `custom-${Date.now()}`
    await setExternalApps({
      ...externalApps.value,
      customApps: [
        ...externalApps.value.customApps,
        {
          id,
          name: trimmedName,
          protocol: trimmedProtocol,
          iconUrl: iconUrl?.trim() || undefined,
          iconSvg: iconSvg?.trim() || undefined
        }
      ]
    })
  }

  async function updateCustomExternalApp(
    id: string,
    patch: Partial<Pick<CustomExternalApp, 'name' | 'protocol' | 'iconUrl' | 'iconSvg'>>
  ): Promise<void> {
    await setExternalApps({
      ...externalApps.value,
      customApps: externalApps.value.customApps.map((app) =>
        app.id === id ? { ...app, ...patch } : app
      )
    })
  }

  async function toggleBuiltinExternalApp(appId: string, visible: boolean): Promise<void> {
    const disabled = new Set(externalApps.value.disabledBuiltinIds ?? [])
    if (visible) {
      disabled.delete(appId)
    } else {
      disabled.add(appId)
    }
    const nextDisabled = [...disabled]
    let nextDefault = externalApps.value.defaultAppId
    if (!visible && nextDefault === appId) {
      nextDefault = DEFAULT_EXTERNAL_APPS_SETTINGS.defaultAppId
    }
    await setExternalApps({
      ...externalApps.value,
      defaultAppId: nextDefault,
      disabledBuiltinIds: nextDisabled
    })
  }

  async function removeCustomExternalApp(id: string): Promise<void> {
    const nextCustom = externalApps.value.customApps.filter((app) => app.id !== id)
    const nextDefault =
      externalApps.value.defaultAppId === id
        ? DEFAULT_EXTERNAL_APPS_SETTINGS.defaultAppId
        : externalApps.value.defaultAppId
    await setExternalApps({
      defaultAppId: nextDefault,
      customApps: nextCustom
    })
  }

  async function setDefaultExternalApp(appId: string): Promise<void> {
    await setExternalApps({ ...externalApps.value, defaultAppId: appId })
  }

  function getRuntimePlatform(): NodeJS.Platform {
    const platform = window.electron?.process?.platform
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') return platform
    return isWindowsPlatform() ? 'win32' : 'darwin'
  }

  function getResolvedDefaultAppId(): string {
    return resolveDefaultAppId(externalApps.value, getRuntimePlatform())
  }

  function getMergedExternalApps(): ExternalAppDefinition[] {
    return getVisibleExternalApps(externalApps.value, getRuntimePlatform())
  }

  function findAppById(appId: string): ExternalAppDefinition | undefined {
    return findExternalAppById(appId, externalApps.value, getRuntimePlatform())
  }

  async function setMaxAgentTurns(turns: number): Promise<void> {
    const next = clampMaxAgentTurns(turns)
    maxAgentTurns.value = next
    await window.agentAPI.settings.update({ maxAgentTurns: next })
  }

  async function addTextExtension(ext: string): Promise<void> {
    const normalized = ext.trim().replace(/^\./, '').toLowerCase()
    if (!normalized || filePreview.value.textExtensions.includes(normalized)) return
    const next = {
      ...filePreview.value,
      textExtensions: [...filePreview.value.textExtensions, normalized]
    }
    await setFilePreview(next)
  }

  function extensionsToText(extensions: string[]): string {
    return extensions.join(', ')
  }

  function textToExtensions(text: string): string[] {
    return normalizeExtensions(text)
  }

  return {
    theme,
    approvalLevel,
    language,
    replyLanguage,
    permissionNotificationsEnabled,
    rememberPanelStatePerConversation,
    filePreview,
    aiPrompts,
    externalApps,
    maxAgentTurns,
    fetchSettings,
    setTheme,
    setApprovalLevel,
    setReplyLanguage,
    setRememberPanelStatePerConversation,
    setPermissionNotificationsEnabled,
    setFilePreview,
    setAiPrompts,
    setExternalApps,
    setMaxAgentTurns,
    addCustomExternalApp,
    updateCustomExternalApp,
    toggleBuiltinExternalApp,
    removeCustomExternalApp,
    setDefaultExternalApp,
    getMergedExternalApps,
    getResolvedDefaultAppId,
    findAppById,
    addTextExtension,
    extensionsToText,
    textToExtensions
  }
})
