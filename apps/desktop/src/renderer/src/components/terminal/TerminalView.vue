<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  terminalId: string
}>()

const containerRef = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let removeDataListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

function initTerminal(): void {
  if (!containerRef.value) return

  term = new Terminal({
    theme: {
      background: 'var(--content-bg, #09090b)',
      foreground: 'var(--content-text, #f4f4f5)',
      cursor: '#a1a1aa',
      selectionBackground: 'rgba(99,102,241,0.3)'
    },
    fontFamily: '"Cascadia Code", "Fira Code", Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 1000,
    cursorBlink: true
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

  fitAddon.fit()

  resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      fitAddon?.fit()
      void window.agentAPI.terminal.resize(props.terminalId, term!.cols, term!.rows)
    })
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
}

onMounted(() => {
  initTerminal()
})

onUnmounted(() => {
  removeDataListener?.()
  resizeObserver?.disconnect()
  term?.dispose()
})

watch(
  () => props.terminalId,
  () => {
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
}

.terminal-view :deep(.xterm) {
  height: 100%;
}

.terminal-view :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
