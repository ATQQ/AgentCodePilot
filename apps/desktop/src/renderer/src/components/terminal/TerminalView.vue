<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore } from '@renderer/stores/settings.store'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  terminalId: string
}>()

const settingsStore = useSettingsStore()
const containerRef = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let removeDataListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let resizeRaf = 0

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function getXtermTheme(): ITheme {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    background: cssVar('--content-bg') || (isDark ? '#09090b' : '#ffffff'),
    foreground: cssVar('--content-text') || (isDark ? '#f4f4f5' : '#111827'),
    cursor: cssVar('--content-text-secondary') || (isDark ? '#a1a1aa' : '#6b7280'),
    cursorAccent: cssVar('--content-bg') || (isDark ? '#09090b' : '#ffffff'),
    selectionBackground: isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(59, 130, 246, 0.25)',
    selectionForeground: cssVar('--content-text') || (isDark ? '#f4f4f5' : '#111827')
  }
}

function applyTheme(): void {
  if (!term) return
  const theme = getXtermTheme()
  term.options.theme = theme
  // xterm caches some colors; refresh the canvas
  term.refresh(0, term.rows - 1)
}

function notifyResize(): void {
  if (!fitAddon || !term) return
  fitAddon.fit()
  const { cols, rows } = term
  if (cols < 1 || rows < 1) return
  void window.agentAPI.terminal.resize(props.terminalId, cols, rows)
}

function scheduleResize(): void {
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    notifyResize()
  })
}

function onVisibilityChange(): void {
  if (document.hidden) return
  scheduleResize()
}

function initTerminal(): void {
  if (!containerRef.value) return

  term = new Terminal({
    theme: getXtermTheme(),
    fontFamily: '"Cascadia Code", "Fira Code", Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 1000,
    cursorBlink: true,
    allowProposedApi: true
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(containerRef.value)

  term.onData((data) => {
    window.agentAPI.terminal.write(props.terminalId, data)
  })

  removeDataListener = window.agentAPI.terminal.onData(({ terminalId, data }) => {
    if (terminalId === props.terminalId) {
      term?.write(data)
    }
  })

  // Defer first fit until layout has settled
  requestAnimationFrame(() => scheduleResize())

  resizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 }
    if (width > 0 && height > 0) scheduleResize()
  })
  resizeObserver.observe(containerRef.value)
}

onMounted(() => {
  initTerminal()
  themeObserver = new MutationObserver(() => applyTheme())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  removeDataListener?.()
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  term?.dispose()
})

watch(() => settingsStore.theme, applyTheme)

watch(
  () => props.terminalId,
  () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf)
    term?.dispose()
    resizeObserver?.disconnect()
    removeDataListener?.()
    term = null
    initTerminal()
  }
)
</script>

<template>
  <div ref="containerRef" class="terminal-view" />
</template>

<style scoped>
.terminal-view {
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--content-bg);
}

.terminal-view :deep(.xterm) {
  height: 100%;
}

.terminal-view :deep(.xterm-viewport) {
  overflow-y: auto !important;
  background-color: var(--content-bg) !important;
}

.terminal-view :deep(.xterm-screen) {
  background-color: var(--content-bg) !important;
}
</style>
