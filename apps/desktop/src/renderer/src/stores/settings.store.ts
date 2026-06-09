import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode, ApprovalLevel } from '@renderer/types'

const THEME_STORAGE_KEY = 'agent-desktop-theme'

function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'light'
}

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
  const theme = ref<ThemeMode>(getStoredTheme())
  const approvalLevel = ref<ApprovalLevel>('request')
  const language = ref('zh-CN')

  applyThemeToDOM(theme.value)

  watch(theme, (newMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, newMode)
    applyThemeToDOM(newMode)
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') {
      applyThemeToDOM('system')
    }
  })

  function setTheme(mode: ThemeMode): void {
    theme.value = mode
  }

  function setApprovalLevel(level: ApprovalLevel): void {
    approvalLevel.value = level
  }

  return { theme, approvalLevel, language, setTheme, setApprovalLevel }
})
