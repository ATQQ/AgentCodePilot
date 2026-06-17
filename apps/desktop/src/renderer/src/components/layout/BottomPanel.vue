<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout.store'
import ResizableSplit from './ResizableSplit.vue'

const TerminalTabs = defineAsyncComponent(
  () => import('@renderer/components/terminal/TerminalTabs.vue')
)

const layoutStore = useLayoutStore()
</script>

<template>
  <div class="bottom-panel" :style="{ height: `${layoutStore.bottomPanelHeight}px` }">
    <ResizableSplit
      direction="vertical"
      invert
      :size="layoutStore.bottomPanelHeight"
      :min-size="120"
      :max-size="600"
      @update:size="layoutStore.bottomPanelHeight = $event"
    />
    <div class="bottom-panel-inner">
      <Suspense>
        <TerminalTabs />
      </Suspense>
    </div>
  </div>
</template>

<style scoped>
.bottom-panel {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--sidebar-border);
  background: var(--content-bg);
  flex-shrink: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.bottom-panel-inner {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
