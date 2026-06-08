<script setup lang="ts">
import { ref } from 'vue'

const selected = ref('MiMo (via mimo2c...)')

const models = [
  { value: 'MiMo (via mimo2c...)', label: 'MiMo (via mimo2c...)' },
  { value: 'Claude Sonnet 4', label: 'Claude Sonnet 4' },
  { value: 'Claude Opus 4', label: 'Claude Opus 4' },
  { value: 'GPT-4o', label: 'GPT-4o' }
]
</script>

<template>
  <el-select
    v-model="selected"
    size="small"
    class="model-select"
  >
    <el-option
      v-for="model in models"
      :key="model.value"
      :label="model.label"
      :value="model.value"
    />
  </el-select>
</template>

<style scoped>
.model-select {
  --el-select-width: 140px;
}

.model-select :deep(.el-input__wrapper) {
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
}
</style>
