<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FolderOpened } from '@element-plus/icons-vue'

const { t } = useI18n()
</script>

<template>
  <button class="workspace-btn">
    <el-icon :size="14"><FolderOpened /></el-icon>
    <span>{{ t('home.enterProject') }}</span>
    <span class="chevron">&#8250;</span>
  </button>
</template>

<style scoped>
.workspace-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--composer-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.workspace-btn:hover {
  background: var(--btn-ghost-hover);
  border-color: var(--content-text-tertiary);
}

.chevron {
  font-size: 12px;
  opacity: 0.5;
}
</style>
