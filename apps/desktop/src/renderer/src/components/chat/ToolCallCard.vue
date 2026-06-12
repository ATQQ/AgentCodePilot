<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCall } from '@renderer/types'

const props = defineProps<{
  toolCall: ToolCall
}>()

const TOOL_LABELS: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebFetch: '获取网页',
  WebSearch: '搜索网络'
}

const label = computed(() => TOOL_LABELS[props.toolCall.toolName] || props.toolCall.toolName)

const detail = computed(() => {
  const input = props.toolCall.input
  switch (props.toolCall.toolName) {
    case 'Read':
      return (input.file_path as string) || ''
    case 'Write':
      return (input.file_path as string) || ''
    case 'Edit':
      return (input.file_path as string) || ''
    case 'Bash':
      return ((input.command as string) || '').slice(0, 80)
    case 'Glob':
      return (input.pattern as string) || ''
    case 'Grep':
      return (input.pattern as string) || (input.query as string) || ''
    case 'WebFetch':
      return (input.url as string) || ''
    case 'WebSearch':
      return (input.query as string) || ''
    default:
      return ''
  }
})

const statusIcon = computed(() => {
  switch (props.toolCall.status) {
    case 'running': return '⟳'
    case 'completed': return '✓'
    case 'error': return '✗'
    default: return ''
  }
})
</script>

<template>
  <div class="tool-call-card" :class="[`status-${toolCall.status}`]">
    <div class="tool-header">
      <span class="tool-status-icon">{{ statusIcon }}</span>
      <span class="tool-label">{{ label }}</span>
      <span v-if="toolCall.elapsedSeconds" class="tool-elapsed">
        {{ toolCall.elapsedSeconds.toFixed(1) }}s
      </span>
    </div>
    <div v-if="detail" class="tool-detail">{{ detail }}</div>
    <div v-if="toolCall.summary" class="tool-summary">{{ toolCall.summary }}</div>
  </div>
</template>

<style scoped>
.tool-call-card {
  margin: 6px 0;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  font-size: var(--font-size-sm);
  transition: border-color 0.2s;
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
}

.tool-elapsed {
  margin-left: auto;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-xs);
}

.tool-detail {
  margin-top: 4px;
  padding-left: 22px;
  color: var(--content-text-secondary);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-summary {
  margin-top: 4px;
  padding-left: 22px;
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
}
</style>
