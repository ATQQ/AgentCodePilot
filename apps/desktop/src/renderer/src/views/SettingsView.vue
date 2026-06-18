<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@renderer/stores/settings.store'
import type { ThemeMode } from '@renderer/types'
import { ArrowLeft, Bell, Brush, Document, Cpu, MagicStick, FolderOpened, Files } from '@element-plus/icons-vue'
import ArchivedConversationsSection from '@renderer/components/settings/ArchivedConversationsSection.vue'
import AgentSettingsSection from '@renderer/components/settings/AgentSettingsSection.vue'
import AiPromptsSettingsSection from '@renderer/components/settings/AiPromptsSettingsSection.vue'
import FilePreviewSettingsSection from '@renderer/components/settings/FilePreviewSettingsSection.vue'
import ExternalAppsSettingsSection from '@renderer/components/settings/ExternalAppsSettingsSection.vue'
// TODO: 恢复未实现设置项时取消注释
// import {
//   Setting,
//   Document,
//   Star,
//   Key,
//   Camera,
//   Connection,
//   Monitor,
//   Mouse,
//   Link,
//   FolderOpened,
//   Tickets
// } from '@element-plus/icons-vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()

const activeSection = ref('appearance')

watch(
  () => route.query.section,
  (section) => {
    if (typeof section === 'string' && (section === 'appearance' || section === 'notifications' || section === 'archived' || section === 'agents' || section === 'aiFeatures' || section === 'filePreview' || section === 'externalApps')) {
      activeSection.value = section
    }
  },
  { immediate: true }
)

function selectSection(key: string): void {
  activeSection.value = key
  router.replace({ path: '/settings', query: key === 'appearance' ? {} : { section: key } })
}

interface NavItem {
  key: string
  labelKey: string
  icon: typeof Brush
}

interface NavGroup {
  titleKey: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    titleKey: 'settings.personal',
    items: [
      { key: 'appearance', labelKey: 'settings.appearance', icon: Brush },
      { key: 'notifications', labelKey: 'settings.notifications', icon: Bell }
    ]
  },
  {
    titleKey: 'settings.integration',
    items: [
      { key: 'agents', labelKey: 'settings.agentConfig.title', icon: Cpu },
      { key: 'aiFeatures', labelKey: 'settings.aiFeatures.title', icon: MagicStick },
      { key: 'filePreview', labelKey: 'settings.filePreview.title', icon: Files },
      { key: 'externalApps', labelKey: 'settings.externalApps.title', icon: FolderOpened }
    ]
  },
  {
    titleKey: 'settings.archived',
    items: [{ key: 'archived', labelKey: 'settings.archivedConversations', icon: Document }]
  }
]

// TODO: 恢复未实现设置项时替换上方 navGroups
// const navGroups: NavGroup[] = [
//   {
//     titleKey: 'settings.personal',
//     items: [
//       { key: 'general', labelKey: 'settings.general', icon: Setting },
//       { key: 'appearance', labelKey: 'settings.appearance', icon: Brush },
//       { key: 'configuration', labelKey: 'settings.configuration', icon: Document },
//       { key: 'personalization', labelKey: 'settings.personalization', icon: Star },
//       { key: 'shortcuts', labelKey: 'settings.keyboardShortcuts', icon: Key }
//     ]
//   },
//   {
//     titleKey: 'settings.integration',
//     items: [
//       { key: 'snapshots', labelKey: 'settings.appSnapshots', icon: Camera },
//       { key: 'mcp', labelKey: 'settings.mcpServers', icon: Connection },
//       { key: 'browser', labelKey: 'settings.browser', icon: Monitor },
//       { key: 'computer', labelKey: 'settings.computerControl', icon: Mouse }
//     ]
//   },
//   {
//     titleKey: 'settings.coding',
//     items: [
//       { key: 'hooks', labelKey: 'settings.hooks', icon: Link },
//       { key: 'connections', labelKey: 'settings.connections', icon: Connection },
//       { key: 'git', labelKey: 'settings.git', icon: Tickets },
//       { key: 'environment', labelKey: 'settings.environment', icon: Monitor },
//       { key: 'worktree', labelKey: 'settings.workTree', icon: FolderOpened }
//     ]
//   },
//   {
//     titleKey: 'settings.archived',
//     items: [
//       { key: 'archived', labelKey: 'settings.archivedConversations', icon: Document }
//     ]
//   }
// ]

const themeOptions: { value: ThemeMode; labelKey: string; icon: string }[] = [
  { value: 'light', labelKey: 'settings.light', icon: '☀' },
  { value: 'dark', labelKey: 'settings.dark', icon: '☽' },
  { value: 'system', labelKey: 'settings.system', icon: '⬚' }
]

function goBack(): void {
  if (window.history.state?.back != null) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="settings-page">
    <aside class="settings-sidebar">
      <div class="sidebar-drag-area"></div>
      <button class="back-btn" @click="goBack">
        <el-icon :size="14"><ArrowLeft /></el-icon>
        <span>{{ t('common.backToApp') }}</span>
      </button>

      <!-- TODO: 搜索功能实现后恢复
      <div class="search-box">
        <input
          type="text"
          :placeholder="t('settings.searchPlaceholder')"
          class="search-input"
        />
      </div>
      -->

      <nav class="settings-nav">
        <div v-for="group in navGroups" :key="group.titleKey" class="nav-group">
          <div class="group-title">{{ t(group.titleKey) }}</div>
          <button
            v-for="item in group.items"
            :key="item.key"
            class="nav-item"
            :class="{ active: activeSection === item.key }"
            @click="selectSection(item.key)"
          >
            <el-icon :size="14"><component :is="item.icon" /></el-icon>
            <span>{{ t(item.labelKey) }}</span>
          </button>
        </div>
      </nav>
    </aside>

    <main class="settings-content">
      <div class="settings-content-inner">
        <!-- Appearance Section -->
        <div v-if="activeSection === 'appearance'" class="content-section">
          <h1 class="page-title">{{ t('settings.appearance') }}</h1>

          <div class="setting-card">
            <div class="setting-header">
              <div>
                <div class="setting-label">{{ t('settings.theme') }}</div>
                <div class="setting-desc">{{ t('settings.themeDesc') }}</div>
              </div>
              <div class="theme-toggle">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  class="theme-btn"
                  :class="{ active: settingsStore.theme === opt.value }"
                  @click="settingsStore.setTheme(opt.value)"
                >
                  <span class="theme-icon">{{ opt.icon }}</span>
                  <span>{{ t(opt.labelKey) }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- TODO: 以下外观设置实现后恢复
          <div class="setting-card">
            <div class="setting-row">
              <div class="setting-label">{{ t('settings.uiFontSize') }}</div>
              <div class="setting-control">
                <span class="value-display">14 px</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-label">{{ t('settings.codeFontSize') }}</div>
              <div class="setting-control">
                <span class="value-display">13 px</span>
              </div>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-row">
              <div>
                <div class="setting-label">{{ t('settings.reduceAnimations') }}</div>
                <div class="setting-desc">{{ t('settings.reduceAnimationsDesc') }}</div>
              </div>
              <div class="segmented-control">
                <button class="seg-btn active">{{ t('settings.system') }}</button>
                <button class="seg-btn">{{ t('settings.on') }}</button>
                <button class="seg-btn">{{ t('settings.off') }}</button>
              </div>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-row">
              <div>
                <div class="setting-label">{{ t('settings.fontSmoothing') }}</div>
              </div>
              <el-switch />
            </div>
          </div>
          -->
        </div>

        <div v-else-if="activeSection === 'notifications'" class="content-section">
          <h1 class="page-title">{{ t('settings.notifications') }}</h1>

          <div class="setting-card">
            <div class="setting-row">
              <div>
                <div class="setting-label">{{ t('settings.permissionNotifications') }}</div>
                <div class="setting-desc">{{ t('settings.permissionNotificationsDesc') }}</div>
              </div>
              <button
                type="button"
                class="toggle-switch"
                :class="{ active: settingsStore.permissionNotificationsEnabled }"
                role="switch"
                :aria-checked="settingsStore.permissionNotificationsEnabled"
                @click="settingsStore.setPermissionNotificationsEnabled(!settingsStore.permissionNotificationsEnabled)"
              />
            </div>
          </div>
        </div>

        <div v-else-if="activeSection === 'agents'" class="content-section">
          <AgentSettingsSection />
        </div>

        <AiPromptsSettingsSection v-else-if="activeSection === 'aiFeatures'" />

        <FilePreviewSettingsSection v-else-if="activeSection === 'filePreview'" />

        <ExternalAppsSettingsSection v-else-if="activeSection === 'externalApps'" />

        <ArchivedConversationsSection v-else-if="activeSection === 'archived'" />

        <!-- TODO: General Section 实现后恢复
        <div v-else-if="activeSection === 'general'" class="content-section">
          <h1 class="page-title">{{ t('settings.general') }}</h1>

          <div class="setting-card">
            <div class="setting-row">
              <div class="setting-label">{{ t('settings.language') }}</div>
              <div class="setting-control">
                <span class="value-display">{{ t('settings.zhCN') }}</span>
              </div>
            </div>
          </div>
        </div>
        -->

        <!-- TODO: 其他设置分区实现后恢复
        <div v-else class="content-section">
          <h1 class="page-title">{{ t(`settings.${activeSection === 'shortcuts' ? 'keyboardShortcuts' : activeSection}`) }}</h1>
          <div class="coming-soon">
            <el-empty description="即将推出" :image-size="80" />
          </div>
        </div>
        -->
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  height: 100vh;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--content-bg);
  z-index: 100;
}

.settings-sidebar {
  width: 240px;
  min-width: 240px;
  height: 100vh;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-drag-area {
  height: var(--topbar-height);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  margin: 0 var(--spacing-sm) var(--spacing-sm);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  -webkit-app-region: no-drag;
}

.back-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

/* TODO: 搜索功能实现后恢复
.search-box {
  padding: 0 var(--spacing-md) var(--spacing-md);
}

.search-input {
  width: 100%;
  padding: 7px var(--spacing-md);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
  transition: border-color 0.15s;
}

.search-input::placeholder {
  color: var(--content-text-tertiary);
}

.search-input:focus {
  border-color: var(--composer-border-focus);
}
*/

.settings-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--spacing-sm);
}

.nav-group {
  margin-bottom: var(--spacing-md);
}

.group-title {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--sidebar-section-title);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 6px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.nav-item.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
  font-weight: 500;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xl) var(--spacing-2xl);
}

.settings-content-inner {
  max-width: 680px;
  margin: 0 auto;
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--content-text);
  margin-bottom: var(--spacing-xl);
}

.content-section {
  padding-top: var(--spacing-lg);
}

.setting-card {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  background: var(--content-bg);
}

.setting-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-lg);
}

/* TODO: 未实现设置项 UI 恢复时取消注释 */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--sidebar-border);
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-md);
}

.setting-label {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--content-text);
}

.setting-desc {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
  margin-top: 2px;
}

.toggle-switch {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 11px;
  background: var(--sidebar-border);
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--content-bg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s;
}

.toggle-switch.active {
  background: var(--accent-color);
}

.toggle-switch.active::after {
  transform: translateX(18px);
}

/* TODO: 未实现设置项 UI 恢复时取消注释
.setting-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.value-display {
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
  padding: 4px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  min-width: 60px;
  text-align: center;
}
*/

.theme-toggle {
  display: flex;
  gap: 2px;
  background: var(--btn-secondary-bg);
  padding: 3px;
  border-radius: var(--radius-lg);
}

.theme-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.theme-btn.active {
  background: var(--content-bg);
  color: var(--content-text);
  box-shadow: var(--shadow-sm);
}

.theme-btn:not(.active):hover {
  color: var(--content-text);
}

.theme-icon {
  font-size: 12px;
}

/* TODO: 未实现设置项 UI 恢复时取消注释
.segmented-control {
  display: flex;
  gap: 2px;
  background: var(--btn-secondary-bg);
  padding: 3px;
  border-radius: var(--radius-lg);
}

.seg-btn {
  padding: 5px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.seg-btn.active {
  background: var(--content-bg);
  color: var(--content-text);
  box-shadow: var(--shadow-sm);
}

.seg-btn:not(.active):hover {
  color: var(--content-text);
}

.coming-soon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
}
*/
</style>
