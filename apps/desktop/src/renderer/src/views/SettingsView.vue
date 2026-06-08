<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTheme } from '@renderer/composables/useTheme'
import type { ThemeMode } from '@renderer/composables/useTheme'

const { t } = useI18n()
const { theme } = useTheme()

const themeOptions: { value: ThemeMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.light' },
  { value: 'dark', labelKey: 'settings.dark' },
  { value: 'system', labelKey: 'settings.system' }
]
</script>

<template>
  <div class="settings-view">
    <div class="settings-container">
      <h1 class="settings-title">{{ t('settings.title') }}</h1>

      <div class="settings-section">
        <h2 class="section-title">{{ t('settings.appearance') }}</h2>

        <div class="setting-row">
          <span class="setting-label">{{ t('settings.theme') }}</span>
          <div class="theme-options">
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              class="theme-btn"
              :class="{ active: theme === opt.value }"
              @click="theme = opt.value"
            >
              {{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">{{ t('settings.language') }}</span>
          <span class="setting-value">{{ t('settings.zhCN') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  overflow: auto;
  padding: var(--spacing-xl) var(--spacing-2xl);
}

.settings-container {
  max-width: 560px;
  margin: 0 auto;
}

.settings-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--content-text);
  margin-bottom: var(--spacing-xl);
}

.settings-section {
  margin-bottom: var(--spacing-xl);
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--content-text);
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--sidebar-border);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) 0;
}

.setting-label {
  font-size: var(--font-size-base);
  color: var(--content-text);
}

.setting-value {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
}

.theme-options {
  display: flex;
  gap: 4px;
  background: var(--btn-secondary-bg);
  padding: 3px;
  border-radius: var(--radius-lg);
}

.theme-btn {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.theme-btn.active {
  background: var(--content-bg);
  color: var(--content-text);
  box-shadow: var(--shadow-sm);
}

.theme-btn:not(.active):hover {
  color: var(--content-text);
}
</style>
