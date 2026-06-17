<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Top } from '@element-plus/icons-vue'
import type { Attachment, ApprovalLevel, FileAttachment, UrlAttachment } from '@renderer/types'
import { toLocalFileUrl } from '@renderer/utils/localFile'
import { useImagePreview } from '@renderer/composables/useImagePreview'
import { useComposerStore } from '@renderer/stores/composer.store'

const { t } = useI18n()
const { openImagePreview } = useImagePreview()
const composerStore = useComposerStore()
const input = ref('')

watch(
  () => composerStore.pendingInsert,
  (req) => {
    if (!req) return
    const consumed = composerStore.consumeInsert()
    if (!consumed) return
    if (consumed.text) {
      input.value += consumed.text
    } else if (consumed.attachment) {
      attachments.value.push(consumed.attachment)
    }
  }
)
const showAddMenu = ref(false)
const showApprovalMenu = ref(false)
const planMode = ref(false)
// const pursueGoals = ref(false) // TODO: 目标模式，后续实现
const attachments = ref<Attachment[]>([])
const showUrlInput = ref(false)
const urlInputValue = ref('')

const props = defineProps<{
  streaming?: boolean
  queuedMessages?: { content: string }[]
  approvalLevel?: ApprovalLevel
}>()

const approvalLevel = computed(() => props.approvalLevel ?? 'auto')

const emit = defineEmits<{
  submit: [text: string, attachments: Attachment[], planMode: boolean]
  stop: []
  cancelQueue: [index: number]
  approvalChange: [level: ApprovalLevel]
}>()

function generateId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function isImageFile(filename: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(filename)
}

function getFileName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path
}

function handleSubmit(): void {
  const text = input.value.trim()
  if (!text && attachments.value.length === 0) return
  emit('submit', text, [...attachments.value], planMode.value)
  input.value = ''
  attachments.value = []
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

async function handlePaste(e: ClipboardEvent): Promise<void> {
  const items = e.clipboardData?.items
  if (!items) return

  const text = e.clipboardData?.getData('text/plain') || ''

  // Check if pasted text is a URL
  if (text && isUrl(text)) {
    e.preventDefault()
    attachments.value.push({
      id: generateId(),
      type: 'url',
      url: text.trim()
    })
    return
  }

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue

      const previewUrl = URL.createObjectURL(file)
      const buffer = await file.arrayBuffer()
      const filename = file.name || `paste-${Date.now()}.png`
      const savedPath = await window.agentAPI.file.saveTempImage(buffer, filename)

      attachments.value.push({
        id: generateId(),
        type: 'image',
        name: filename,
        path: savedPath,
        previewUrl
      })
    }
  }
}

async function handleSelectFiles(): Promise<void> {
  showAddMenu.value = false
  const paths = await window.agentAPI.dialog.selectFiles()
  if (!paths) return

  for (const path of paths) {
    const name = getFileName(path)
    const isImage = isImageFile(name)
    const att: FileAttachment = {
      id: generateId(),
      type: isImage ? 'image' : 'file',
      name,
      path,
      previewUrl: isImage ? toLocalFileUrl(path) : undefined
    }
    attachments.value.push(att)
  }
}

function handleAddUrl(): void {
  showAddMenu.value = false
  showUrlInput.value = true
}

function confirmUrl(): void {
  const url = urlInputValue.value.trim()
  if (!url) return
  const att: UrlAttachment = {
    id: generateId(),
    type: 'url',
    url,
    title: undefined
  }
  attachments.value.push(att)
  urlInputValue.value = ''
  showUrlInput.value = false
}

function handleUrlKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmUrl()
  } else if (e.key === 'Escape') {
    showUrlInput.value = false
    urlInputValue.value = ''
  }
}

function removeAttachment(id: string): void {
  const idx = attachments.value.findIndex((a) => a.id === id)
  if (idx !== -1) {
    const att = attachments.value[idx]
    if (att.type === 'image' && 'previewUrl' in att && att.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(att.previewUrl)
    }
    attachments.value.splice(idx, 1)
  }
}

function handleStop(): void {
  emit('stop')
}

function handleCancelQueue(index: number): void {
  emit('cancelQueue', index)
}

function selectApproval(level: ApprovalLevel): void {
  emit('approvalChange', level)
  showApprovalMenu.value = false
}

const approvalOptions = {
  request: { label: 'composer.approval.requestApproval', icon: '✋' },
  auto: { label: 'composer.approval.autoApprove', icon: '\u{1F64A}' },
  full: { label: 'composer.approval.fullAccess', icon: '⚠' }
}

function truncateUrl(url: string, max = 40): string {
  if (url.length <= max) return url
  return url.slice(0, max - 3) + '...'
}

function getUrlIndex(id: string): number {
  const urls = attachments.value.filter((a) => a.type === 'url')
  return urls.findIndex((a) => a.id === id) + 1
}

function previewComposerImage(att: FileAttachment): void {
  openImagePreview({
    name: att.name,
    path: att.path,
    previewUrl: att.previewUrl
  })
}

defineExpose({ setInput: (text: string) => { input.value = text } })
</script>

<template>
  <div class="composer" :class="{ 'composer--plan': planMode }">
    <!-- Queued messages -->
    <div v-if="props.queuedMessages?.length" class="queued-area">
      <div v-for="(msg, idx) in props.queuedMessages" :key="idx" class="queued-banner">
        <span class="queued-badge">{{ idx + 1 }}</span>
        <span class="queued-text">{{ msg.content }}</span>
        <button class="queued-cancel" @click="handleCancelQueue(idx)">&times;</button>
      </div>
    </div>

    <!-- Attachments preview -->
    <div v-if="attachments.length > 0" class="attachments-area">
      <div v-for="att in attachments" :key="att.id" class="attachment-item">
        <template v-if="att.type === 'image'">
          <div class="attachment-image" @click="previewComposerImage(att)">
            <img :src="att.previewUrl" :alt="att.name" />
            <button class="attachment-remove" @click.stop="removeAttachment(att.id)">&times;</button>
          </div>
        </template>
        <template v-else-if="att.type === 'file'">
          <div class="attachment-file">
            <span class="attachment-file-icon">&#x1F4C4;</span>
            <span class="attachment-file-name">{{ att.name }}</span>
            <button class="attachment-remove" @click="removeAttachment(att.id)">&times;</button>
          </div>
        </template>
        <template v-else-if="att.type === 'url'">
          <div class="attachment-url">
            <span class="attachment-url-badge">#{{ getUrlIndex(att.id) }}</span>
            <span class="attachment-url-text">{{ truncateUrl(att.url) }}</span>
            <button class="attachment-remove" @click="removeAttachment(att.id)">&times;</button>
          </div>
        </template>
      </div>
    </div>

    <!-- URL input -->
    <div v-if="showUrlInput" class="url-input-area">
      <span class="url-input-icon">&#x1F517;</span>
      <input
        v-model="urlInputValue"
        class="url-input"
        type="url"
        :placeholder="t('composer.urlPlaceholder')"
        autofocus
        @keydown="handleUrlKeydown"
      />
      <button class="url-input-confirm" @click="confirmUrl">
        {{ t('common.confirm') }}
      </button>
      <button class="url-input-cancel" @click="showUrlInput = false; urlInputValue = ''">
        {{ t('common.cancel') }}
      </button>
    </div>

    <textarea
      v-model="input"
      class="composer-input"
      :placeholder="t('home.placeholder')"
      rows="1"
      @keydown="handleKeydown"
      @paste="handlePaste"
    />
    <div class="composer-toolbar">
      <div class="toolbar-left">
        <!-- + Button with popup -->
        <div class="dropdown-wrapper">
          <button class="toolbar-btn" @click="showAddMenu = !showAddMenu">
            <el-icon :size="16"><Plus /></el-icon>
          </button>
          <Transition name="fade">
            <div v-if="showAddMenu" class="dropdown-menu" @mouseleave="showAddMenu = false">
              <button class="menu-item" @click="handleSelectFiles">
                <span class="menu-icon">&#x1F4CE;</span>
                <span>{{ t('composer.addMenu.addPhotosAndFiles') }}</span>
              </button>
              <button class="menu-item" @click="handleAddUrl">
                <span class="menu-icon">&#x1F517;</span>
                <span>{{ t('composer.addMenu.attachUrl') }}</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item menu-item--toggle" @click.stop="planMode = !planMode">
                <span class="menu-icon">&#x2699;</span>
                <span>{{ t('composer.addMenu.planMode') }}</span>
                <span class="toggle-indicator" :class="{ active: planMode }"></span>
              </button>
              <!-- TODO: 目标模式，后续实现
              <button class="menu-item menu-item--toggle" @click.stop="pursueGoals = !pursueGoals">
                <span class="menu-icon">&#x1F3AF;</span>
                <span>{{ t('composer.addMenu.pursueGoals') }}</span>
                <span class="toggle-indicator" :class="{ active: pursueGoals }"></span>
              </button>
              -->
              <div class="menu-divider"></div>
              <button class="menu-item">
                <span class="menu-icon">&#x1F9E9;</span>
                <span>{{ t('composer.addMenu.plugins') }}</span>
                <span class="menu-arrow">&#8250;</span>
              </button>
            </div>
          </Transition>
        </div>

        <button
          v-if="planMode"
          class="plan-mode-badge"
          @click="planMode = false"
        >
          {{ t('composer.planModeBadge') }}
        </button>

        <!-- Approval Level -->
        <div class="dropdown-wrapper">
          <button class="toolbar-btn toolbar-btn--label" @click="showApprovalMenu = !showApprovalMenu">
            <span class="approval-icon">{{ approvalOptions[approvalLevel].icon }}</span>
            <span>{{ t(approvalOptions[approvalLevel].label) }}</span>
            <span class="chevron">&#x25BE;</span>
          </button>
          <Transition name="fade">
            <div v-if="showApprovalMenu" class="dropdown-menu dropdown-menu--wide" @mouseleave="showApprovalMenu = false">
              <div class="menu-header">
                <span>{{ t('composer.approval.title') }}</span>
                <a class="menu-link">{{ t('composer.approval.learnMore') }}</a>
              </div>
              <button
                class="menu-item menu-item--desc"
                :class="{ selected: approvalLevel === 'request' }"
                @click="selectApproval('request')"
              >
                <div class="menu-item-icon">&#x270B;</div>
                <div class="menu-item-content">
                  <div class="menu-item-title">{{ t('composer.approval.requestApproval') }}</div>
                  <div class="menu-item-description">{{ t('composer.approval.requestApprovalDesc') }}</div>
                </div>
                <span v-if="approvalLevel === 'request'" class="check-mark">&#x2713;</span>
              </button>
              <button
                class="menu-item menu-item--desc"
                :class="{ selected: approvalLevel === 'auto' }"
                @click="selectApproval('auto')"
              >
                <div class="menu-item-icon">&#x1F64A;</div>
                <div class="menu-item-content">
                  <div class="menu-item-title">{{ t('composer.approval.autoApprove') }}</div>
                  <div class="menu-item-description">{{ t('composer.approval.autoApproveDesc') }}</div>
                </div>
                <span v-if="approvalLevel === 'auto'" class="check-mark">&#x2713;</span>
              </button>
              <button
                class="menu-item menu-item--desc"
                :class="{ selected: approvalLevel === 'full' }"
                @click="selectApproval('full')"
              >
                <div class="menu-item-icon">&#x26A0;</div>
                <div class="menu-item-content">
                  <div class="menu-item-title">{{ t('composer.approval.fullAccess') }}</div>
                  <div class="menu-item-description">{{ t('composer.approval.fullAccessDesc') }}</div>
                </div>
                <span v-if="approvalLevel === 'full'" class="check-mark">&#x2713;</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <div class="toolbar-right">
        <slot name="selectors" />
        <button
          v-if="props.streaming && !input.trim()"
          class="stop-btn"
          @click="handleStop"
          :title="t('chat.stop')"
        >
          <span class="stop-icon"></span>
        </button>
        <button
          v-else
          class="send-btn"
          :disabled="!input.trim() && attachments.length === 0"
          @click="handleSubmit"
        >
          <el-icon :size="14"><Top /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.composer {
  width: 100%;
  border: 1px solid var(--composer-border);
  border-radius: var(--radius-xl);
  background: var(--composer-bg);
  transition: border-color 0.2s;
  overflow: visible;
  position: relative;
}

.composer:focus-within {
  border-color: var(--composer-border-focus);
}

.composer--plan {
  border-color: var(--accent-color);
}

.composer--plan:focus-within {
  border-color: var(--accent-color);
}

.queued-area {
  border-bottom: 1px solid var(--composer-border);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  overflow: hidden;
}

.queued-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 5px var(--spacing-lg);
  background: var(--btn-ghost-hover);
  font-size: var(--font-size-sm);
}

.queued-banner + .queued-banner {
  border-top: 1px solid var(--composer-border);
}

.queued-badge {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--content-text-secondary);
  color: var(--content-bg);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queued-text {
  color: var(--content-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.queued-cancel {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.queued-cancel:hover {
  background: var(--sidebar-border);
  color: var(--content-text);
}

/* Attachments area */
.attachments-area {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-bottom: 1px solid var(--composer-border);
}

.attachment-item {
  position: relative;
}

.attachment-image {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--sidebar-border);
  cursor: zoom-in;
}

.attachment-image:hover {
  border-color: var(--content-text-secondary);
}

.attachment-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attachment-file {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  background: var(--btn-ghost-hover);
  font-size: var(--font-size-sm);
  color: var(--content-text);
  max-width: 180px;
}

.attachment-file-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.attachment-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-url {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  background: var(--btn-ghost-hover);
  font-size: var(--font-size-sm);
  color: var(--content-text);
  max-width: 240px;
}

.attachment-url-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--btn-primary-bg);
}

.attachment-url-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--content-text-secondary);
  color: var(--content-bg);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  z-index: 1;
}

.attachment-file .attachment-remove,
.attachment-url .attachment-remove {
  position: static;
  margin-left: 4px;
  flex-shrink: 0;
}

.attachment-remove:hover {
  background: var(--content-text);
}

/* URL input area */
.url-input-area {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-bottom: 1px solid var(--composer-border);
}

.url-input-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.url-input {
  flex: 1;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  padding: 4px 8px;
  font-size: var(--font-size-sm);
  background: transparent;
  color: var(--content-text);
  outline: none;
}

.url-input:focus {
  border-color: var(--composer-border-focus);
}

.url-input-confirm,
.url-input-cancel {
  padding: 4px 8px;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.url-input-confirm {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}

.url-input-confirm:hover {
  opacity: 0.85;
}

.url-input-cancel {
  background: transparent;
  color: var(--content-text-secondary);
}

.url-input-cancel:hover {
  background: var(--btn-ghost-hover);
}

.composer-input {
  width: 100%;
  padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-sm);
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-base);
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.5;
  min-height: 40px;
  max-height: 120px;
}

.composer-input::placeholder {
  color: var(--composer-placeholder);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  gap: var(--spacing-sm);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.toolbar-btn:hover {
  background: var(--btn-ghost-hover);
}

.toolbar-btn--label {
  gap: 5px;
}

.plan-mode-badge {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
  color: var(--accent-color);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.plan-mode-badge:hover {
  background: color-mix(in srgb, var(--accent-color) 20%, transparent);
  opacity: 0.9;
}

.approval-icon {
  font-size: 13px;
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
}

.send-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s;
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  opacity: 0.85;
}

.stop-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 2px solid var(--content-text);
  background: transparent;
  color: var(--content-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.stop-btn:hover {
  opacity: 0.7;
}

.stop-icon {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}

/* Dropdown */
.dropdown-wrapper {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs);
  z-index: 1000;
}

.dropdown-menu--wide {
  min-width: 320px;
}

.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
}

.menu-link {
  color: var(--content-text-secondary);
  text-decoration: underline;
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 8px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-base);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.menu-item:hover {
  background: var(--btn-ghost-hover);
}

.menu-item--toggle {
  justify-content: flex-start;
}

.menu-item--desc {
  align-items: flex-start;
  padding: var(--spacing-md);
}

.menu-item--desc.selected {
  background: var(--btn-ghost-hover);
}

.menu-item-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.menu-item-content {
  flex: 1;
  min-width: 0;
}

.menu-item-title {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--content-text);
}

.menu-item-description {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
  margin-top: 2px;
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.menu-arrow {
  margin-left: auto;
  font-size: 14px;
  color: var(--content-text-tertiary);
}

.menu-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: var(--spacing-xs) var(--spacing-sm);
}

.toggle-indicator {
  margin-left: auto;
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: var(--sidebar-border);
  position: relative;
  transition: background 0.2s;
}

.toggle-indicator::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s;
}

.toggle-indicator.active {
  background: var(--accent-color);
}

.toggle-indicator.active::after {
  transform: translateX(14px);
}

.check-mark {
  color: var(--content-text);
  font-size: 16px;
  flex-shrink: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
