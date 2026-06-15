<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCall } from '@renderer/types'
import { getToolLabel, getToolDetailLines } from '@renderer/utils/toolCall'

const props = defineProps<{
  toolCall: ToolCall
  depth?: number
}>()

const label = computed(() => getToolLabel(props.toolCall.toolName))
const detailLines = computed(() => getToolDetailLines(props.toolCall))

const statusIcon = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return '◷'
    case 'running':
      return '⟳'
    case 'completed':
      return '✓'
    case 'error':
      return '✗'
    default:
      return '◷'
  }
})
</script>

<template>
  <div
    class="tool-call-card"
    :class="[`status-${toolCall.status}`, { nested: (depth ?? 0) > 0 }]"
    :style="{ marginLeft: `${(depth ?? 0) * 16}px` }"
  >
    <div class="tool-header">
      <span class="tool-status-icon" :title="toolCall.status">{{ statusIcon }}</span>
      <span class="tool-name-badge">{{ toolCall.toolName }}</span>
      <span class="tool-label">{{ label }}</span>
      <span v-if="toolCall.elapsedSeconds" class="tool-elapsed">
        {{ toolCall.elapsedSeconds.toFixed(1) }}s
      </span>
    </div>
    <div v-if="detailLines.length" class="tool-details">
      <div v-for="(line, idx) in detailLines" :key="idx" class="tool-detail-row">
        <span class="tool-detail-label">{{ line.label }}</span>
        <span class="tool-detail-value" :class="{ mono: line.label === '命令' || line.label === '路径' || line.label === '内容' || line.label === '原内容' || line.label === '新内容' }">
          {{ line.label === '命令' ? `$ ${line.value}` : line.value }}
        </span>
      </div>
    </div>
    <div
      v-if="toolCall.summary && !detailLines.some((l) => l.value === toolCall.summary)"
      class="tool-summary"
    >
      {{ toolCall.summary }}
    </div>
  </div>
</template>

<style scoped>
.tool-call-card {
  margin: 4px 0;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--sidebar-border);
  background: var(--content-bg);
  font-size: var(--font-size-sm);
  transition: border-color 0.2s;
}

.tool-call-card.nested {
  border-style: dashed;
  background: var(--sidebar-bg);
}

.tool-call-card.status-pending {
  border-color: var(--sidebar-border);
}

.tool-call-card.status-running {
  border-color: var(--el-color-primary-light-5);
}

.tool-call-card.status-completed {
  border-color: var(--el-color-success-light-5);
}

.tool-call-card.status-error {
  border-color: var(--el-color-danger-light-5);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-status-icon {
  font-size: 12px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
  line-height: 1;
}

.status-pending .tool-status-icon {
  color: var(--content-text-tertiary);
}

.status-running .tool-status-icon {
  color: var(--el-color-primary);
  animation: spin 1s linear infinite;
}

.status-completed .tool-status-icon {
  color: var(--el-color-success);
}

.status-error .tool-status-icon {
  color: var(--el-color-danger);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tool-label {
  font-weight: 500;
  color: var(--content-text);
  flex-shrink: 0;
}

.tool-name-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--sidebar-item-active);
  color: var(--content-text-secondary);
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.tool-elapsed {
  margin-left: auto;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-xs);
}

.tool-details {
  margin-top: 6px;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-detail-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-detail-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--content-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.tool-detail-value {
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.5;
}

.tool-detail-value.mono {
  font-family: var(--font-mono, monospace);
  color: var(--content-text);
}

.tool-summary {
  margin-top: 4px;
  padding-left: 22px;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-xs);
  word-break: break-word;
}
</style>
