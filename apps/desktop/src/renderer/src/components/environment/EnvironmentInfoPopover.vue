<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout.store'
import EnvironmentInfoContent from './EnvironmentInfoContent.vue'

const layoutStore = useLayoutStore()

const popoverRef = ref<HTMLElement | null>(null)

function onClickOutside(e: MouseEvent): void {
  if (!layoutStore.envInfoVisible || layoutStore.envInfoPinned) return
  const target = e.target as Node
  if (popoverRef.value && !popoverRef.value.contains(target)) {
    const trigger = (target as HTMLElement).closest?.('[data-env-trigger]')
    if (!trigger) layoutStore.envInfoVisible = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="layoutStore.envInfoVisible && !layoutStore.envInfoPinned"
      ref="popoverRef"
      class="env-popover"
    >
      <EnvironmentInfoContent />
    </div>
  </Teleport>
</template>

<style scoped>
.env-popover {
  position: fixed;
  top: calc(var(--topbar-height) + 4px);
  right: 12px;
  width: var(--env-rail-width);
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 3000;
  padding: var(--spacing-md);
  -webkit-app-region: no-drag;
}
</style>
