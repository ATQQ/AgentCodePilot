<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpened, Search, Plus, Close, Folder } from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const showDropdown = ref(false)
const showWorkspacePanel = ref(false)
const searchQuery = ref('')
const workspaceName = ref('')
const workspaceFolders = ref<string[]>([])
const dropAbove = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedDisplayName = computed(() => {
  if (!workspaceStore.selectedProjectId) return null
  const proj = workspaceStore.projects.find((p) => p.id === workspaceStore.selectedProjectId)
  if (proj) return proj.name
  const ws = workspaceStore.workspaces.find((w) => w.id === workspaceStore.selectedProjectId)
  return ws?.name ?? null
})

const filteredProjects = computed(() => {
  if (!searchQuery.value) return workspaceStore.projects
  const q = searchQuery.value.toLowerCase()
  return workspaceStore.projects.filter((p) => p.name.toLowerCase().includes(q))
})

const filteredWorkspaces = computed(() => {
  if (!searchQuery.value) return workspaceStore.workspaces
  const q = searchQuery.value.toLowerCase()
  return workspaceStore.workspaces.filter((ws) => ws.name.toLowerCase().includes(q))
})

function selectProject(id: string | null): void {
  workspaceStore.selectProject(id)
  showDropdown.value = false
  searchQuery.value = ''
}

function selectWorkspace(id: string): void {
  workspaceStore.selectProject(id)
  showDropdown.value = false
  searchQuery.value = ''
}

async function toggleDropdown(): Promise<void> {
  showDropdown.value = !showDropdown.value
  showWorkspacePanel.value = false
  searchQuery.value = ''

  if (showDropdown.value) {
    await nextTick()
    adjustDropdownPosition()
  }
}

function adjustDropdownPosition(): void {
  if (!triggerRef.value || !dropdownRef.value) return
  const triggerRect = triggerRef.value.getBoundingClientRect()
  const dropdownHeight = dropdownRef.value.offsetHeight
  const viewportHeight = window.innerHeight
  const spaceBelow = viewportHeight - triggerRect.bottom - 10
  dropAbove.value = spaceBelow < dropdownHeight && triggerRect.top > dropdownHeight
}

async function handleAddProject(): Promise<void> {
  const project = await workspaceStore.addProject()
  if (project) {
    workspaceStore.selectProject(project.id)
    showDropdown.value = false
  }
}

function openWorkspaceSetup(): void {
  showDropdown.value = false
  showWorkspacePanel.value = true
  workspaceName.value = ''
  workspaceFolders.value = []
}

async function addFolderToWorkspace(): Promise<void> {
  const path = await window.agentAPI.dialog.selectFolder()
  if (path && !workspaceFolders.value.includes(path)) {
    workspaceFolders.value.push(path)
  }
}

function removeFolderFromWorkspace(folder: string): void {
  workspaceFolders.value = workspaceFolders.value.filter((f) => f !== folder)
}

async function saveWorkspace(): Promise<void> {
  if (workspaceName.value.trim() && workspaceFolders.value.length) {
    workspaceStore.createWorkspace(workspaceName.value.trim(), [...workspaceFolders.value])
    for (const folder of workspaceFolders.value) {
      const existing = workspaceStore.projects.find((p) => p.path === folder)
      if (!existing) {
        const name = folder.split('/').pop() || folder
        const project = { id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name, path: folder }
        workspaceStore.projects.push(project)
        await window.agentAPI.projects.save(project)
      }
    }
  }
  showWorkspacePanel.value = false
}

function closeWorkspacePanel(): void {
  showWorkspacePanel.value = false
}
</script>

<template>
  <div class="workspace-selector">
    <button v-if="selectedDisplayName" ref="triggerRef" class="selected-project-btn" @click="toggleDropdown">
      <el-icon :size="14"><FolderOpened /></el-icon>
      <span>{{ selectedDisplayName }}</span>
      <span class="chevron">&#x25BE;</span>
    </button>

    <button v-else ref="triggerRef" class="enter-project-btn" @click="toggleDropdown">
      <el-icon :size="14"><FolderOpened /></el-icon>
      <span>{{ t('project.enterProject') }}</span>
      <span class="chevron">&#x25BE;</span>
    </button>

    <Transition name="fade">
      <div v-if="showDropdown" ref="dropdownRef" class="project-dropdown" :class="{ 'drop-above': dropAbove }">
        <div class="dropdown-search">
          <el-icon :size="14" class="search-icon"><Search /></el-icon>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('project.searchProject')"
            class="search-input"
          />
        </div>

        <div v-if="filteredProjects.length" class="dropdown-list">
          <button
            v-for="proj in filteredProjects"
            :key="proj.id"
            class="dropdown-item"
            :class="{ selected: workspaceStore.selectedProjectId === proj.id }"
            @click="selectProject(proj.id)"
          >
            <el-icon :size="14"><FolderOpened /></el-icon>
            <div class="item-content">
              <span class="item-label">{{ proj.name }}</span>
              <span class="item-path">{{ proj.path }}</span>
            </div>
            <span v-if="workspaceStore.selectedProjectId === proj.id" class="check">&#x2713;</span>
          </button>
        </div>

        <div v-if="filteredWorkspaces.length" class="dropdown-divider"></div>
        <div v-if="filteredWorkspaces.length" class="dropdown-group-title">{{ t('sidebar.workspaces') }}</div>
        <div v-if="filteredWorkspaces.length" class="dropdown-list">
          <button
            v-for="ws in filteredWorkspaces"
            :key="ws.id"
            class="dropdown-item"
            :class="{ selected: workspaceStore.selectedProjectId === ws.id }"
            @click="selectWorkspace(ws.id)"
          >
            <el-icon :size="14"><Folder /></el-icon>
            <span class="item-label">{{ ws.name }}</span>
            <span class="ws-folder-count">{{ ws.folders.length }} 个项目</span>
          </button>
        </div>

        <!-- 选中工作空间时展示关联项目 -->
        <template v-if="workspaceStore.currentWorkspace">
          <div class="dropdown-divider"></div>
          <div class="dropdown-group-title">当前工作空间项目</div>
          <div class="dropdown-list workspace-projects">
            <div
              v-for="folder in workspaceStore.currentWorkspace.folders"
              :key="folder"
              class="ws-project-item"
            >
              <el-icon :size="12"><FolderOpened /></el-icon>
              <span class="folder-path">{{ folder.split('/').pop() }}</span>
              <span class="folder-full-path">{{ folder }}</span>
            </div>
          </div>
        </template>

        <div class="dropdown-divider"></div>

        <button class="dropdown-item" @click="handleAddProject">
          <el-icon :size="14"><Plus /></el-icon>
          <span class="item-label">{{ t('project.useExistingFolder') }}</span>
        </button>

        <button class="dropdown-item" @click="openWorkspaceSetup">
          <el-icon :size="14"><Folder /></el-icon>
          <span class="item-label">{{ t('project.setupWorkspace') }}</span>
        </button>

        <div v-if="workspaceStore.selectedProjectId" class="dropdown-divider"></div>
        <button v-if="workspaceStore.selectedProjectId" class="dropdown-item" @click="selectProject(null)">
          <el-icon :size="14"><Close /></el-icon>
          <span class="item-label">{{ t('project.noProject') }}</span>
        </button>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showWorkspacePanel" class="workspace-panel">
        <div class="panel-header">
          <button class="panel-back" @click="closeWorkspacePanel">&#x2039;</button>
          <input
            v-model="workspaceName"
            type="text"
            :placeholder="t('project.workspaceNamePlaceholder')"
            class="workspace-name-input"
          />
          <button v-if="workspaceName.trim() && workspaceFolders.length" class="panel-save" @click="saveWorkspace">
            &#x2713;
          </button>
        </div>

        <div v-if="workspaceFolders.length" class="workspace-folders">
          <div
            v-for="folder in workspaceFolders"
            :key="folder"
            class="workspace-folder-item"
          >
            <el-icon :size="14"><Folder /></el-icon>
            <span class="folder-path">{{ folder }}</span>
            <button class="folder-remove" @click="removeFolderFromWorkspace(folder)">
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </div>
        </div>

        <div class="dropdown-divider"></div>
        <button class="dropdown-item" @click="addFolderToWorkspace">
          <el-icon :size="14"><Plus /></el-icon>
          <span class="item-label">{{ t('project.addFolder') }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workspace-selector {
  position: relative;
}

.enter-project-btn,
.selected-project-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--composer-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.enter-project-btn:hover,
.selected-project-btn:hover {
  background: var(--btn-ghost-hover);
  border-color: var(--content-text-tertiary);
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
}

.project-dropdown,
.workspace-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 320px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 1000;
  overflow: hidden;
}

.project-dropdown.drop-above,
.workspace-panel.drop-above {
  top: auto;
  bottom: calc(100% + 6px);
}

.dropdown-group-title {
  padding: 4px var(--spacing-md) 2px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--content-text-tertiary);
}

.ws-folder-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--content-text-tertiary);
}

.dropdown-search {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--sidebar-border);
}

.search-icon {
  color: var(--content-text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
}

.search-input::placeholder {
  color: var(--content-text-tertiary);
}

.dropdown-list {
  max-height: 200px;
  overflow-y: auto;
  padding: var(--spacing-xs);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 8px var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.dropdown-item:hover {
  background: var(--btn-ghost-hover);
}

.dropdown-item.selected {
  font-weight: 500;
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-path {
  font-size: 11px;
  color: var(--content-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
}

.check {
  flex-shrink: 0;
  color: var(--content-text);
  font-size: 14px;
}

.dropdown-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: var(--spacing-xs) 0;
}

.workspace-projects {
  max-height: 120px;
}

.ws-project-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 5px var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--content-text-secondary);
}

.ws-project-item .folder-path {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--content-text);
}

.ws-project-item .folder-full-path {
  flex: 1;
  font-size: 11px;
  color: var(--content-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--sidebar-border);
}

.panel-back {
  border: none;
  background: transparent;
  color: var(--content-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  flex-shrink: 0;
}

.panel-back:hover {
  color: var(--content-text);
}

.panel-save {
  border: none;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.workspace-name-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
}

.workspace-name-input::placeholder {
  color: var(--content-text-tertiary);
}

.workspace-folders {
  padding: var(--spacing-xs) var(--spacing-sm);
}

.workspace-folder-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 5px var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--content-text);
  border-radius: var(--radius-md);
}

.workspace-folder-item:hover .folder-remove {
  opacity: 1;
}

.folder-remove {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--content-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 2px;
  border-radius: var(--radius-sm);
}

.folder-remove:hover {
  color: var(--content-text);
  background: var(--btn-ghost-hover);
}

.folder-path {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.drop-above.fade-enter-from,
.drop-above.fade-leave-to {
  transform: translateY(-4px);
}
</style>
