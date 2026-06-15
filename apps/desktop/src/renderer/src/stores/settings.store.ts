import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode, ApprovalLevel } from '@renderer/types'

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

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('light')
  const approvalLevel = ref<ApprovalLevel>('auto')
  const language = ref('zh-CN')
  const permissionNotificationsEnabled = ref(true)

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

  return {
    theme,
    approvalLevel,
    language,
    permissionNotificationsEnabled,
    fetchSettings,
    setTheme,
    setApprovalLevel,
    setPermissionNotificationsEnabled
  }
})
