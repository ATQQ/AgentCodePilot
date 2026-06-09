import { useSettingsStore } from '@renderer/stores/settings.store'
import { toRef } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export function useTheme() {
  const settingsStore = useSettingsStore()
  return { theme: toRef(settingsStore, 'theme') }
}
