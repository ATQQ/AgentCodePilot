<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { House, ChatDotRound, Setting } from '@element-plus/icons-vue'
import SidebarNavSection from './SidebarNavSection.vue'

const router = useRouter()
const route = useRoute()

const navItems = [
  { name: 'home', label: 'Home', path: '/', icon: House },
  { name: 'chat', label: 'Chat', path: '/chat', icon: ChatDotRound },
  { name: 'settings', label: 'Settings', path: '/settings', icon: Setting }
]

function navigate(path: string): void {
  router.push(path)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-drag-area"></div>
    <SidebarNavSection>
      <button
        v-for="item in navItems"
        :key="item.name"
        class="nav-item"
        :class="{ active: route.path === item.path }"
        @click="navigate(item.path)"
      >
        <el-icon :size="16"><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
    </SidebarNavSection>
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

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 10px var(--spacing-lg);
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
</style>
