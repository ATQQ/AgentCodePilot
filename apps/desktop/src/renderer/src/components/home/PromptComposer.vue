<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Top } from '@element-plus/icons-vue'

const { t } = useI18n()
const input = ref('')

const emit = defineEmits<{
  submit: [text: string]
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
</script>

<template>
  <div class="composer" :class="{ focused: false }">
    <textarea
      v-model="input"
      class="composer-input"
      :placeholder="t('home.placeholder')"
      rows="1"
      @keydown="handleKeydown"
    />
    <div class="composer-toolbar">
      <div class="toolbar-left">
        <button class="toolbar-btn">
          <el-icon :size="16"><Plus /></el-icon>
        </button>
        <button class="toolbar-btn toolbar-btn--accent">
          <span class="accent-dot"></span>
          <span>{{ t('composer.autoReview') }}</span>
          <span class="chevron">&#8250;</span>
        </button>
      </div>
      <div class="toolbar-right">
        <slot name="selectors" />
        <button
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
  overflow: hidden;
}

.composer:focus-within {
  border-color: var(--composer-border-focus);
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
  gap: var(--spacing-xs);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 4px 8px;
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

.toolbar-btn--accent {
  color: var(--accent-text);
}

.accent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-color);
}

.chevron {
  font-size: 12px;
  opacity: 0.6;
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
</style>
