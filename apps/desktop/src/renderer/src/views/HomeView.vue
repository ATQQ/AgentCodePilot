<script setup lang="ts">
import HomeEmptyState from '@renderer/components/home/HomeEmptyState.vue'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'
import ModelSelector from '@renderer/components/home/ModelSelector.vue'
import WorkspaceSelector from '@renderer/components/home/WorkspaceSelector.vue'

function handleSubmit(text: string): void {
  console.log('Submit:', text)
}
</script>

<template>
  <div class="home-view">
    <HomeEmptyState />
    <PromptComposer @submit="handleSubmit">
      <template #selectors>
        <div class="selectors">
          <AgentSelector />
          <ModelSelector />
          <WorkspaceSelector />
        </div>
      </template>
    </PromptComposer>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 32px;
  padding: var(--spacing-xl);
}

.selectors {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
</style>
