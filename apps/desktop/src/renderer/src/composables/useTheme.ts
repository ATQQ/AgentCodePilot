import { useSettingsStore } from '@renderer/stores/settings.store'
import { toRef, type Ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export function useTheme(): { theme: Ref<ThemeMode> } {
  const settingsStore = useSettingsStore()
  return { theme: toRef(settingsStore, 'theme') }
}
