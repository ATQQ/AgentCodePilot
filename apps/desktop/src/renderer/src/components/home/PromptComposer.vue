<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Top } from '@element-plus/icons-vue'

const { t } = useI18n()
const input = ref('')
const showAddMenu = ref(false)
const showApprovalMenu = ref(false)
const planMode = ref(false)
const pursueGoals = ref(false)
const approvalLevel = ref<'request' | 'auto' | 'full'>('request')

const props = defineProps<{
  streaming?: boolean
  queuedMessages?: { content: string }[]
}>()

const emit = defineEmits<{
  submit: [text: string]
  stop: []
  cancelQueue: [index: number]
}>()

function handleSubmit(): void {
  const text = input.value.trim()
  if (!text) return
  emit('submit', text)
  input.value = ''
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function handleStop(): void {
  emit('stop')
}

function handleCancelQueue(index: number): void {
  emit('cancelQueue', index)
}

function selectApproval(level: 'request' | 'auto' | 'full'): void {
  approvalLevel.value = level
  showApprovalMenu.value = false
}

const approvalOptions = {
  request: { label: 'composer.approval.requestApproval', icon: '✋' },
  auto: { label: 'composer.approval.autoApprove', icon: '\u{1F64A}' },
  full: { label: 'composer.approval.fullAccess', icon: '⚠' }
}

defineExpose({ setInput: (text: string) => { input.value = text } })
</script>

<template>
  <div class="composer">
    <!-- Queued messages -->
    <div v-if="props.queuedMessages?.length" class="queued-area">
      <div v-for="(msg, idx) in props.queuedMessages" :key="idx" class="queued-banner">
        <span class="queued-badge">{{ idx + 1 }}</span>
        <span class="queued-text">{{ msg.content }}</span>
        <button class="queued-cancel" @click="handleCancelQueue(idx)">&times;</button>
      </div>
    </div>

    <textarea
      v-model="input"
      class="composer-input"
      :placeholder="t('home.placeholder')"
      rows="1"
      @keydown="handleKeydown"
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
              <button class="menu-item">
                <span class="menu-icon">&#x1F4CE;</span>
                <span>{{ t('composer.addMenu.addPhotosAndFiles') }}</span>
              </button>
              <button class="menu-item">
                <span class="menu-icon">&#x1F310;</span>
                <span>{{ t('composer.addMenu.attachContext') }}</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item menu-item--toggle" @click.stop="planMode = !planMode">
                <span class="menu-icon">&#x2699;</span>
                <span>{{ t('composer.addMenu.planMode') }}</span>
                <span class="toggle-indicator" :class="{ active: planMode }"></span>
              </button>
              <button class="menu-item menu-item--toggle" @click.stop="pursueGoals = !pursueGoals">
                <span class="menu-icon">&#x1F3AF;</span>
                <span>{{ t('composer.addMenu.pursueGoals') }}</span>
                <span class="toggle-indicator" :class="{ active: pursueGoals }"></span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item">
                <span class="menu-icon">&#x1F9E9;</span>
                <span>{{ t('composer.addMenu.plugins') }}</span>
                <span class="menu-arrow">&#8250;</span>
              </button>
            </div>
          </Transition>
        </div>

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
          :disabled="!input.trim()"
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
