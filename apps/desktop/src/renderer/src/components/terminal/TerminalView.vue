<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useSettingsStore } from '@renderer/stores/settings.store'
import {
  attachTerminalSession,
  detachTerminalSession,
  refitTerminalSession,
  focusTerminalSession,
  applyThemeToAllTerminalSessions
} from '@renderer/utils/terminal-session-manager'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  terminalId: string
  active?: boolean
}>()

const settingsStore = useSettingsStore()
const containerRef = ref<HTMLElement | null>(null)

function refit(): void {
  refitTerminalSession(props.terminalId)
}

function focus(): void {
  focusTerminalSession(props.terminalId)
}

onMounted(() => {
  if (containerRef.value) {
    attachTerminalSession(props.terminalId, containerRef.value)
    if (props.active) nextTick(() => focus())
  }
})

onUnmounted(() => {
  detachTerminalSession(props.terminalId)
})

watch(
  () => settingsStore.theme,
  () => nextTick(() => applyThemeToAllTerminalSessions())
)

watch(
  () => props.active,
  (isActive) => {
    if (!isActive) return
    nextTick(() => {
      refit()
      focus()
    })
  }
)

watch(
  () => props.terminalId,
  (newId, oldId) => {
    if (oldId && oldId !== newId) detachTerminalSession(oldId)
    if (containerRef.value && newId) attachTerminalSession(newId, containerRef.value)
  }
)

defineExpose({ refit, focus })
</script>

<template>
  <div ref="containerRef" class="terminal-view" @mousedown="focus" />
</template>

<style scoped>
.terminal-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--content-bg);
}

.terminal-view :deep(.terminal-view-host) {
  width: 100%;
  height: 100%;
}

.terminal-view :deep(.xterm) {
  height: 100%;
  background: var(--content-bg);
}

.terminal-view :deep(.xterm-viewport) {
  background-color: var(--content-bg) !important;
}

.terminal-view :deep(.xterm-screen) {
  background-color: var(--content-bg) !important;
  overflow: hidden;
}
</style>
