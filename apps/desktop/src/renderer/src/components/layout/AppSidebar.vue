<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import {
  Plus,
  ChatDotRound,
  Search,
  MagicStick,
  SetUp,
  FolderOpened,
  Setting
} from '@element-plus/icons-vue'
import SidebarNavSection from './SidebarNavSection.vue'

const router = useRouter()
const route = useRoute()

const primaryItems = [
  { name: 'new-agent', label: 'New Agent', path: '/', icon: Plus }
]

const workItems = [
  { name: 'conversations', label: 'Conversations', path: '/chat', icon: ChatDotRound },
  { name: 'search', label: 'Search', path: '/search', icon: Search }
]

const toolItems = [
  { name: 'skills', label: 'Skills', path: '/skills', icon: MagicStick },
  { name: 'automations', label: 'Automations', path: '/automations', icon: SetUp },
  { name: 'projects', label: 'Projects', path: '/projects', icon: FolderOpened }
]

const bottomItems = [
  { name: 'settings', label: 'Settings', path: '/settings', icon: Setting }
]

function navigate(path: string): void {
  router.push(path)
}

function isActive(item: { path: string; name: string }): boolean {
  if (item.name === 'new-agent') return route.path === '/'
  return route.path === item.path
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-drag-area"></div>
    <div class="sidebar-nav">
      <SidebarNavSection>
        <button
          v-for="item in primaryItems"
          :key="item.name"
          class="nav-item nav-item--primary"
          :class="{ active: isActive(item) }"
          @click="navigate(item.path)"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </button>
      </SidebarNavSection>
      <SidebarNavSection>
        <button
          v-for="item in workItems"
          :key="item.name"
          class="nav-item"
          :class="{ active: isActive(item) }"
          @click="navigate(item.path)"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </button>
      </SidebarNavSection>
      <SidebarNavSection>
        <button
          v-for="item in toolItems"
          :key="item.name"
          class="nav-item"
          :class="{ active: isActive(item) }"
          @click="navigate(item.path)"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </button>
      </SidebarNavSection>
    </div>
    <div class="sidebar-bottom">
      <SidebarNavSection>
        <button
          v-for="item in bottomItems"
          :key="item.name"
          class="nav-item"
          :class="{ active: isActive(item) }"
          @click="navigate(item.path)"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </button>
      </SidebarNavSection>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100vh;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-drag-area {
  height: var(--topbar-height);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--spacing-sm);
}

.sidebar-bottom {
  padding: 0 var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  border-top: 1px solid var(--sidebar-item-hover);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 8px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-base);
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
}

.nav-item--primary {
  color: var(--sidebar-text-active);
  font-weight: 500;
}
</style>
