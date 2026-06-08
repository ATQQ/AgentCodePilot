<script setup lang="ts">
import { ref } from 'vue'

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
  <div class="composer">
    <el-input
      v-model="input"
      type="textarea"
      :autosize="{ minRows: 2, maxRows: 6 }"
      placeholder="Describe what you want to build..."
      resize="none"
      @keydown="handleKeydown"
    />
    <div class="composer-footer">
      <slot name="selectors" />
      <el-button type="primary" :disabled="!input.trim()" @click="handleSubmit">
        Send
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.composer {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}
</style>
