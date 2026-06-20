<script setup lang="ts">
import { watch, nextTick, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarkdownRender from 'markstream-vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import PromptComposer from '@renderer/components/home/PromptComposer.vue'
import AgentSelector from '@renderer/components/home/AgentSelector.vue'
import ModelSelector from '@renderer/components/home/ModelSelector.vue'
import ToolCallsSection from '@renderer/components/chat/ToolCallsSection.vue'
import ApprovalRequestCard from '@renderer/components/chat/ApprovalRequestCard.vue'
import MessageAttachmentImage from '@renderer/components/chat/MessageAttachmentImage.vue'
import { getAgentIcon } from '@renderer/utils/agentIcons'
import type { Attachment, Message, PlanReference } from '@renderer/types'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { usePlanStore } from '@renderer/stores/plan.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import EnvironmentInfoContent from '@renderer/components/environment/EnvironmentInfoContent.vue'
import { CODE_BLOCK_PROPS } from '@renderer/constants/codeBlockTheme'
const { t } = useI18n()
const router = useRouter()
const chatStore = useChatStore()
const agentStore = useAgentStore()
const settingsStore = useSettingsStore()
const layoutStore = useLayoutStore()
const planStore = usePlanStore()
const composerStore = useComposerStore()
const messagesContainer = ref<HTMLElement | null>(null)
const chatViewRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof PromptComposer> | null>(null)
const streamedMessageIds = ref<Set<string>>(new Set())
const copiedMessageId = ref<string | null>(null)
const waitingSeconds = ref(0)
const debugMode = ref(false)
let debugClickCount = 0
let debugClickTimer: ReturnType<typeof setTimeout> | null = null
let waitingTimer: ReturnType<typeof setInterval> | null = null
let scrollRetryTimer: ReturnType<typeof setTimeout> | null = null

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

function scrollToBottom(smooth = true): void {
  nextTick(() => {
    const el = messagesContainer.value
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant'
    })
  })
}

function scheduleScrollToBottom(instant = true): void {
  if (scrollRetryTimer) {
    clearTimeout(scrollRetryTimer)
    scrollRetryTimer = null
  }
  const scroll = () => scrollToBottom(!instant)
  scroll()
  nextTick(scroll)
  requestAnimationFrame(scroll)
  scrollRetryTimer = setTimeout(scroll, 100)
  setTimeout(scroll, 300)
}

let chatLayoutObserver: ResizeObserver | null = null

onMounted(() => {
  if (chatStore.activeConversation?.messages.length) {
    scheduleScrollToBottom(true)
  }
  void loadAssistantPlanMap()

  const el = chatViewRef.value
  if (!el) return
  const updateWidth = () => layoutStore.setChatLayoutWidth(el.clientWidth)
  updateWidth()
  chatLayoutObserver = new ResizeObserver(() => updateWidth())
  chatLayoutObserver.observe(el)
})

onUnmounted(() => {
  chatLayoutObserver?.disconnect()
  chatLayoutObserver = null
  layoutStore.setChatLayoutWidth(0)
  if (waitingTimer) clearInterval(waitingTimer)
  if (scrollRetryTimer) clearTimeout(scrollRetryTimer)
})

watch(
  () => chatStore.activeConversationId,
  () => {
    scheduleScrollToBottom(true)
    void loadAssistantPlanMap()
  }
)

watch(
  () => chatStore.isStreaming,
  (streaming, wasStreaming) => {
    if (wasStreaming && !streaming) {
      void loadAssistantPlanMap()
    }
  }
)

watch(
  () => chatStore.isStoppable,
  (stoppable, wasStoppable) => {
    if (stoppable && !wasStoppable) {
      scrollToBottom()
    }
  }
)

function isThinkingMessage(msg: Message): boolean {
  if (msg.role !== 'assistant' || msg.stopped) return false
  if (msg.content.trim() || msg.toolCalls?.length) return false
  const convId = chatStore.activeConversationId
  if (!convId || msg.id !== chatStore.getActiveAssistantMessageId(convId)) return false
  return chatStore.isConversationThinking(convId)
}

const showStandaloneThinking = computed(() => {
  if (!chatStore.activeConversationId) return false
  if (!chatStore.isWaiting) return false
  const activeId = chatStore.getActiveAssistantMessageId(chatStore.activeConversationId)
  if (!activeId) return true
  return !chatStore.activeConversation?.messages.some((m) => m.id === activeId)
})

const isAssistantThinking = computed(() => {
  const convId = chatStore.activeConversationId
  return convId ? chatStore.isConversationThinking(convId) : false
})

function refreshWaitingSeconds(): void {
  const convId = chatStore.activeConversationId
  waitingSeconds.value = convId ? chatStore.getThinkingElapsedSeconds(convId) : 0
}

watch(
  () => isAssistantThinking.value,
  (thinking) => {
    if (thinking) {
      refreshWaitingSeconds()
      waitingTimer = setInterval(refreshWaitingSeconds, 1000)
      scrollToBottom()
    } else if (waitingTimer) {
      clearInterval(waitingTimer)
      waitingTimer = null
    }
  },
  { immediate: true }
)

watch(
  () => chatStore.activeConversationId,
  () => {
    if (isAssistantThinking.value) {
      refreshWaitingSeconds()
    }
  }
)

watch(
  () => chatStore.activeConversation?.messages.length,
  () => scheduleScrollToBottom(true)
)

watch(
  () => {
    const msgs = chatStore.activeConversation?.messages
    if (!msgs || msgs.length === 0) return ''
    return msgs[msgs.length - 1].content
  },
  () => scrollToBottom()
)

watch(
  () => chatStore.pendingApprovalConversationIds.size,
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

const assistantPlanMap = ref<Map<string, string>>(new Map())

async function loadAssistantPlanMap(): Promise<void> {
  const conv = chatStore.activeConversation
  if (!conv) {
    assistantPlanMap.value = new Map()
    return
  }
  const plans = await window.agentAPI.plans.list({ conversationId: conv.id })
  const map = new Map<string, string>()
  for (const plan of plans) {
    map.set(plan.assistantMessageId, plan.id)
  }
  assistantPlanMap.value = map
  await planStore.loadPlans(conv.id, null, null)
  if (planStore.activePlanId) {
    await planStore.loadPlanContent(planStore.activePlanId)
  }
}

function getPlanIdForMessage(messageId: string): string | undefined {
  return assistantPlanMap.value.get(messageId)
}

function openPlansPanel(planId?: string): void {
  layoutStore.openPlansPanel(planId)
}

const conversationPlanCount = computed(() => planStore.plans.length)

function handleSubmit(
  text: string,
  attachments: Attachment[],
  planMode: boolean,
  planRefs: PlanReference[]
): void {
  if ((!text && attachments.length === 0 && planRefs.length === 0) || !chatStore.activeConversationId) return
  chatStore.sendMessage(chatStore.activeConversationId, text, agentStore.selectedAgentId, attachments, planMode, planRefs)
}

watch(
  () => composerStore.pendingExecutePlan,
  (req) => {
    if (!req) return
    const execute = composerStore.consumeExecutePlan()
    if (!execute || !chatStore.activeConversationId) return
    composerStore.setPlanMode(chatStore.activeConversationId, false)
    chatStore.sendMessage(
      chatStore.activeConversationId,
      execute.message,
      agentStore.selectedAgentId,
      undefined,
      false,
      [execute.plan]
    )
  }
)

async function openAttachment(att: Attachment): Promise<void> {
  if (att.type !== 'file') return
  await window.agentAPI.file.openAttachment(att.path, att.type)
}

function handleStop(): void {
  if (chatStore.activeConversationId) {
    chatStore.stopConversation(chatStore.activeConversationId)
  }
}

function handleCancelQueue(index: number): void {
  chatStore.cancelQueuedMessage(index)
}

function getMessageAgentId(msg: Message): string {
  if (msg.agentId) return msg.agentId
  return chatStore.activeConversation?.agentId ?? agentStore.selectedAgentId
}

function getMessageAgentIcon(msg: Message): string {
  return getAgentIcon(getMessageAgentId(msg))
}

function getMessageAgentName(msg: Message): string {
  return agentStore.getAgentName(getMessageAgentId(msg))
}

const waitingAgentIcon = computed(() => {
  const convId = chatStore.activeConversationId
  const agentId = (convId ? chatStore.getPendingAgent(convId) : undefined) ?? agentStore.selectedAgentId
  return getAgentIcon(agentId)
})

const isArchived = computed(() => chatStore.activeConversation?.archived === true)

function handleUnarchive(): void {
  if (!chatStore.activeConversationId) return
  chatStore.unarchiveConversation(chatStore.activeConversationId)
}

const isDark = computed(() => {
  if (settingsStore.theme === 'dark') return true
  if (settingsStore.theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
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

function getPendingApproval(msgId: string) {
  return chatStore.getPendingApprovalForMessage(msgId)
}

function handleApprovalRespond(requestId: string, allowed: boolean, scope: 'once' | 'conversation'): void {
  chatStore.respondToApproval(requestId, allowed, scope)
}
</script>

<template>
  <div ref="chatViewRef" class="chat-view">
    <template v-if="chatStore.activeConversation">
      <div class="chat-layout" :class="{ 'chat-layout--pinned-env': layoutStore.envInfoPinned }">
        <div class="chat-main">
      <div class="chat-header">
        <h3 class="chat-title">{{ chatStore.activeConversation.title }}</h3>
        <button
          v-if="conversationPlanCount > 0"
          type="button"
          class="plans-header-btn"
          @click="openPlansPanel()"
        >
          {{ t('plans.headerButton', { count: conversationPlanCount }) }}
        </button>
        <span
          v-if="chatStore.hasPendingApproval(chatStore.activeConversation.id)"
          class="approval-waiting-tag"
        >
          {{ t('approval.waitingTag') }}
        </span>
      </div>

      <div ref="messagesContainer" class="messages-container elegant-scroll">
        <div
          v-for="msg in chatStore.activeConversation.messages"
          :key="msg.id"
          class="message"
          :class="[msg.role, { 'message--plan': msg.role === 'user' && msg.planMode }]"
        >
          <div v-if="msg.role === 'assistant'" class="message-role">
            <span class="agent-avatar">
              <img :src="getMessageAgentIcon(msg)" width="14" height="14" alt="" />
            </span>
            <span class="message-role-name">{{ getMessageAgentName(msg) }}</span>
            <span v-if="getPendingApproval(msg.id)" class="approval-inline-tag">
              {{ t('approval.waitingTag') }}
            </span>
            <span v-if="getPendingApproval(msg.id)" class="approval-inline-summary">
              APPROVAL {{ getPendingApproval(msg.id)?.toolName }} {{ getPendingApproval(msg.id)?.detail }}
            </span>
          </div>
          <div class="message-content" :class="{ 'message-content--plan': msg.role === 'user' && msg.planMode }">
            <template v-if="msg.role === 'assistant'">
              <ApprovalRequestCard
                v-if="getPendingApproval(msg.id)"
                :request="getPendingApproval(msg.id)!"
                @respond="(allowed, scope) => handleApprovalRespond(getPendingApproval(msg.id)!.requestId, allowed, scope)"
              />
              <ToolCallsSection
                v-if="msg.toolCalls?.length"
                :tool-calls="msg.toolCalls"
                :has-text-content="!!msg.content.trim()"
              />
              <div v-if="isThinkingMessage(msg)" class="thinking-indicator thinking-indicator--inline">
                <div class="thinking-dots">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
                <span class="thinking-text">{{ t('chat.thinking') }} {{ waitingSeconds }}s</span>
              </div>
              <MarkdownRender
                v-else-if="msg.content.trim()"
                mode="chat"
                custom-id="chat"
                :content="msg.content"
                :final="!isStreamingMessage(msg.id)"
                :smooth-streaming="isStreamingMessage(msg.id) ? 'auto' : false"
                :fade="!isStreamingMessage(msg.id) && !wasStreamed(msg.id)"
                :typewriter="isStreamingMessage(msg.id)"
                :max-live-nodes="isStreamingMessage(msg.id) ? 0 : undefined"
                :render-code-blocks-as-pre="false"
                :is-dark="isDark"
                :batch-rendering="true"
                :render-batch-size="16"
                :render-batch-delay="8"
                :render-batch-budget-ms="4"
                :code-block-props="CODE_BLOCK_PROPS"
              />
              <button
                v-if="getPlanIdForMessage(msg.id)"
                type="button"
                class="view-plan-link"
                @click="openPlansPanel(getPlanIdForMessage(msg.id))"
              >
                {{ t('plans.viewPlan') }}
              </button>
              <span v-if="msg.stopped" class="stopped-badge">{{ t('chat.stoppedBadge') }}</span>
            </template>
            <template v-else>
              <span v-if="msg.planMode" class="plan-mode-tag">{{ t('chat.planModeTag') }}</span>
              <span
                v-for="ref in msg.planRefs"
                :key="ref.id"
                class="plan-ref-tag"
              >
                {{ t('chat.planRefTag', { title: ref.title }) }}
              </span>
              <div v-if="msg.attachments?.length" class="message-attachments">
                <div v-for="(att, idx) in msg.attachments" :key="att.id" class="msg-attachment">
                  <template v-if="att.type === 'image'">
                    <MessageAttachmentImage
                      :path="att.path"
                      :name="att.name"
                      :title="t('chat.previewAttachment')"
                    />
                  </template>
                  <template v-else-if="att.type === 'file'">
                    <button
                      type="button"
                      class="msg-attachment-chip msg-attachment-action"
                      :title="t('chat.showInFolder')"
                      @click="openAttachment(att)"
                    >
                      &#x1F4C4; {{ att.name }}
                    </button>
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
              <pre class="debug-json elegant-scroll">{{ msg.debugInput ? JSON.stringify(JSON.parse(msg.debugInput), null, 2) : '(无数据)' }}</pre>
            </div>
            <div class="debug-section">
              <span class="debug-label">RESPONSE</span>
              <pre class="debug-json elegant-scroll">{{ msg.debugOutput ? JSON.stringify(JSON.parse(msg.debugOutput), null, 2) : '(无数据)' }}</pre>
            </div>
          </div>
        </div>
        <div v-if="showStandaloneThinking" class="thinking-indicator">
          <span class="agent-avatar">
            <img :src="waitingAgentIcon" width="14" height="14" alt="" />
          </span>
          <div class="thinking-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="thinking-text">{{ t('chat.thinking') }} {{ waitingSeconds }}s</span>
        </div>
      </div>

      <div class="chat-input-area">
        <div v-if="isArchived" class="archived-banner">
          <span class="archived-banner-text">{{ t('archived.readOnlyHint') }}</span>
          <button class="archived-unarchive-btn" @click="handleUnarchive">
            {{ t('archived.unarchive') }}
          </button>
        </div>
        <template v-else>
          <div class="debug-trigger" @click="handleDebugClick"></div>
          <PromptComposer
            ref="composerRef"
            :conversation-id="chatStore.activeConversationId"
            :streaming="chatStore.isStreaming"
            :stoppable="chatStore.isStoppable"
            :queued-messages="chatStore.currentQueuedMessages"
            :approval-level="chatStore.activeConversation.approvalLevel"
            @submit="handleSubmit"
            @stop="handleStop"
            @cancel-queue="handleCancelQueue"
            @approval-change="(level) => chatStore.setConversationApprovalLevel(chatStore.activeConversation!.id, level)"
          >
            <template #selectors="{ agentCompact }">
              <AgentSelector :compact="agentCompact" />
              <ModelSelector />
            </template>
          </PromptComposer>
        </template>
      </div>
        </div>

        <aside v-if="layoutStore.envInfoPinned" class="chat-env-rail elegant-scroll">
          <EnvironmentInfoContent />
        </aside>
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
  min-height: 0;
  overflow: hidden;
}

.chat-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  justify-content: center;
  gap: var(--chat-layout-gutter);
  padding: 0 var(--spacing-lg);
  overflow: hidden;
}

.chat-main {
  flex: 1 1 auto;
  min-width: 0;
  max-width: var(--chat-content-max-width);
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.chat-layout--pinned-env .chat-main {
  flex: 0 1 var(--chat-content-max-width);
}

.chat-env-rail {
  flex: 0 0 var(--env-rail-width);
  width: var(--env-rail-width);
  align-self: flex-start;
  position: sticky;
  top: var(--spacing-md);
  max-height: calc(100% - var(--spacing-md) * 2);
  overflow-y: auto;
  padding: var(--spacing-md);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  margin-top: var(--spacing-md);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
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

.plans-header-btn {
  padding: 3px 10px;
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.plans-header-btn:hover {
  background: color-mix(in srgb, var(--accent-color) 20%, transparent);
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  -webkit-user-select: text;
  user-select: text;
  --scroll-thumb: var(--content-text-tertiary);
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
  width: 100%;
  max-width: 85%;
}

.message-role {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--content-text-secondary);
  margin-bottom: 4px;
}

.message-role-name {
  flex-shrink: 0;
}

.approval-waiting-tag,
.approval-inline-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 600;
}

html.dark .approval-waiting-tag,
html.dark .approval-inline-tag {
  background: rgba(52, 211, 153, 0.15);
  color: #6ee7b7;
}

.approval-inline-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--content-text-tertiary);
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

.message.user .message-content--plan {
  background: transparent;
  color: var(--content-text);
  border: 1.5px solid var(--accent-color);
}

.plan-mode-tag {
  display: inline-block;
  margin-bottom: 6px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--accent-color) 15%, transparent);
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 600;
}

.plan-ref-tag {
  display: inline-block;
  margin-right: 6px;
  margin-bottom: 6px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 500;
}

.view-plan-link {
  display: inline-flex;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-color);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.view-plan-link:hover {
  opacity: 0.85;
}

.stopped-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--content-text-secondary) 12%, transparent);
  color: var(--content-text-secondary);
  font-size: 11px;
}

.message.assistant .message-content {
  color: var(--content-text);
  width: 100%;
  min-width: 0;
}

.message.assistant .message-content :deep(.markstream-vue) {
  width: 100%;
  max-width: 100%;
}

.message.assistant .message-content :deep(.code-block-container) {
  width: 100%;
  max-width: 100%;
}

.chat-input-area {
  position: relative;
  padding: var(--spacing-md) var(--spacing-lg);
  flex-shrink: 0;
}

.archived-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--btn-secondary-bg);
}

.archived-banner-text {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
}

.archived-unarchive-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.archived-unarchive-btn:hover {
  background: var(--sidebar-item-hover);
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

.thinking-indicator--inline {
  padding: var(--spacing-xs) 0;
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

.msg-attachment-action {
  cursor: pointer;
  border: none;
  color: inherit;
  font: inherit;
}

.msg-attachment-action:hover {
  background: rgba(255, 255, 255, 0.25);
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
