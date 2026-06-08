import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'agent-desktop-theme'

function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'light'
}

function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function applyTheme(mode: ThemeMode): void {
  const effective = getEffectiveTheme(mode)
  document.documentElement.classList.toggle('dark', effective === 'dark')
}

const theme = ref<ThemeMode>(getStoredTheme())

applyTheme(theme.value)

watch(theme, (newMode) => {
  localStorage.setItem(STORAGE_KEY, newMode)
  applyTheme(newMode)
})

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme.value === 'system') {
    applyTheme('system')
  }
})

export function useTheme() {
  return { theme }
}
