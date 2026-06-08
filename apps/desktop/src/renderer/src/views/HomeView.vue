<script setup lang="ts">
import HomeEmptyState from '@renderer/components/home/HomeEmptyState.vue'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'
import WorkspaceSelector from '@renderer/components/home/WorkspaceSelector.vue'

function handleSubmit(text: string): void {
  console.log('Submit:', text)
}
</script>

<template>
  <div class="home-view">
    <div class="home-center">
      <HomeEmptyState />
      <div class="composer-wrapper">
        <PromptComposer @submit="handleSubmit">
          <template #selectors>
            <AgentSelector />
          </template>
        </PromptComposer>
        <WorkspaceSelector />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--spacing-xl);
  overflow: auto;
}

.home-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2xl);
  width: 100%;
  max-width: 640px;
}

.composer-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  width: 100%;
}
</style>
