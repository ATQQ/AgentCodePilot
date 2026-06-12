<script setup lang="ts">
import { ref, reactive, inject, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  EditPen,
  Search,
  MagicStick,
  Setting,
  FolderOpened,
  Folder,
  MoreFilled,
  ArrowDown
} from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { useChatStore } from '@renderer/stores/chat.store'
import { formatRelativeTime } from '@renderer/composables/useRelativeTime'
import type { Conversation } from '@renderer/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const chatStore = useChatStore()
const openSearch = inject<() => void>('openSearch', () => {})

const topNavItems = [
  { name: 'new-chat', path: '/', icon: EditPen, labelKey: 'sidebar.newChat' },
  { name: 'search', path: '/search', icon: Search, labelKey: 'sidebar.search' },
  { name: 'skills', path: '/skills', icon: MagicStick, labelKey: 'sidebar.skills' }
]

const collapsedProjects = ref<Set<string>>(new Set())

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  conv: null as Conversation | null,
  showCopySubmenu: false
})

const renaming = ref<{ id: string; title: string } | null>(null)
const renameInputRef = ref<HTMLInputElement | null>(null)

const projectRenaming = ref<{ id: string; name: string; type: 'project' | 'workspace' } | null>(null)
const projectRenameInputRef = ref<HTMLInputElement | null>(null)

const projectMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  id: '',
  type: '' as 'project' | 'workspace'
})

function navigate(path: string): void {
  if (path === '/search') {
    openSearch()
    return
  }
  router.push(path)
}

function isActive(path: string): boolean {
  return route.path === path
}

function toggleProjectCollapse(projId: string): void {
  if (collapsedProjects.value.has(projId)) {
    collapsedProjects.value.delete(projId)
  } else {
    collapsedProjects.value.add(projId)
  }
}

function isProjectCollapsed(projId: string): boolean {
  return collapsedProjects.value.has(projId)
}

function openConversation(id: string): void {
  chatStore.setActive(id)
  router.push('/chat')
}

function newChatForProject(e: MouseEvent, projectId: string): void {
  e.stopPropagation()
  workspaceStore.selectProject(projectId)
  router.push('/')
}

function getConvTitle(conv: Conversation): string {
  if (conv.messages.length > 0) {
    const first = conv.messages[0].content
    return first.length > 30 ? first.slice(0, 30) + '...' : first
  }
  return conv.title
}

function handleQuickPin(e: MouseEvent, conv: Conversation): void {
  e.stopPropagation()
  chatStore.togglePin(conv.id)
}

function showContextMenu(e: MouseEvent, conv: Conversation): void {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.visible = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.conv = conv
  contextMenu.showCopySubmenu = false
}

function showContextMenuFromButton(e: MouseEvent, conv: Conversation): void {
  e.stopPropagation()
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  contextMenu.visible = true
  contextMenu.x = rect.right
  contextMenu.y = rect.top
  contextMenu.conv = conv
  contextMenu.showCopySubmenu = false
}

function closeContextMenu(): void {
  contextMenu.visible = false
  contextMenu.conv = null
  contextMenu.showCopySubmenu = false
}

function handlePin(): void {
  if (contextMenu.conv) chatStore.togglePin(contextMenu.conv.id)
  closeContextMenu()
}

function handleRename(): void {
  if (!contextMenu.conv) return
  renaming.value = { id: contextMenu.conv.id, title: getConvTitle(contextMenu.conv) }
  closeContextMenu()
  setTimeout(() => renameInputRef.value?.focus(), 50)
}

function confirmRename(): void {
  if (renaming.value && renaming.value.title.trim()) {
    chatStore.renameConversation(renaming.value.id, renaming.value.title.trim())
  }
  renaming.value = null
}

function cancelRename(): void {
  renaming.value = null
}

function handleRenameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') confirmRename()
  else if (e.key === 'Escape') cancelRename()
}

function handleCopyWorkDir(): void {
  if (!contextMenu.conv) return
  const proj = workspaceStore.projects.find((p) => p.id === contextMenu.conv!.projectId)
  if (proj) navigator.clipboard.writeText(proj.path)
  closeContextMenu()
}

function handleCopyConvId(): void {
  if (contextMenu.conv) navigator.clipboard.writeText(contextMenu.conv.id)
  closeContextMenu()
}

function handleCopyMarkdown(): void {
  if (contextMenu.conv) {
    const md = chatStore.getConversationAsMarkdown(contextMenu.conv.id)
    navigator.clipboard.writeText(md)
  }
  closeContextMenu()
}

function handleArchive(): void {
  if (contextMenu.conv) chatStore.archiveConversation(contextMenu.conv.id)
  closeContextMenu()
}

function handleDelete(): void {
  if (contextMenu.conv) chatStore.deleteConversation(contextMenu.conv.id)
  closeContextMenu()
}

function showProjectMenu(e: MouseEvent, id: string, type: 'project' | 'workspace'): void {
  e.stopPropagation()
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  projectMenu.visible = true
  projectMenu.x = rect.right
  projectMenu.y = rect.top
  projectMenu.id = id
  projectMenu.type = type
}

function closeProjectMenu(): void {
  projectMenu.visible = false
}

function handleProjectRename(): void {
  const { id, type } = projectMenu
  let name = ''
  if (type === 'project') {
    const proj = workspaceStore.projects.find((p) => p.id === id)
    name = proj?.name ?? ''
  } else {
    const ws = workspaceStore.workspaces.find((w) => w.id === id)
    name = ws?.name ?? ''
  }
  projectRenaming.value = { id, name, type }
  closeProjectMenu()
  setTimeout(() => projectRenameInputRef.value?.focus(), 50)
}

function confirmProjectRename(): void {
  if (!projectRenaming.value || !projectRenaming.value.name.trim()) {
    projectRenaming.value = null
    return
  }
  const { id, name, type } = projectRenaming.value
  if (type === 'project') {
    workspaceStore.renameProject(id, name.trim())
  } else {
    workspaceStore.renameWorkspace(id, name.trim())
  }
  projectRenaming.value = null
}

function cancelProjectRename(): void {
  projectRenaming.value = null
}

function handleProjectRenameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') confirmProjectRename()
  else if (e.key === 'Escape') cancelProjectRename()
}

function handleProjectDelete(): void {
  const { id, type } = projectMenu
  if (type === 'project') {
    workspaceStore.removeProject(id)
  } else {
    workspaceStore.removeWorkspace(id)
  }
  closeProjectMenu()
}

function onDocumentClick(): void {
  if (contextMenu.visible) closeContextMenu()
  if (projectMenu.visible) closeProjectMenu()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
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
            @click="toggleProjectCollapse(ws.id)"
          >
            <el-icon :size="10" class="collapse-icon" :class="{ collapsed: isProjectCollapsed(ws.id) }">
              <ArrowDown />
            </el-icon>
            <el-icon :size="13"><Folder /></el-icon>
            <template v-if="projectRenaming && projectRenaming.id === ws.id">
              <input
                ref="projectRenameInputRef"
                v-model="projectRenaming.name"
                class="rename-input project-rename-input"
                @click.stop
                @keydown="handleProjectRenameKeydown"
                @blur="confirmProjectRename"
              />
            </template>
            <template v-else>
              <span class="project-name" :title="ws.folders.join('\n')">{{ ws.name }}</span>
            </template>
            <div class="project-actions">
              <button class="action-btn" @click="showProjectMenu($event, ws.id, 'workspace')">
                <el-icon :size="12"><MoreFilled /></el-icon>
              </button>
              <button class="action-btn" @click="newChatForProject($event, ws.id)">
                <el-icon :size="12"><EditPen /></el-icon>
              </button>
            </div>
          </div>

          <div v-if="!isProjectCollapsed(ws.id)" class="project-conversations">
            <div class="ws-sub-projects">
              <div
                v-for="proj in workspaceStore.getProjectsForWorkspace(ws.id)"
                :key="proj.id"
                class="ws-sub-project-item"
                :title="proj.path"
              >
                <el-icon :size="11"><FolderOpened /></el-icon>
                <span class="ws-sub-project-name">{{ proj.name }}</span>
              </div>
            </div>
            <template v-if="chatStore.getConversationsByProject(ws.id).length">
              <div
                v-for="conv in chatStore.getConversationsByProject(ws.id)"
                :key="conv.id"
                class="conv-item"
                :class="{ active: chatStore.activeConversationId === conv.id }"
                @click="openConversation(conv.id)"
                @contextmenu="showContextMenu($event, conv)"
              >
                <template v-if="renaming && renaming.id === conv.id">
                  <input
                    ref="renameInputRef"
                    v-model="renaming.title"
                    class="rename-input"
                    @click.stop
                    @keydown="handleRenameKeydown"
                    @blur="confirmRename"
                  />
                </template>
                <template v-else>
                  <button
                    class="conv-pin-btn"
                    :class="{ pinned: conv.pinned }"
                    @click="handleQuickPin($event, conv)"
                    :title="conv.pinned ? '取消置顶' : '置顶'"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.55-.55-3.18 3.18a5.5 5.5 0 0 1-1.32 4.988.5.5 0 0 1-.707 0L5.843 11.32l-3.89 3.89a.5.5 0 0 1-.707-.708l3.89-3.89-2.824-2.823a.5.5 0 0 1 0-.707 5.5 5.5 0 0 1 4.988-1.32l3.18-3.18-.55-.55a.5.5 0 0 1 .354-.854z"/>
                    </svg>
                  </button>
                  <span class="conv-title">{{ getConvTitle(conv) }}</span>
                  <span class="conv-time">{{ formatRelativeTime(conv.updatedAt) }}</span>
                  <button class="conv-more-btn" @click="showContextMenuFromButton($event, conv)">
                    <el-icon :size="12"><MoreFilled /></el-icon>
                  </button>
                </template>
              </div>
            </template>
            <div v-else class="no-conversations">{{ t('sidebar.noChats') }}</div>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-title">{{ t('sidebar.projects') }}</div>

        <div
          v-for="proj in workspaceStore.standaloneProjects"
          :key="proj.id"
          class="project-group"
        >
          <div
            class="project-header"
            :class="{ active: workspaceStore.selectedProjectId === proj.id }"
            @click="toggleProjectCollapse(proj.id)"
          >
            <el-icon :size="10" class="collapse-icon" :class="{ collapsed: isProjectCollapsed(proj.id) }">
              <ArrowDown />
            </el-icon>
            <el-icon :size="13"><FolderOpened /></el-icon>
            <template v-if="projectRenaming && projectRenaming.id === proj.id">
              <input
                ref="projectRenameInputRef"
                v-model="projectRenaming.name"
                class="rename-input project-rename-input"
                @click.stop
                @keydown="handleProjectRenameKeydown"
                @blur="confirmProjectRename"
              />
            </template>
            <template v-else>
              <span class="project-name">{{ proj.name }}</span>
            </template>
            <div class="project-actions">
              <button class="action-btn" @click="showProjectMenu($event, proj.id, 'project')">
                <el-icon :size="12"><MoreFilled /></el-icon>
              </button>
              <button class="action-btn" @click="newChatForProject($event, proj.id)">
                <el-icon :size="12"><EditPen /></el-icon>
              </button>
            </div>
          </div>

          <div v-if="!isProjectCollapsed(proj.id)" class="project-conversations">
            <template v-if="chatStore.getConversationsByProject(proj.id).length">
              <div
                v-for="conv in chatStore.getConversationsByProject(proj.id)"
                :key="conv.id"
                class="conv-item"
                :class="{ active: chatStore.activeConversationId === conv.id }"
                @click="openConversation(conv.id)"
                @contextmenu="showContextMenu($event, conv)"
              >
                <template v-if="renaming && renaming.id === conv.id">
                  <input
                    ref="renameInputRef"
                    v-model="renaming.title"
                    class="rename-input"
                    @click.stop
                    @keydown="handleRenameKeydown"
                    @blur="confirmRename"
                  />
                </template>
                <template v-else>
                  <button
                    class="conv-pin-btn"
                    :class="{ pinned: conv.pinned }"
                    @click="handleQuickPin($event, conv)"
                    :title="conv.pinned ? '取消置顶' : '置顶'"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.55-.55-3.18 3.18a5.5 5.5 0 0 1-1.32 4.988.5.5 0 0 1-.707 0L5.843 11.32l-3.89 3.89a.5.5 0 0 1-.707-.708l3.89-3.89-2.824-2.823a.5.5 0 0 1 0-.707 5.5 5.5 0 0 1 4.988-1.32l3.18-3.18-.55-.55a.5.5 0 0 1 .354-.854z"/>
                    </svg>
                  </button>
                  <span class="conv-title">{{ getConvTitle(conv) }}</span>
                  <span class="conv-time">{{ formatRelativeTime(conv.updatedAt) }}</span>
                  <button class="conv-more-btn" @click="showContextMenuFromButton($event, conv)">
                    <el-icon :size="12"><MoreFilled /></el-icon>
                  </button>
                </template>
              </div>
            </template>
            <div v-else class="no-conversations">{{ t('sidebar.noChats') }}</div>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-title">{{ t('sidebar.conversations') }}</div>
        <div class="project-conversations">
          <template v-if="chatStore.getOrphanConversations().length">
            <div
              v-for="conv in chatStore.getOrphanConversations()"
              :key="conv.id"
              class="conv-item"
              :class="{ active: chatStore.activeConversationId === conv.id }"
              @click="openConversation(conv.id)"
              @contextmenu="showContextMenu($event, conv)"
            >
              <template v-if="renaming && renaming.id === conv.id">
                <input
                  ref="renameInputRef"
                  v-model="renaming.title"
                  class="rename-input"
                  @click.stop
                  @keydown="handleRenameKeydown"
                  @blur="confirmRename"
                />
              </template>
              <template v-else>
                <button
                  class="conv-pin-btn"
                  :class="{ pinned: conv.pinned }"
                  @click="handleQuickPin($event, conv)"
                  :title="conv.pinned ? '取消置顶' : '置顶'"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.55-.55-3.18 3.18a5.5 5.5 0 0 1-1.32 4.988.5.5 0 0 1-.707 0L5.843 11.32l-3.89 3.89a.5.5 0 0 1-.707-.708l3.89-3.89-2.824-2.823a.5.5 0 0 1 0-.707 5.5 5.5 0 0 1 4.988-1.32l3.18-3.18-.55-.55a.5.5 0 0 1 .354-.854z"/>
                  </svg>
                </button>
                <span class="conv-title">{{ getConvTitle(conv) }}</span>
                <span class="conv-time">{{ formatRelativeTime(conv.updatedAt) }}</span>
                <button class="conv-more-btn" @click="showContextMenuFromButton($event, conv)">
                  <el-icon :size="12"><MoreFilled /></el-icon>
                </button>
              </template>
            </div>
          </template>
          <div v-else class="no-conversations">{{ t('sidebar.noChats') }}</div>
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

    <!-- Context Menu -->
    <Teleport to="body">
      <Transition name="ctx-fade">
        <div
          v-if="contextMenu.visible"
          class="context-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <button class="ctx-item" @click="handlePin">
            <span class="ctx-icon">&#x1F4CC;</span>
            <span>{{ contextMenu.conv?.pinned ? '取消置顶' : '置顶' }}</span>
          </button>
          <button class="ctx-item" @click="handleRename">
            <span class="ctx-icon">&#x270F;</span>
            <span>重命名</span>
          </button>
          <div class="ctx-divider"></div>
          <div class="ctx-submenu-wrapper" @mouseenter="contextMenu.showCopySubmenu = true" @mouseleave="contextMenu.showCopySubmenu = false">
            <button class="ctx-item">
              <span class="ctx-icon">&#x1F4CB;</span>
              <span>复制</span>
              <span class="ctx-arrow">&#8250;</span>
            </button>
            <Transition name="ctx-fade">
              <div v-if="contextMenu.showCopySubmenu" class="ctx-submenu">
                <button class="ctx-item" @click="handleCopyWorkDir">
                  <span class="ctx-icon">&#x1F4C1;</span>
                  <span>复制工作目录</span>
                </button>
                <button class="ctx-item" @click="handleCopyConvId">
                  <span class="ctx-icon">&#x1F4CB;</span>
                  <span>复制会话 ID</span>
                </button>
                <button class="ctx-item" @click="handleCopyMarkdown">
                  <span class="ctx-icon">&#x1F4C4;</span>
                  <span>复制为 Markdown</span>
                </button>
              </div>
            </Transition>
          </div>
          <div class="ctx-divider"></div>
          <button class="ctx-item" @click="handleArchive">
            <span class="ctx-icon">&#x1F4E6;</span>
            <span>归档</span>
          </button>
          <button class="ctx-item ctx-item--danger" @click="handleDelete">
            <span class="ctx-icon">&#x1F5D1;</span>
            <span>删除</span>
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Project/Workspace Menu -->
    <Teleport to="body">
      <Transition name="ctx-fade">
        <div
          v-if="projectMenu.visible"
          class="context-menu"
          :style="{ left: projectMenu.x + 'px', top: projectMenu.y + 'px' }"
          @click.stop
        >
          <button class="ctx-item" @click="handleProjectRename">
            <span class="ctx-icon">&#x270F;</span>
            <span>重命名</span>
          </button>
          <div class="ctx-divider"></div>
          <button class="ctx-item ctx-item--danger" @click="handleProjectDelete">
            <span class="ctx-icon">&#x1F5D1;</span>
            <span>删除</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100vh;
  background: var(--sidebar-bg-translucent, rgba(249, 250, 251, 0.82));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-drag-area {
  height: var(--topbar-height);
  flex-shrink: 0;
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
  gap: 5px;
  padding: 7px var(--spacing-sm);
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

.collapse-icon {
  flex-shrink: 0;
  transition: transform 0.15s;
  opacity: 0.5;
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
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
  padding: 0;
}

.conv-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px var(--spacing-sm);
  padding-left: 6px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  gap: 0;
}

.conv-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text-active);
}

.conv-item.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-text-active);
  font-weight: 500;
}

.conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: 2px;
}

.conv-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--sidebar-section-title);
  margin-left: 6px;
}

.no-conversations {
  padding: 4px 8px 4px 26px;
  font-size: var(--font-size-xs);
  color: var(--sidebar-section-title);
}

/* Pin button in left gutter */
.conv-pin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
  height: 16px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: transparent;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: color 0.15s;
}

.conv-pin-btn:hover {
  color: var(--sidebar-text-active);
}

.conv-pin-btn.pinned {
  color: var(--sidebar-text);
}

.conv-item:hover .conv-pin-btn:not(.pinned) {
  color: var(--sidebar-section-title);
}

/* More button on conv item */
.conv-more-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.conv-more-btn:hover {
  background: var(--sidebar-item-active);
}

.conv-item:hover .conv-more-btn {
  display: flex;
}

.conv-item:hover .conv-time {
  display: none;
}

/* Workspace sub projects */
.ws-sub-projects {
  padding: 2px 0 4px 22px;
}

.ws-sub-project-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px var(--spacing-sm);
  font-size: 11px;
  color: var(--sidebar-section-title);
  border-radius: var(--radius-sm);
}

.ws-sub-project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Rename input */
.rename-input {
  flex: 1;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  outline: none;
}

.project-rename-input {
  font-size: var(--font-size-sm);
  min-width: 0;
}

/* Context menu */
.context-menu {
  position: fixed;
  min-width: 180px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs);
  z-index: 9999;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 7px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.ctx-item:hover {
  background: var(--btn-ghost-hover);
}

.ctx-item--danger {
  color: #e53e3e;
}

.ctx-item--danger:hover {
  background: rgba(229, 62, 62, 0.08);
}

.ctx-icon {
  width: 18px;
  text-align: center;
  font-size: 13px;
  flex-shrink: 0;
}

.ctx-arrow {
  margin-left: auto;
  font-size: 14px;
  color: var(--content-text-tertiary);
}

.ctx-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: var(--spacing-xs) var(--spacing-sm);
}

.ctx-submenu-wrapper {
  position: relative;
}

.ctx-submenu {
  position: absolute;
  left: 100%;
  top: -4px;
  min-width: 180px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs);
  z-index: 10000;
}

.ctx-fade-enter-active,
.ctx-fade-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.ctx-fade-enter-from,
.ctx-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
