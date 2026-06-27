<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  isLongUserMessage,
  USER_MESSAGE_COLLAPSED_LINES
} from '@renderer/composables/useChatTimelineItems'

const props = defineProps<{
  content: string
  expanded: boolean
  planMode?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const { t } = useI18n()

const collapsedLines = USER_MESSAGE_COLLAPSED_LINES

const isLong = computed(() => isLongUserMessage(props.content))
const collapsed = computed(() => isLong.value && !props.expanded)

function handleTextClick(): void {
  if (collapsed.value) emit('toggle')
}
</script>

<template>
  <div
    class="user-message-text"
    :class="{
      'user-message-text--collapsed': collapsed,
      'user-message-text--plan': planMode
    }"
    @click="handleTextClick"
  >
    <div class="user-message-text-body">{{ content }}</div>
    <button
      v-if="isLong"
      type="button"
      class="user-message-text-toggle"
      @click.stop="emit('toggle')"
    >
      {{ expanded ? t('chat.collapseMessage') : t('chat.expandMessage') }}
    </button>
  </div>
</template>

<style scoped>
.user-message-text {
  min-width: 0;
}

.user-message-text-body {
  white-space: pre-wrap;
  word-break: break-word;
}

.user-message-text--collapsed {
  cursor: pointer;
}

.user-message-text--collapsed .user-message-text-body {
  max-height: calc(1.5em * v-bind(collapsedLines));
  overflow: hidden;
  position: relative;
}

.user-message-text--collapsed .user-message-text-body::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1.6em;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--user-message-fade-color, var(--btn-primary-bg))
  );
  pointer-events: none;
}

.user-message-text--plan.user-message-text--collapsed .user-message-text-body::after {
  background: linear-gradient(to bottom, transparent, var(--content-bg));
}

.user-message-text-toggle {
  display: inline-block;
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  color: inherit;
  opacity: 0.88;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.user-message-text--plan .user-message-text-toggle {
  color: var(--accent-color);
  opacity: 1;
}

.user-message-text-toggle:hover {
  opacity: 1;
}
</style>
