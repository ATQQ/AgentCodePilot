<script setup lang="ts">
import { watch, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'

const { t } = useI18n()
const router = useRouter()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const messagesEnd = ref<HTMLElement | null>(null)

if (!chatStore.activeConversation) {
  router.replace('/')
}

function scrollToBottom(): void {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(
  () => chatStore.activeConversation?.messages.length,
  () => scrollToBottom()
)

function handleSubmit(text: string): void {
  if (!text || !chatStore.activeConversationId) return
  chatStore.addMessage(chatStore.activeConversationId, 'user', text)
  simulateMockReply(chatStore.activeConversationId)
}

function simulateMockReply(conversationId: string): void {
  setTimeout(() => {
    const agentName = agentStore.currentAgent?.name ?? 'Agent'
    chatStore.addMessage(
      conversationId,
      'assistant',
      `[${agentName} mock] 收到你的消息，这是一条模拟回复。后续接入真实 Agent SDK 后将替换为真实响应。`
    )
  }, 800)
}

</script>

<template>
  <div class="chat-view">
    <template v-if="chatStore.activeConversation">
      <div class="chat-header">
        <h3 class="chat-title">{{ chatStore.activeConversation.title }}</h3>
      </div>

      <div class="messages-container">
        <div
          v-for="msg in chatStore.activeConversation.messages"
          :key="msg.id"
          class="message"
          :class="msg.role"
        >
          <div class="message-role">{{ msg.role === 'user' ? t('chat.you') : agentStore.currentAgent?.name }}</div>
          <div class="message-content">{{ msg.content }}</div>
        </div>
        <div ref="messagesEnd"></div>
      </div>

      <div class="chat-input-area">
        <PromptComposer @submit="handleSubmit">
          <template #selectors>
            <AgentSelector />
          </template>
        </PromptComposer>
      </div>
    </template>

    <div v-else class="no-conversation">
      <p>{{ t('chat.noConversation') }}</p>
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.chat-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--content-text);
  margin: 0;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  -webkit-user-select: text;
  user-select: text;
}

.message {
  max-width: 80%;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-role {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--content-text-secondary);
  margin-bottom: 4px;
}

.message-content {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-base);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}

.message.user .message-content {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}

.message.assistant .message-content {
  background: var(--btn-secondary-bg);
  color: var(--content-text);
}

.chat-input-area {
  padding: var(--spacing-md) var(--spacing-lg);
  flex-shrink: 0;
}

.no-conversation {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--content-text-secondary);
}
</style>
