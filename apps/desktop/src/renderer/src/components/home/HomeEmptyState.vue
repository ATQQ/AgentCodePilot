<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="empty-state">
    <h1 class="empty-title">{{ t('home.title') }}</h1>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: var(--font-size-3xl);
  font-weight: 600;
  color: var(--content-text);
  letter-spacing: -0.5px;
}
</style>
