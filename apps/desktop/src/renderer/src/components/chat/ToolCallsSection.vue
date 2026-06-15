<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import ToolCallCard from './ToolCallCard.vue'
import type { ToolCall } from '@renderer/types'
import { getToolCallHeader } from '@renderer/utils/toolCall'

const props = defineProps<{
  toolCalls: ToolCall[]
  hasTextContent: boolean
}>()

const expanded = ref(true)
const autoCollapsed = ref(false)

watch(
  () => props.hasTextContent,
  (has) => {
    if (has && !autoCollapsed.value) {
      expanded.value = false
      autoCollapsed.value = true
    }
  },
  { immediate: true }
)

const collapsedSummary = computed(() => {
  return props.toolCalls.map((tc) => getToolCallHeader(tc)).join(' · ')
})

function toggle(): void {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="tool-calls-section" :class="{ expanded }">
    <button class="tool-calls-toggle" type="button" @click="toggle">
      <el-icon :size="10" class="toggle-icon" :class="{ rotated: expanded }">
        <ArrowRight />
      </el-icon>
      <span class="toggle-label">{{ toolCalls.length }} 个工具调用</span>
      <span class="toggle-summary">{{ collapsedSummary }}</span>
    </button>
    <div v-show="expanded" class="tool-calls-list">
      <ToolCallCard
        v-for="tc in toolCalls"
        :key="tc.toolUseId"
        :tool-call="tc"
      />
    </div>
  </div>
</template>

<style scoped>
.tool-calls-section {
  margin-bottom: 8px;
}

.tool-calls-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--sidebar-bg);
  color: var(--content-text-secondary);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.tool-calls-section.expanded .tool-calls-toggle {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-color: transparent;
}

.tool-calls-toggle:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.toggle-icon {
  flex-shrink: 0;
  opacity: 0.6;
  transition: transform 0.15s;
}

.toggle-icon.rotated {
  transform: rotate(90deg);
}

.toggle-label {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--content-text);
}

.toggle-summary {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  color: var(--content-text-secondary);
}

.tool-calls-list {
  padding: 4px 0 0;
  border: 1px solid var(--sidebar-border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--sidebar-bg);
}

.tool-calls-section:not(.expanded) .tool-calls-list {
  border: none;
  padding: 0;
}
</style>
