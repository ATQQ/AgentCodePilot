<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="nav-section">
    <div v-if="title" class="nav-section-title">{{ title }}</div>
    <slot />
  </div>
</template>

<style scoped>
.nav-section {
  padding: var(--spacing-sm) 0;
}

.nav-section-title {
  padding: var(--spacing-xs) var(--spacing-lg);
  font-size: var(--font-size-xs);
  color: var(--sidebar-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.6;
}
</style>
