<script setup lang="ts">
import { LinkNode, type LinkNodeProps } from 'markstream-vue'
import { useI18n } from 'vue-i18n'
import { useBrowserPreview } from '@renderer/composables/useBrowserPreview'

const props = defineProps<LinkNodeProps>()

const { t } = useI18n()
const { openInBrowser } = useBrowserPreview()

function handleClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  openInBrowser(props.node.href)
}
</script>

<template>
  <span class="chat-browser-link-wrap" @click.capture.prevent="handleClick">
    <LinkNode v-bind="props" :title="t('chat.openInBrowser')" />
  </span>
</template>

<style scoped>
.chat-browser-link-wrap {
  display: inline;
}

.chat-browser-link-wrap :deep(a) {
  color: var(--accent-color);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
</style>
