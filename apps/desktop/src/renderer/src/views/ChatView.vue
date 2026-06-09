<script setup lang="ts">
import { watch, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarkdownRender from 'markstream-vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'

const { t } = useI18n()
const router = useRouter()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const messagesEnd = ref<HTMLElement | null>(null)
const streamedMessageIds = ref<Set<string>>(new Set())

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

watch(
  () => {
    const msgs = chatStore.activeConversation?.messages
    if (!msgs || msgs.length === 0) return ''
    return msgs[msgs.length - 1].content
  },
  () => scrollToBottom()
)

function isStreamingMessage(msgId: string): boolean {
  const msgs = chatStore.activeConversation?.messages
  if (!msgs || msgs.length === 0) return false
  const last = msgs[msgs.length - 1]
  const streaming = chatStore.isStreaming && last.id === msgId && last.role === 'assistant'
  if (streaming) {
    streamedMessageIds.value.add(msgId)
  }
  return streaming
}

function wasStreamed(msgId: string): boolean {
  return streamedMessageIds.value.has(msgId)
}

function handleSubmit(text: string): void {
  if (!text || !chatStore.activeConversationId) return
  const agentId = chatStore.activeConversation?.agentId ?? agentStore.selectedAgentId
  chatStore.sendMessage(chatStore.activeConversationId, text, agentId)
}

function handleStop(): void {
  if (chatStore.activeConversationId) {
    chatStore.stopConversation(chatStore.activeConversationId)
  }
}

function handleCancelQueue(index: number): void {
  chatStore.cancelQueuedMessage(index)
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
          <div class="message-content">
            <template v-if="msg.role === 'assistant'">
              <MarkdownRender
                custom-id="chat"
                :content="msg.content"
                :final="!isStreamingMessage(msg.id)"
                :smooth-streaming="isStreamingMessage(msg.id) ? 'auto' : false"
                :fade="!isStreamingMessage(msg.id) && !wasStreamed(msg.id)"
                :typewriter="isStreamingMessage(msg.id)"
                :max-live-nodes="isStreamingMessage(msg.id) ? 0 : undefined"
                :batch-rendering="true"
                :render-batch-size="16"
                :render-batch-delay="8"
                :render-batch-budget-ms="4"
              />
            </template>
            <template v-else>
              {{ msg.content }}
            </template>
          </div>
        </div>
        <div ref="messagesEnd"></div>
      </div>

      <div class="chat-input-area">
        <PromptComposer
          :streaming="chatStore.isStreaming"
          :queued-messages="chatStore.currentQueuedMessages"
          @submit="handleSubmit"
          @stop="handleStop"
          @cancel-queue="handleCancelQueue"
        >
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
  max-width: 85%;
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
  font-size: var(--font-size-base);
  line-height: 1.5;
  word-break: break-word;
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}

.message.user .message-content {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  white-space: pre-wrap;
}

.message.assistant .message-content {
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
