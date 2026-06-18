<script setup lang="ts">
import { useRouter } from 'vue-router'
import HomeEmptyState from '@renderer/components/home/HomeEmptyState.vue'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'
import ModelSelector from '@renderer/components/home/ModelSelector.vue'
import WorkspaceSelector from '@renderer/components/home/WorkspaceSelector.vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useModelStore } from '@renderer/stores/model.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import type { Attachment, PlanReference } from '@renderer/types'

const router = useRouter()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const modelStore = useModelStore()
const workspaceStore = useWorkspaceStore()
const composerStore = useComposerStore()

async function handleSubmit(
  text: string,
  attachments: Attachment[],
  planMode: boolean,
  _planRefs: PlanReference[]
): Promise<void> {
  const agentId = agentStore.selectedAgentId
  const projectId = workspaceStore.selectedProjectId
  const convId = await chatStore.createConversation(agentId, text, projectId, attachments, planMode)
  composerStore.transferHomePlanModeToConversation(convId)
  if (planMode) composerStore.setPlanMode(convId, true)
  router.push('/chat')
  const conv = chatStore.activeConversation
  const cwd = conv?.cwd || workspaceStore.currentCwd
  const persistedAttachments = conv?.messages[0]?.attachments
  const attachmentPayloads = persistedAttachments?.map((a) => {
    if (a.type === 'url') return { id: a.id, type: 'url' as const, url: a.url }
    return { id: a.id, type: a.type, name: a.name, path: a.path }
  })
  const wsFolders = workspaceStore.currentWorkspace?.folders
  await window.agentAPI.chat.sendFirstMessage({
    conversationId: convId,
    content: text,
    agentId,
    modelId: modelStore.getEffectiveModelId(),
    cwd,
    workspaceFolders: wsFolders && wsFolders.length > 1 ? [...wsFolders] : undefined,
    attachments: attachmentPayloads && attachmentPayloads.length > 0 ? attachmentPayloads : undefined,
    planMode
  })
}
</script>

<template>
  <div class="home-view elegant-scroll">
    <div class="home-center">
      <HomeEmptyState />
      <div class="composer-wrapper">
        <PromptComposer @submit="handleSubmit">
          <template #selectors="{ compact }">
            <AgentSelector :compact="compact" />
            <ModelSelector :compact="compact" />
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
