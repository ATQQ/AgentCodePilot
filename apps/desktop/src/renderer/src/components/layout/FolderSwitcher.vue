<script setup lang="ts">
import { usePanelContextStore } from '@renderer/stores/panelContext.store'

const panelContext = usePanelContextStore()
</script>

<template>
  <div
    v-if="panelContext.isWorkspaceContext && panelContext.availableFolders.length > 1"
    class="folder-switcher"
  >
    <select
      class="folder-select"
      :value="panelContext.effectivePanelCwd"
      @change="panelContext.selectFolder(($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="folder in panelContext.availableFolders"
        :key="folder.path"
        :value="folder.path"
      >
        {{ folder.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.folder-switcher {
  padding: 4px 8px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.folder-select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--sidebar-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  outline: none;
  cursor: pointer;
}

.folder-select:focus {
  border-color: var(--composer-border-focus);
}
</style>
