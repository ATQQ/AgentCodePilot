<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    content: string
    completed?: boolean
    /** When false, stay expanded (e.g. inside ProcessFold). */
    autoCollapse?: boolean
  }>(),
  { autoCollapse: true }
)

const { t } = useI18n()
const expanded = ref(!(props.completed && props.autoCollapse))
const userToggled = ref(false)

watch(
  [() => props.completed, () => props.autoCollapse],
  ([completed, autoCollapse]) => {
    if (!autoCollapse) {
      expanded.value = true
      return
    }
    if (completed && !userToggled.value) {
      expanded.value = false
    } else if (!completed) {
      expanded.value = true
      userToggled.value = false
    }
  },
  { immediate: true }
)

const preview = computed(() => {
  const text = props.content.replace(/\s+/g, ' ').trim()
  if (text.length <= 72) return text
  return `${text.slice(0, 72)}…`
})

function toggle(): void {
  userToggled.value = true
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="thinking-block" :class="{ expanded, completed: !!completed }">
    <button class="thinking-toggle" type="button" @click="toggle">
      <el-icon :size="10" class="toggle-icon" :class="{ rotated: expanded }">
        <ArrowRight />
      </el-icon>
      <span class="thinking-title">{{ t('chat.thinkingProcess') }}</span>
      <span v-if="!expanded && preview" class="thinking-preview">{{ preview }}</span>
      <span v-if="!completed" class="thinking-live">{{ t('chat.thinking') }}</span>
    </button>
    <div v-if="expanded" class="thinking-body">
      <div class="thinking-quote">{{ content }}</div>
    </div>
  </div>
</template>

<style scoped>
.thinking-block {
  margin: 4px 0 10px;
  min-width: 0;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
}

.thinking-toggle:hover {
  color: var(--el-text-color-regular);
}

.toggle-icon {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.toggle-icon.rotated {
  transform: rotate(90deg);
}

.thinking-title {
  flex-shrink: 0;
  font-weight: 500;
}

.thinking-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}

.thinking-live {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.7;
}

.thinking-body {
  margin-top: 4px;
}

.thinking-quote {
  margin: 0;
  padding: 4px 0 4px 12px;
  border-left: 3px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
