import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode, ApprovalLevel, FilePreviewSettings, AiPromptsSettings } from '@renderer/types'
import {
  DEFAULT_FILE_PREVIEW,
  DEFAULT_AI_PROMPTS
} from '@renderer/constants/defaults'

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
  const permissionNotificationsEnabled = ref(true)
  const filePreview = ref<FilePreviewSettings>({ ...DEFAULT_FILE_PREVIEW })
  const aiPrompts = ref<AiPromptsSettings>({ ...DEFAULT_AI_PROMPTS })

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
    permissionNotificationsEnabled.value = settings.permissionNotificationsEnabled
    filePreview.value = settings.filePreview
    aiPrompts.value = settings.aiPrompts
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
    permissionNotificationsEnabled,
    filePreview,
    aiPrompts,
    fetchSettings,
    setTheme,
    setApprovalLevel,
    setPermissionNotificationsEnabled,
    setFilePreview,
    setAiPrompts,
    addTextExtension,
    extensionsToText,
    textToExtensions
  }
})
