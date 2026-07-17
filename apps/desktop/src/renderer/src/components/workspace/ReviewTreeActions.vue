<script setup lang="ts">
import { Minus, Plus, RefreshLeft } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import SideTreeFolderBtn from './SideTreeFolderBtn.vue'
import type { GitDiffScope } from '@renderer/types'

defineProps<{
  scope: GitDiffScope
  disabled?: boolean
  treeCollapsed: boolean
}>()

const emit = defineEmits<{
  discardAll: []
  stageAll: []
  unstageAll: []
  toggleTree: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="review-tree-actions">
    <template v-if="scope === 'unstaged'">
      <button
        type="button"
        class="action-btn"
        :title="t('review.discardAll')"
        :disabled="disabled"
        @click="emit('discardAll')"
      >
        <el-icon :size="14"><RefreshLeft /></el-icon>
      </button>
      <button
        type="button"
        class="action-btn"
        :title="t('review.stageAll')"
        :disabled="disabled"
        @click="emit('stageAll')"
      >
        <el-icon :size="14"><Plus /></el-icon>
      </button>
    </template>
    <button
      v-else
      type="button"
      class="action-btn"
      :title="t('review.unstageAll')"
      :disabled="disabled"
      @click="emit('unstageAll')"
    >
      <el-icon :size="14"><Minus /></el-icon>
    </button>
    <SideTreeFolderBtn
      :title="treeCollapsed ? t('review.expandTree') : t('review.collapseTree')"
      @click="emit('toggleTree')"
    />
  </div>
</template>

<style scoped>
.review-tree-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
}

.action-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
