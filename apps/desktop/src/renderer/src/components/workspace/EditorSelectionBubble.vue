<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  x: number
  y: number
  visible: boolean
}>()

const emit = defineEmits<{
  addToChat: []
}>()

const { t } = useI18n()

const style = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`
}))

function onAddToChat(): void {
  emit('addToChat')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="editor-selection-bubble" :style="style" @mousedown.stop>
      <button class="bubble-btn" @click="onAddToChat">
        {{ t('workspace.filePreview.addSelectionToChat') }}
        <kbd class="bubble-kbd">⌘L</kbd>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.editor-selection-bubble {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, -100%) translateY(-8px);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  box-shadow: var(--shadow-md);
}

.bubble-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
}

.bubble-btn:hover {
  background: var(--sidebar-item-hover);
}

.bubble-kbd {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--btn-secondary-bg);
  color: var(--content-text-tertiary);
  font-size: 10px;
  font-family: inherit;
}
</style>
