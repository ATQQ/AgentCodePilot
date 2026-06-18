<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useSettingsStore } from '@renderer/stores/settings.store'
import {
  attachTerminalSession,
  detachTerminalSession,
  refitTerminalSession,
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

onMounted(() => {
  if (containerRef.value) {
    attachTerminalSession(props.terminalId, containerRef.value)
  }
})

onUnmounted(() => {
  detachTerminalSession(props.terminalId)
})

watch(() => settingsStore.theme, applyThemeToAllTerminalSessions)

watch(
  () => props.active,
  (isActive) => {
    if (isActive) nextTick(() => refit())
  }
)

watch(
  () => props.terminalId,
  (newId, oldId) => {
    if (oldId && oldId !== newId) detachTerminalSession(oldId)
    if (containerRef.value && newId) attachTerminalSession(newId, containerRef.value)
  }
)

defineExpose({ refit })
</script>

<template>
  <div ref="containerRef" class="terminal-view" />
</template>

<style scoped>
.terminal-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-view :deep(.terminal-view-host) {
  width: 100%;
  height: 100%;
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

.terminal-view :deep(.xterm-rows) {
  color: var(--content-text);
}
</style>
