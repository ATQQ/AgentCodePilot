<script setup lang="ts">
import { useRouter } from 'vue-router'
import HomeEmptyState from '@renderer/components/home/HomeEmptyState.vue'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'
import WorkspaceSelector from '@renderer/components/home/WorkspaceSelector.vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'

const router = useRouter()
const chatStore = useChatStore()
const agentStore = useAgentStore()

async function handleSubmit(text: string): Promise<void> {
  const agentId = agentStore.selectedAgentId
  const convId = await chatStore.createConversation(agentId, text)
  router.push('/chat')
  await window.agentAPI.chat.sendMessage({ conversationId: convId, content: text, agentId })
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
