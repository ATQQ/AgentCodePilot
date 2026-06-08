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
    <div class="home-center">
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
  gap: 32px;
  width: 100%;
  max-width: 720px;
}

.selectors {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
</style>
