<script setup lang="ts">
defineProps<{
  title: string
  floating?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="side-tree-folder-btn"
    :class="{ floating }"
    :title="title"
    @click="$emit('click')"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path
        d="M2 4a1 1 0 0 1 1-1h3.586a1 1 0 0 1 .707.293L8.707 4.7A1 1 0 0 0 9.414 5H13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
      />
    </svg>
  </button>
</template>

<style scoped>
.side-tree-folder-btn {
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
  box-shadow: var(--shadow-sm);
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.side-tree-folder-btn.floating {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 6;
}

.side-tree-folder-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.side-tree-folder-btn:active {
  border-width: 1px;
  padding: 0;
  transform: none;
}
</style>
