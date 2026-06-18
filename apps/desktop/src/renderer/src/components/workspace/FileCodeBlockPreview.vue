<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const MonacoEditor = defineAsyncComponent(() => import('./MonacoEditor.vue'))

defineProps<{
  value: string
  filePath: string
  readOnly?: boolean
  isDark: boolean
  languageOverride?: string
}>()

defineEmits<{ 'update:value': [v: string] }>()
</script>

<template>
  <div class="file-code-block-preview">
    <MonacoEditor
      :value="value"
      :file-path="filePath"
      :read-only="readOnly"
      :language-override="languageOverride"
      @update:value="$emit('update:value', $event)"
    />
  </div>
</template>

<style scoped>
.file-code-block-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  width: 100%;
}
</style>
