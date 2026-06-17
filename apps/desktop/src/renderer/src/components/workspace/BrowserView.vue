<script setup lang="ts">
import { ref } from 'vue'

const url = ref('https://example.com')
const inputUrl = ref(url.value)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webviewRef = ref<any>(null)

function navigate(): void {
  url.value = inputUrl.value.startsWith('http') ? inputUrl.value : 'https://' + inputUrl.value
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') navigate()
}

function back(): void { webviewRef.value?.goBack?.() }
function forward(): void { webviewRef.value?.goForward?.() }
function reload(): void { webviewRef.value?.reload?.() }
</script>

<template>
  <div class="browser-view">
    <div class="bv-toolbar">
      <button class="nav-btn" title="后退" @click="back">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <polyline points="7,2 3,6 7,10" />
        </svg>
      </button>
      <button class="nav-btn" title="前进" @click="forward">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <polyline points="5,2 9,6 5,10" />
        </svg>
      </button>
      <button class="nav-btn" title="刷新" @click="reload">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M10 4a5 5 0 1 0 .5 3.5" />
          <polyline points="10,1 10,4 7,4" />
        </svg>
      </button>
      <input
        v-model="inputUrl"
        class="url-input"
        placeholder="输入网址…"
        @keydown="onKeydown"
        @blur="navigate"
      />
    </div>
    <!-- webview tag requires webviewTag: true in BrowserWindow -->
    <!-- eslint-disable vue/html-self-closing -->
    <webview
      ref="webviewRef"
      :src="url"
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

.nav-btn:hover {
  background: var(--sidebar-item-hover);
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
}

.url-input:focus {
  border-color: var(--composer-border-focus);
}

.bv-webview {
  flex: 1;
  width: 100%;
  border: none;
}
</style>
