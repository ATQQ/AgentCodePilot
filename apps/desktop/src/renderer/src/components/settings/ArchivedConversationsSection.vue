<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search, FolderOpened, MoreFilled } from '@element-plus/icons-vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import type { Conversation } from '@renderer/types'

const { t } = useI18n()
const router = useRouter()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()

const searchQuery = ref('')
const projectFilter = ref<string>('all')
const groupMenu = ref<{ visible: boolean; x: number; y: number; projectId: string | null }>({
  visible: false,
  x: 0,
  y: 0,
  projectId: null
})
const convMenu = ref<{ visible: boolean; x: number; y: number; convId: string | null }>({
  visible: false,
  x: 0,
  y: 0,
  convId: null
})

interface ArchivedGroup {
  projectId: string | null
  name: string
  conversations: Conversation[]
}

onMounted(async () => {
  await chatStore.loadArchivedConversations()
})

const archivedConversations = computed(() => chatStore.getArchivedConversations())

const projectFilterOptions = computed(() => {
  const options: { value: string; label: string }[] = [
    { value: 'all', label: t('archived.allChats') }
  ]
  const seen = new Set<string>()
  for (const conv of archivedConversations.value) {
    const key = conv.projectId ?? '__none__'
    if (seen.has(key)) continue
    seen.add(key)
    options.push({
      value: key,
      label: resolveGroupName(conv.projectId) ?? t('archived.noProject')
    })
  }
  return options
})

const filteredConversations = computed(() => {
  let list = archivedConversations.value
  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((conv) => getConvTitle(conv).toLowerCase().includes(query))
  }
  if (projectFilter.value !== 'all') {
    const projectId = projectFilter.value === '__none__' ? null : projectFilter.value
    list = list.filter((conv) => (conv.projectId ?? null) === projectId)
  }
  return list
})

const groupedConversations = computed<ArchivedGroup[]>(() => {
  const groups = new Map<string, ArchivedGroup>()
  for (const conv of filteredConversations.value) {
    const key = conv.projectId ?? '__none__'
    if (!groups.has(key)) {
      groups.set(key, {
        projectId: conv.projectId ?? null,
        name: resolveGroupName(conv.projectId) ?? t('archived.noProject'),
        conversations: []
      })
    }
    groups.get(key)!.conversations.push(conv)
  }
  return Array.from(groups.values())
})

function resolveGroupName(projectId: string | null | undefined): string | null {
  if (!projectId) return null
  const project = workspaceStore.projects.find((p) => p.id === projectId)
  if (project) return project.name
  const workspace = workspaceStore.workspaces.find((w) => w.id === projectId)
  if (workspace) return workspace.name
  return projectId
}

function getConvTitle(conv: Conversation): string {
  if (conv.title) return conv.title
  if (conv.messages.length > 0) {
    const first = conv.messages[0].content
    return first.length > 30 ? first.slice(0, 30) + '...' : first
  }
  return t('sidebar.newChat')
}

function formatArchivedTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function openConversation(convId: string): void {
  chatStore.setActive(convId)
  router.push('/chat')
}

function handleDeleteAll(): void {
  if (archivedConversations.value.length === 0) return
  if (!window.confirm(t('archived.deleteAllConfirm'))) return
  void chatStore.deleteAllArchivedConversations()
}

function showGroupMenu(e: MouseEvent, projectId: string | null): void {
  e.stopPropagation()
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  groupMenu.value = {
    visible: true,
    x: rect.left,
    y: rect.bottom + 4,
    projectId
  }
}

function showConvMenu(e: MouseEvent, convId: string): void {
  e.stopPropagation()
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  convMenu.value = {
    visible: true,
    x: rect.left,
    y: rect.bottom + 4,
    convId
  }
}

function closeMenus(): void {
  groupMenu.value.visible = false
  convMenu.value.visible = false
}

function unarchiveConversation(convId: string): void {
  chatStore.unarchiveConversation(convId)
  closeMenus()
}

function unarchiveGroup(projectId: string | null): void {
  for (const conv of archivedConversations.value) {
    if ((conv.projectId ?? null) === projectId) {
      chatStore.unarchiveConversation(conv.id)
    }
  }
  closeMenus()
}

function deleteConversation(convId: string): void {
  if (!window.confirm(t('archived.deleteConfirm'))) return
  chatStore.deleteArchivedConversation(convId)
  closeMenus()
}
</script>

<template>
  <div class="archived-section" @click="closeMenus">
    <div class="archived-header">
      <h1 class="page-title">{{ t('settings.archivedConversations') }}</h1>
      <button
        class="delete-all-btn"
        :disabled="archivedConversations.length === 0"
        @click.stop="handleDeleteAll"
      >
        {{ t('archived.deleteAll') }}
      </button>
    </div>

    <div class="archived-toolbar">
      <div class="search-box">
        <el-icon :size="14" class="search-icon"><Search /></el-icon>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          :placeholder="t('archived.searchPlaceholder')"
        />
      </div>
      <select v-model="projectFilter" class="filter-select">
        <option v-for="opt in projectFilterOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div v-if="groupedConversations.length === 0" class="archived-empty">
      {{ t('archived.empty') }}
    </div>

    <div v-else class="archived-groups">
      <div
        v-for="group in groupedConversations"
        :key="group.projectId ?? '__none__'"
        class="archived-group"
      >
        <div class="group-header">
          <div class="group-info">
            <el-icon :size="14"><FolderOpened /></el-icon>
            <span class="group-name">{{ group.name }}</span>
          </div>
          <div class="group-actions">
            <span class="group-count">{{
              t('archived.chatCount', { count: group.conversations.length })
            }}</span>
            <button
              type="button"
              class="menu-btn"
              @click.stop="showGroupMenu($event, group.projectId)"
            >
              <el-icon :size="14"><MoreFilled /></el-icon>
            </button>
          </div>
        </div>

        <div
          v-for="conv in group.conversations"
          :key="conv.id"
          class="archived-conv-item"
          role="button"
          tabindex="0"
          @click="openConversation(conv.id)"
          @keydown.enter.prevent="openConversation(conv.id)"
          @keydown.space.prevent="openConversation(conv.id)"
        >
          <div class="conv-main">
            <span class="conv-title">{{ getConvTitle(conv) }}</span>
            <span class="conv-time">{{ formatArchivedTime(conv.updatedAt) }}</span>
          </div>
          <button type="button" class="menu-btn" @click.stop="showConvMenu($event, conv.id)">
            <el-icon :size="14"><MoreFilled /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="groupMenu.visible"
        class="floating-menu"
        :style="{ left: groupMenu.x + 'px', top: groupMenu.y + 'px' }"
        @click.stop
      >
        <button class="menu-item" @click="unarchiveGroup(groupMenu.projectId)">
          {{ t('archived.unarchive') }}
        </button>
      </div>
      <div
        v-if="convMenu.visible"
        class="floating-menu"
        :style="{ left: convMenu.x + 'px', top: convMenu.y + 'px' }"
        @click.stop
      >
        <button
          class="menu-item"
          @click="convMenu.convId && unarchiveConversation(convMenu.convId)"
        >
          {{ t('archived.unarchive') }}
        </button>
        <button
          class="menu-item menu-item--danger"
          @click="convMenu.convId && deleteConversation(convMenu.convId)"
        >
          {{ t('archived.delete') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.archived-section {
  padding-top: var(--spacing-lg);
}

.archived-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--content-text);
  margin: 0;
}

.delete-all-btn {
  padding: 6px 12px;
  border: 1px solid rgba(229, 62, 62, 0.35);
  border-radius: var(--radius-md);
  background: rgba(229, 62, 62, 0.08);
  color: #e53e3e;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.delete-all-btn:hover:not(:disabled) {
  background: rgba(229, 62, 62, 0.14);
}

.delete-all-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.archived-toolbar {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.search-box {
  flex: 1;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--content-text-tertiary);
}

.search-input {
  width: 100%;
  padding: 8px 10px 8px 32px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
}

.search-input:focus {
  border-color: var(--composer-border-focus);
}

.filter-select {
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
}

.archived-empty {
  padding: var(--spacing-2xl);
  text-align: center;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}

.archived-groups {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.archived-group {
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--content-bg);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px var(--spacing-md);
  border-bottom: 1px solid var(--sidebar-border);
  background: var(--btn-secondary-bg);
}

.group-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.group-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.group-count {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.archived-conv-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 12px var(--spacing-md);
  border: none;
  border-bottom: 1px solid var(--sidebar-border);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.archived-conv-item:last-child {
  border-bottom: none;
}

.archived-conv-item:hover {
  background: var(--sidebar-item-hover);
}

.conv-main {
  flex: 1;
  min-width: 0;
}

.conv-title {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--content-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  display: block;
  margin-top: 4px;
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.menu-btn:hover {
  background: var(--btn-ghost-hover);
  color: var(--content-text);
}

.floating-menu {
  position: fixed;
  min-width: 140px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs);
  z-index: 10000;
}

.menu-item {
  display: block;
  width: 100%;
  padding: 7px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--btn-ghost-hover);
}

.menu-item--danger {
  color: #e53e3e;
}

.menu-item--danger:hover {
  background: rgba(229, 62, 62, 0.08);
}
</style>
