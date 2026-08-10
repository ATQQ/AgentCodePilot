<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  thinkingCount: number
  toolCount: number
  /** When true, start collapsed (and auto-collapse once). */
  completed?: boolean
}>()

const { t } = useI18n()
const expanded = ref(!props.completed)
const userToggled = ref(false)

watch(
  () => props.completed,
  (completed) => {
    if (completed && !userToggled.value) {
      expanded.value = false
    } else if (!completed) {
      expanded.value = true
      userToggled.value = false
    }
  },
  { immediate: true }
)

const summary = computed(() => {
  const parts: string[] = []
  if (props.thinkingCount > 0) {
    parts.push(t('chat.processThinkingCount', { count: props.thinkingCount }))
  }
  if (props.toolCount > 0) {
    parts.push(t('chat.processToolCount', { count: props.toolCount }))
  }
  return parts.join(' · ')
})

function toggle(): void {
  userToggled.value = true
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="process-fold" :class="{ expanded, completed: !!completed }">
    <button class="process-toggle" type="button" @click="toggle">
      <el-icon :size="10" class="toggle-icon" :class="{ rotated: expanded }">
        <ArrowRight />
      </el-icon>
      <span class="process-title">{{ t('chat.processSteps') }}</span>
      <span v-if="summary" class="process-summary">{{ summary }}</span>
    </button>
    <div v-show="expanded" class="process-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.process-fold {
  margin: 4px 0 12px;
  min-width: 0;
}

.process-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
}

.process-toggle:hover {
  color: var(--el-text-color-regular);
}

.toggle-icon {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.toggle-icon.rotated {
  transform: rotate(90deg);
}

.process-title {
  flex-shrink: 0;
  font-weight: 500;
}

.process-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}

.process-body {
  margin-top: 4px;
  padding-left: 4px;
  border-left: 2px solid var(--el-border-color-lighter);
}
</style>
