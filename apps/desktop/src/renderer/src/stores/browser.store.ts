import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTerminalStore } from './terminal.store'
import { useChatStore } from './chat.store'
import { useSettingsStore } from './settings.store'
import { extractHttpUrlsFromTexts } from '@renderer/utils/extractUrls'
import { getAllTerminalTexts, terminalOutputRevision } from '@renderer/utils/terminal-session-manager'

const STORAGE_KEY = 'browser-state'
const MAX_RECENT = 20

interface BrowserScopeState {
  currentUrl: string | null
  recentUrls: string[]
}

function loadAllStates(): Record<string, BrowserScopeState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, BrowserScopeState>
  } catch {
    /* ignore */
  }
  return {}
}

function persistStates(states: Record<string, BrowserScopeState>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
  } catch {
    /* ignore */
  }
}

export const useBrowserStore = defineStore('browser', () => {
  const terminalStore = useTerminalStore()
  const chatStore = useChatStore()
  const settingsStore = useSettingsStore()

  const stateByScope = ref<Record<string, BrowserScopeState>>(loadAllStates())

  const scopeKey = computed(() => terminalStore.currentScopeKey ?? 'global')

  const scopeState = computed(() => stateByScope.value[scopeKey.value] ?? { currentUrl: null, recentUrls: [] })

  const currentUrl = computed(() => scopeState.value.currentUrl)

  const recentUrls = computed(() => scopeState.value.recentUrls)

  const hasPage = computed(() => !!currentUrl.value)

  function setCurrentUrl(url: string | null): void {
    const key = scopeKey.value
    const prev = stateByScope.value[key] ?? { currentUrl: null, recentUrls: [] }
    let recent = prev.recentUrls
    if (url) {
      recent = [url, ...recent.filter((u) => u !== url)].slice(0, MAX_RECENT)
    }
    stateByScope.value = {
      ...stateByScope.value,
      [key]: { currentUrl: url, recentUrls: recent }
    }
    persistStates(stateByScope.value)
  }

  function collectSourceTexts(): string[] {
    const texts = getAllTerminalTexts()
    const conv = chatStore.activeConversation
    if (conv) {
      for (const msg of conv.messages) {
        texts.push(msg.content)
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            texts.push(JSON.stringify(tc.input))
            if (tc.summary) texts.push(tc.summary)
          }
        }
      }
    }
    return texts
  }

  const detectedLinks = computed(() => {
    if (!settingsStore.browserAutoExtractLinks) return []
    void terminalOutputRevision.value
    return extractHttpUrlsFromTexts(collectSourceTexts())
  })

  const suggestedLinks = computed(() => {
    const current = currentUrl.value
    const detected = detectedLinks.value.filter((url) => url !== current)
    const recent = recentUrls.value.filter((url) => url !== current && !detected.includes(url))
    return { detected, recent }
  })

  return {
    scopeKey,
    currentUrl,
    recentUrls,
    hasPage,
    detectedLinks,
    suggestedLinks,
    setCurrentUrl
  }
})
