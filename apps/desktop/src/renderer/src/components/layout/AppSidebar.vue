<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  EditPen,
  Search,
  MagicStick,
  Setting
} from '@element-plus/icons-vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const topNavItems = [
  { name: 'new-chat', path: '/', icon: EditPen, labelKey: 'sidebar.newChat' },
  { name: 'search', path: '/search', icon: Search, labelKey: 'sidebar.search' },
  { name: 'skills', path: '/skills', icon: MagicStick, labelKey: 'sidebar.skills' }
]

const mockProjects = [
  { id: 'proj-1', name: 'claude-code-best-practice' },
  { id: 'proj-2', name: 'demo-shared-lib' },
  { id: 'proj-3', name: 'demo-checker' },
  { id: 'proj-4', name: 'easypicker2-client' }
]

function navigate(path: string): void {
  router.push(path)
}

function isActive(path: string): boolean {
  return route.path === path
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-drag-area"></div>
    <div class="sidebar-content">
      <nav class="sidebar-nav">
        <button
          v-for="item in topNavItems"
          :key="item.name"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          @click="navigate(item.path)"
        >
          <el-icon :size="15"><component :is="item.icon" /></el-icon>
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </nav>

      <div class="sidebar-section">
        <div class="section-title">{{ t('sidebar.projects') }}</div>
        <div class="section-list">
          <button
            v-for="proj in mockProjects"
            :key="proj.id"
            class="nav-item nav-item--sub"
          >
            <span class="project-icon">&#xE8B7;</span>
            <span>{{ proj.name }}</span>
          </button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-title">{{ t('sidebar.workspaces') }}</div>
        <div class="section-empty">{{ t('sidebar.noWorkspaces') }}</div>
      </div>

      <div class="sidebar-section">
        <div class="section-title">{{ t('sidebar.conversations') }}</div>
        <div class="section-empty">{{ t('sidebar.noChats') }}</div>
      </div>
    </div>

    <div class="sidebar-footer">
      <button
        class="nav-item"
        :class="{ active: isActive('/settings') }"
        @click="navigate('/settings')"
      >
        <el-icon :size="15"><Setting /></el-icon>
        <span>{{ t('common.settings') }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
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

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--spacing-sm);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: var(--spacing-md);
}

.sidebar-section {
  padding: var(--spacing-sm) 0;
}

.section-title {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--sidebar-section-title);
}

.section-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.section-empty {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--sidebar-section-title);
}

.sidebar-footer {
  padding: var(--spacing-sm);
  border-top: 1px solid var(--sidebar-border);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 7px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.nav-item.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.nav-item--sub {
  padding-left: var(--spacing-lg);
  font-size: var(--font-size-xs);
}

.project-icon {
  font-family: 'Material Icons', sans-serif;
  font-size: 14px;
  opacity: 0.6;
}
</style>
