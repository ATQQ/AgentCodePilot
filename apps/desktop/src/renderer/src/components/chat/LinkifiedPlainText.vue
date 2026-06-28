<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBrowserPreview } from '@renderer/composables/useBrowserPreview'
import { splitPlainTextBrowserReferences } from '@renderer/utils/linkifyBrowserReferences'

const props = defineProps<{
  text: string
}>()

const { t } = useI18n()
const { htmlBaseDirs, openInBrowser } = useBrowserPreview()

const segments = computed(() => splitPlainTextBrowserReferences(props.text, htmlBaseDirs.value))

function handleLinkClick(event: MouseEvent, url: string): void {
  event.preventDefault()
  event.stopPropagation()
  openInBrowser(url)
}
</script>

<template>
  <span class="linkified-plain-text">
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
      <button
        v-else
        type="button"
        class="chat-browser-link"
        :title="t('chat.openInBrowser')"
        @click="handleLinkClick($event, segment.url)"
      >
        {{ segment.value }}
      </button>
    </template>
  </span>
</template>

<style scoped>
.linkified-plain-text {
  white-space: inherit;
}

.chat-browser-link {
  display: inline;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--accent-color);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.chat-browser-link:hover {
  opacity: 0.85;
}
</style>
