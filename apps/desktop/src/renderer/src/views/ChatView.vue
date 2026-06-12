<script setup lang="ts">
import { watch, nextTick, ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarkdownRender from 'markstream-vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'
import claudeIcon from '@renderer/assets/claude-icon.svg'
import codexIcon from '@renderer/assets/codex-icon.svg'
import cursorIcon from '@renderer/assets/cursor-icon.svg'
import type { Attachment } from '@renderer/types'

const agentIcons: Record<string, string> = {
  'claude-code': claudeIcon,
  'codex': codexIcon,
  'cursor': cursorIcon
}

const { t } = useI18n()
const router = useRouter()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const messagesEnd = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof PromptComposer> | null>(null)
const streamedMessageIds = ref<Set<string>>(new Set())
const copiedMessageId = ref<string | null>(null)
const waitingSeconds = ref(0)
const debugMode = ref(false)
let debugClickCount = 0
let debugClickTimer: ReturnType<typeof setTimeout> | null = null
let waitingTimer: ReturnType<typeof setInterval> | null = null

function handleDebugClick(): void {
  debugClickCount++
  if (debugClickTimer) clearTimeout(debugClickTimer)
  debugClickTimer = setTimeout(() => { debugClickCount = 0 }, 1500)
  if (debugClickCount >= 5) {
    debugMode.value = !debugMode.value
    debugClickCount = 0
  }
}

if (!chatStore.activeConversation) {
  router.replace('/')
}

function scrollToBottom(): void {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(
  () => chatStore.isWaiting,
  (waiting) => {
    if (waiting) {
      waitingSeconds.value = 0
      waitingTimer = setInterval(() => { waitingSeconds.value++ }, 1000)
      scrollToBottom()
    } else {
      if (waitingTimer) { clearInterval(waitingTimer); waitingTimer = null }
    }
  },
  { immediate: true }
)

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

onUnmounted(() => {
  if (waitingTimer) clearInterval(waitingTimer)
})

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

function handleSubmit(text: string, attachments: Attachment[]): void {
  if ((!text && attachments.length === 0) || !chatStore.activeConversationId) return
  const agentId = chatStore.activeConversation?.agentId ?? agentStore.selectedAgentId
  chatStore.sendMessage(chatStore.activeConversationId, text, agentId, attachments)
}

function handleStop(): void {
  if (chatStore.activeConversationId) {
    chatStore.stopConversation(chatStore.activeConversationId)
  }
}

function handleCancelQueue(index: number): void {
  chatStore.cancelQueuedMessage(index)
}

const currentAgentIcon = computed(() => {
  const agentId = chatStore.activeConversation?.agentId ?? agentStore.selectedAgentId
  return agentIcons[agentId] || claudeIcon
})

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

async function copyMessage(msg: { id: string; content: string }): Promise<void> {
  await navigator.clipboard.writeText(msg.content)
  copiedMessageId.value = msg.id
  setTimeout(() => {
    if (copiedMessageId.value === msg.id) copiedMessageId.value = null
  }, 2000)
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

function resendMessage(content: string): void {
  composerRef.value?.setInput(content)
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
          <div v-if="msg.role === 'assistant'" class="message-role">
            <span class="agent-avatar">
              <img :src="currentAgentIcon" width="14" height="14" alt="" />
            </span>
            {{ agentStore.currentAgent?.name }}
          </div>
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
              <div v-if="msg.attachments?.length" class="message-attachments">
                <div v-for="(att, idx) in msg.attachments" :key="att.id" class="msg-attachment">
                  <template v-if="att.type === 'image'">
                    <img class="msg-attachment-img" :src="att.previewUrl || `file://${att.path}`" :alt="att.name" />
                  </template>
                  <template v-else-if="att.type === 'file'">
                    <span class="msg-attachment-chip">&#x1F4C4; {{ att.name }}</span>
                  </template>
                  <template v-else-if="att.type === 'url'">
                    <span class="msg-attachment-chip msg-attachment-url">
                      <span class="msg-url-label">&#x1F517; #{{ idx + 1 }} {{ att.url }}</span>
                      <span class="msg-attachment-tooltip">
                        <button class="tooltip-copy" @click.stop="copyText(att.url)">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <span class="tooltip-url">{{ att.url }}</span>
                      </span>
                    </span>
                  </template>
                </div>
              </div>
              {{ msg.content }}
            </template>
          </div>
          <div class="message-actions">
            <button class="action-btn" :title="t('chat.copy')" @click="copyMessage(msg)">
              <svg v-if="copiedMessageId === msg.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button v-if="msg.role === 'user'" class="action-btn" :title="t('chat.resend')" @click="resendMessage(msg.content)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <span v-if="msg.usage" class="action-tokens">输入 {{ msg.usage.inputTokens }} token 输出 {{ msg.usage.outputTokens }} token<template v-if="msg.usage.costUSD"> 成本 ${{ msg.usage.costUSD.toFixed(4) }}</template></span>
            <span class="action-time">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <div v-if="debugMode && msg.role === 'assistant'" class="debug-panel">
            <div class="debug-section">
              <span class="debug-label">REQUEST</span>
              <pre class="debug-json">{{ msg.debugInput ? JSON.stringify(JSON.parse(msg.debugInput), null, 2) : '(无数据)' }}</pre>
            </div>
            <div class="debug-section">
              <span class="debug-label">RESPONSE</span>
              <pre class="debug-json">{{ msg.debugOutput ? JSON.stringify(JSON.parse(msg.debugOutput), null, 2) : '(无数据)' }}</pre>
            </div>
          </div>
        </div>
        <div v-if="chatStore.isWaiting" class="thinking-indicator">
          <span class="agent-avatar">
            <img :src="currentAgentIcon" width="14" height="14" alt="" />
          </span>
          <div class="thinking-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="thinking-text">{{ t('chat.thinking') }} {{ waitingSeconds }}s</span>
        </div>
        <div ref="messagesEnd"></div>
      </div>

      <div class="chat-input-area">
        <div class="debug-trigger" @click="handleDebugClick"></div>
        <PromptComposer
          ref="composerRef"
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
  position: relative;
  padding-bottom: 24px;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-role {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--content-text-secondary);
  margin-bottom: 4px;
}

.agent-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #f5e6df;
  flex-shrink: 0;
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
  position: relative;
  padding: var(--spacing-md) var(--spacing-lg);
  flex-shrink: 0;
}

.message-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.message:hover .message-actions {
  opacity: 1;
  pointer-events: auto;
}

.message.user .message-actions {
  left: auto;
  right: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover {
  background: var(--sidebar-hover);
  color: var(--content-text);
}

.action-tokens {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  user-select: none;
  white-space: nowrap;
}

.action-time {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
  user-select: none;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  align-self: flex-start;
  padding: var(--spacing-sm) 0;
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--content-text-secondary);
  animation: dot-bounce 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.16s; }
.dot:nth-child(3) { animation-delay: 0.32s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.thinking-text {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.msg-attachment-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.msg-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.15);
  font-size: var(--font-size-xs);
  max-width: 200px;
  white-space: nowrap;
}

.msg-attachment-url {
  max-width: 280px;
  position: relative;
  cursor: pointer;
  overflow: visible;
}

.msg-url-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-attachment-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  max-width: min(480px, 80vw);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, transform 0.15s, visibility 0.15s;
  transform: translateY(4px);
  z-index: 100;
  pointer-events: auto;
}

.msg-attachment-url:hover .msg-attachment-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.tooltip-url {
  font-size: var(--font-size-xs);
  color: var(--content-text);
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
}

.tooltip-copy {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tooltip-copy:hover {
  background: var(--btn-ghost-hover);
  color: var(--content-text);
}

.debug-trigger {
  position: absolute;
  top: -20px;
  right: 40px;
  width: 30px;
  height: 20px;
  cursor: default;
  z-index: 10;
}

.debug-panel {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.debug-section {
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.debug-label {
  display: block;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: var(--sidebar-border);
  color: var(--content-text-secondary);
}

.debug-json {
  margin: 0;
  padding: 8px 12px;
  background: var(--btn-ghost-hover);
  font-size: 11px;
  line-height: 1.4;
  color: var(--content-text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.no-conversation {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--content-text-secondary);
}
</style>
