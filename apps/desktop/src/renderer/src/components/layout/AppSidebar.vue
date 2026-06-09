<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  EditPen,
  Search,
  MagicStick,
  Setting,
  FolderOpened,
  Folder,
  MoreFilled
} from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { useChatStore } from '@renderer/stores/chat.store'
import { useAgentStore } from '@renderer/stores/agent.store'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const chatStore = useChatStore()
const agentStore = useAgentStore()

const topNavItems = [
  { name: 'new-chat', path: '/', icon: EditPen, labelKey: 'sidebar.newChat' },
  { name: 'search', path: '/search', icon: Search, labelKey: 'sidebar.search' },
  { name: 'skills', path: '/skills', icon: MagicStick, labelKey: 'sidebar.skills' }
]

function navigate(path: string): void {
  router.push(path)
}

function isActive(path: string): boolean {
  return route.path === path
}

function openConversation(id: string): void {
  chatStore.setActive(id)
  router.push('/chat')
}

function newChatForProject(projectId: string): void {
  chatStore.createConversation(agentStore.selectedAgentId, '新对话', projectId)
  router.push('/chat')
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

        <div
          v-for="proj in workspaceStore.projects"
          :key="proj.id"
          class="project-group"
        >
          <div
            class="project-header"
            :class="{ active: workspaceStore.selectedProjectId === proj.id }"
            @click="workspaceStore.selectProject(proj.id)"
          >
            <el-icon :size="13"><FolderOpened /></el-icon>
            <span class="project-name">{{ proj.name }}</span>
            <div class="project-actions">
              <button class="action-btn" @click.stop>
                <el-icon :size="12"><MoreFilled /></el-icon>
              </button>
              <button class="action-btn" @click.stop="newChatForProject(proj.id)">
                <el-icon :size="12"><EditPen /></el-icon>
              </button>
            </div>
          </div>

          <div class="project-conversations">
            <template v-if="chatStore.getConversationsByProject(proj.id).length">
              <button
                v-for="conv in chatStore.getConversationsByProject(proj.id)"
                :key="conv.id"
                class="conv-item"
                :class="{ active: chatStore.activeConversationId === conv.id }"
                @click="openConversation(conv.id)"
              >
                <span class="conv-title">{{ conv.title }}</span>
                <span class="conv-time">{{ conv.updatedAt }}</span>
              </button>
            </template>
            <div v-else class="no-conversations">{{ t('sidebar.noChats') }}</div>
          </div>
        </div>
      </div>

      <div v-if="workspaceStore.workspaces.length" class="sidebar-section">
        <div class="section-title">{{ t('sidebar.workspaces') }}</div>

        <div
          v-for="ws in workspaceStore.workspaces"
          :key="ws.id"
          class="project-group"
        >
          <div
            class="project-header"
            :class="{ active: workspaceStore.selectedProjectId === ws.id }"
            @click="workspaceStore.selectProject(ws.id)"
          >
            <el-icon :size="13"><Folder /></el-icon>
            <span class="project-name">{{ ws.name }}</span>
            <div class="project-actions">
              <button class="action-btn" @click.stop>
                <el-icon :size="12"><MoreFilled /></el-icon>
              </button>
              <button class="action-btn" @click.stop>
                <el-icon :size="12"><EditPen /></el-icon>
              </button>
            </div>
          </div>

          <div class="project-conversations">
            <div class="no-conversations">{{ t('sidebar.noChats') }}</div>
          </div>
        </div>
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

/* Project group */
.project-group {
  margin-bottom: 2px;
}

.project-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 7px var(--spacing-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--sidebar-text);
  font-size: var(--font-size-sm);
  transition: background 0.15s, color 0.15s;
}

.project-header:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.project-header.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.project-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.project-header:hover .project-actions {
  display: flex;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

/* Conversations under project */
.project-conversations {
  padding-left: calc(var(--spacing-md) + 13px + var(--spacing-sm));
}

.conv-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 5px var(--spacing-sm);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  gap: var(--spacing-sm);
}

.conv-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.conv-item.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
}

.conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--sidebar-section-title);
}

.no-conversations {
  padding: 4px var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--sidebar-section-title);
}
</style>
