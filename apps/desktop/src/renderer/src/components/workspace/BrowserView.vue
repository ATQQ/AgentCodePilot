<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBrowserStore } from '@renderer/stores/browser.store'

const { t } = useI18n()
const browserStore = useBrowserStore()

const inputUrl = ref('')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webviewRef = ref<any>(null)
const linksMenuOpen = ref(false)
const linksMenuRef = ref<HTMLElement | null>(null)

const activeUrl = computed(() => browserStore.currentUrl)
const hasPage = computed(() => browserStore.hasPage)
const emptyDetectedLinks = computed(() => browserStore.suggestedLinks.detected)
const emptyRecentLinks = computed(() => browserStore.suggestedLinks.recent)
const menuDetectedLinks = computed(() => browserStore.suggestedLinks.detected)
const menuRecentLinks = computed(() => browserStore.suggestedLinks.recent)
const hasSuggestedLinks = computed(
  () => menuDetectedLinks.value.length > 0 || menuRecentLinks.value.length > 0
)

watch(
  () => browserStore.scopeKey,
  () => {
    inputUrl.value = browserStore.currentUrl ?? ''
    linksMenuOpen.value = false
  },
  { immediate: true }
)

watch(activeUrl, (url) => {
  inputUrl.value = url ?? ''
})

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

function navigateTo(raw: string): void {
  const url = normalizeUrl(raw)
  if (!url) return
  browserStore.setCurrentUrl(url)
  inputUrl.value = url
  linksMenuOpen.value = false
}

function navigate(): void {
  const url = normalizeUrl(inputUrl.value)
  if (!url) return
  browserStore.setCurrentUrl(url)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') navigate()
}

function onInputBlur(): void {
  const url = normalizeUrl(inputUrl.value)
  if (url && url !== activeUrl.value) {
    navigate()
  } else if (!inputUrl.value.trim()) {
    inputUrl.value = activeUrl.value ?? ''
  }
}

function back(): void {
  webviewRef.value?.goBack?.()
}
function forward(): void {
  webviewRef.value?.goForward?.()
}
function reload(): void {
  webviewRef.value?.reload?.()
}

function toggleLinksMenu(): void {
  linksMenuOpen.value = !linksMenuOpen.value
}

function onDocumentClick(e: MouseEvent): void {
  if (!linksMenuOpen.value) return
  const el = linksMenuRef.value
  if (el && !el.contains(e.target as Node)) {
    linksMenuOpen.value = false
  }
}

function truncateUrl(url: string, max = 48): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
})
</script>

<template>
  <div class="browser-view">
    <div class="bv-toolbar">
      <button class="nav-btn" title="后退" :disabled="!hasPage" @click="back">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <polyline points="7,2 3,6 7,10" />
        </svg>
      </button>
      <button class="nav-btn" title="前进" :disabled="!hasPage" @click="forward">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <polyline points="5,2 9,6 5,10" />
        </svg>
      </button>
      <button class="nav-btn" title="刷新" :disabled="!hasPage" @click="reload">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M10 4a5 5 0 1 0 .5 3.5" />
          <polyline points="10,1 10,4 7,4" />
        </svg>
      </button>
      <input
        v-model="inputUrl"
        class="url-input"
        :placeholder="t('browser.urlPlaceholder')"
        @keydown="onKeydown"
        @blur="onInputBlur"
      />
      <div v-if="hasPage" ref="linksMenuRef" class="links-menu-wrap">
        <button
          class="nav-btn links-btn"
          :class="{ active: linksMenuOpen }"
          :title="t('browser.suggestedLinks')"
          :disabled="!hasSuggestedLinks"
          @click.stop="toggleLinksMenu"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6.5 8.5a3.5 3.5 0 0 1 5 0l1.5 1.5a3.5 3.5 0 0 1-5 5L6.5 13" />
            <path d="M9.5 7.5a3.5 3.5 0 0 1-5 0L3 6a3.5 3.5 0 0 1 5-5l1.5 1.5" />
          </svg>
        </button>
        <div v-if="linksMenuOpen && hasSuggestedLinks" class="links-dropdown">
          <div v-if="menuDetectedLinks.length" class="links-section">
            <div class="links-section-title">{{ t('browser.detectedLinks') }}</div>
            <button
              v-for="link in menuDetectedLinks"
              :key="link"
              class="link-item"
              @click="navigateTo(link)"
            >
              <span class="link-item-url">{{ truncateUrl(link) }}</span>
            </button>
          </div>
          <div v-if="menuRecentLinks.length" class="links-section">
            <div class="links-section-title">{{ t('browser.recentPages') }}</div>
            <button
              v-for="link in menuRecentLinks"
              :key="link"
              class="link-item"
              @click="navigateTo(link)"
            >
              <span class="link-item-url">{{ truncateUrl(link) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!hasPage" class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="24" cy="24" r="18" />
          <ellipse cx="24" cy="24" rx="8" ry="18" />
          <line x1="6" y1="24" x2="42" y2="24" />
          <line x1="24" y1="6" x2="24" y2="42" />
        </svg>
      </div>
      <h2 class="empty-title">{{ t('browser.startBrowsing') }}</h2>
      <p class="empty-desc">{{ t('browser.enterUrlHint') }}</p>

      <div v-if="emptyDetectedLinks.length || emptyRecentLinks.length" class="suggestions">
        <div v-if="emptyDetectedLinks.length" class="suggestion-group">
          <div class="suggestion-label">{{ t('browser.detectedLinks') }}</div>
          <button
            v-for="link in emptyDetectedLinks"
            :key="link"
            class="suggestion-item"
            @click="navigateTo(link)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6.5 8.5a3.5 3.5 0 0 1 5 0l1.5 1.5a3.5 3.5 0 0 1-5 5L6.5 13" />
              <path d="M9.5 7.5a3.5 3.5 0 0 1-5 0L3 6a3.5 3.5 0 0 1 5-5l1.5 1.5" />
            </svg>
            <span>{{ truncateUrl(link, 56) }}</span>
          </button>
        </div>
        <div v-if="emptyRecentLinks.length" class="suggestion-group">
          <div class="suggestion-label">{{ t('browser.recentPages') }}</div>
          <button
            v-for="link in emptyRecentLinks"
            :key="link"
            class="suggestion-item"
            @click="navigateTo(link)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="6" />
              <polyline points="8,4 8,8 11,9" />
            </svg>
            <span>{{ truncateUrl(link, 56) }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- webview tag requires webviewTag: true in BrowserWindow -->
    <!-- eslint-disable vue/html-self-closing -->
    <webview
      v-else
      ref="webviewRef"
      :src="activeUrl!"
      class="bv-webview"
      allowpopups="false"
      disablewebsecurity="false"
    ></webview>
  </div>
</template>

<style scoped>
.browser-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.bv-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.nav-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.nav-btn.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.url-input {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  outline: none;
  min-width: 0;
}

.url-input:focus {
  border-color: var(--composer-border-focus);
}

.links-menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.links-btn {
  width: 24px;
}

.links-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 50;
  min-width: 240px;
  max-width: 360px;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  box-shadow: var(--shadow-md);
}

.links-section + .links-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--sidebar-border);
}

.links-section-title {
  padding: 2px 8px 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--content-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.link-item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
}

.link-item:hover {
  background: var(--sidebar-item-hover);
}

.link-item-url {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  text-align: center;
  overflow-y: auto;
}

.empty-icon {
  color: var(--content-text-tertiary);
  margin-bottom: 12px;
  opacity: 0.6;
}

.empty-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--content-text);
  margin: 0 0 6px;
}

.empty-desc {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
  margin: 0 0 20px;
}

.suggestions {
  width: 100%;
  max-width: 360px;
  text-align: left;
}

.suggestion-group + .suggestion-group {
  margin-top: 12px;
}

.suggestion-label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--content-text-tertiary);
  margin-bottom: 4px;
  padding: 0 4px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
}

.suggestion-item:hover {
  background: var(--sidebar-item-hover);
}

.suggestion-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-item svg {
  flex-shrink: 0;
  color: var(--content-text-secondary);
}

.bv-webview {
  flex: 1;
  width: 100%;
  border: none;
}
</style>
