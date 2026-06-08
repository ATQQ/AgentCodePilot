<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const selected = ref('custom-high')

const options = [
  { value: 'custom-high', label: `${t('composer.custom')} ${t('composer.high')}` },
  { value: 'custom-medium', label: `${t('composer.custom')} ${t('composer.medium')}` },
  { value: 'custom-low', label: `${t('composer.custom')} ${t('composer.low')}` }
]
</script>

<template>
  <el-select
    v-model="selected"
    size="small"
    class="agent-select"
  >
    <el-option
      v-for="opt in options"
      :key="opt.value"
      :label="opt.label"
      :value="opt.value"
    />
  </el-select>
</template>

<style scoped>
.agent-select {
  --el-select-width: 100px;
}

.agent-select :deep(.el-input__wrapper) {
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
}
</style>
