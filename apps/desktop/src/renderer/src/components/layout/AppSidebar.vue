<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const navItems = [
  { name: 'home', label: 'Home', path: '/' },
  { name: 'chat', label: 'Chat', path: '/chat' },
  { name: 'settings', label: 'Settings', path: '/settings' }
]

function navigate(path: string): void {
  router.push(path)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-drag-area"></div>
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.name"
        class="nav-item"
        :class="{ active: route.path === item.path }"
        @click="navigate(item.path)"
      >
        {{ item.label }}
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  min-width: 220px;
  height: 100vh;
  background: #1e1e2e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-drag-area {
  height: 36px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

.nav-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #a6adc8;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: #313244;
  color: #cdd6f4;
}

.nav-item.active {
  background: #45475a;
  color: #cdd6f4;
}
</style>
