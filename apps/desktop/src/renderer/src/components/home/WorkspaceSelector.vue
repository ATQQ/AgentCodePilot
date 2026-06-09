<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpened, Search, Plus, Close, Folder } from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { mockFolders } from '@renderer/mock/data'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const showDropdown = ref(false)
const showAddSubmenu = ref(false)
const showWorkspacePanel = ref(false)
const searchQuery = ref('')
const folderFilter = ref('')
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

const filteredFolders = computed(() => {
  const folders = mockFolders.map((f) => f.path)
  if (!folderFilter.value) return folders
  const q = folderFilter.value.toLowerCase()
  return folders.filter((f) => f.toLowerCase().includes(q))
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
  showAddSubmenu.value = false
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

function openWorkspaceSetup(): void {
  showDropdown.value = false
  showWorkspacePanel.value = true
  folderFilter.value = ''
  workspaceName.value = ''
  workspaceFolders.value = []
}

function addFolderToWorkspace(folder: string): void {
  if (!workspaceFolders.value.includes(folder)) {
    workspaceFolders.value.push(folder)
  }
}

function removeFolderFromWorkspace(folder: string): void {
  workspaceFolders.value = workspaceFolders.value.filter((f) => f !== folder)
}

function saveWorkspace(): void {
  if (workspaceName.value.trim() && workspaceFolders.value.length) {
    workspaceStore.createWorkspace(workspaceName.value.trim(), [...workspaceFolders.value])
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

        <div class="dropdown-list">
          <button
            v-for="proj in filteredProjects"
            :key="proj.id"
            class="dropdown-item"
            :class="{ selected: workspaceStore.selectedProjectId === proj.id }"
            @click="selectProject(proj.id)"
          >
            <el-icon :size="14"><FolderOpened /></el-icon>
            <span class="item-label">{{ proj.name }}</span>
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
            <span class="ws-folder-count">{{ ws.folders.length }} 个文件夹</span>
          </button>
        </div>

        <div class="dropdown-divider"></div>

        <div class="dropdown-actions" @mouseenter="showAddSubmenu = true" @mouseleave="showAddSubmenu = false">
          <button class="dropdown-item">
            <el-icon :size="14"><Plus /></el-icon>
            <span class="item-label">{{ t('project.addNewProject') }}</span>
            <span class="arrow">&#8250;</span>
          </button>

          <Transition name="fade">
            <div v-if="showAddSubmenu" class="submenu">
              <button class="dropdown-item">
                <el-icon :size="14"><Plus /></el-icon>
                <span class="item-label">{{ t('project.createBlank') }}</span>
              </button>
              <button class="dropdown-item">
                <el-icon :size="14"><FolderOpened /></el-icon>
                <span class="item-label">{{ t('project.useExistingFolder') }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <button class="dropdown-item" @click="openWorkspaceSetup">
          <el-icon :size="14"><Folder /></el-icon>
          <span class="item-label">{{ t('project.setupWorkspace') }}</span>
        </button>

        <div class="dropdown-divider"></div>

        <button class="dropdown-item" @click="selectProject(null)">
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

        <div class="folder-filter">
          <input
            v-model="folderFilter"
            type="text"
            :placeholder="t('project.filterFolders')"
            class="filter-input"
          />
        </div>

        <div class="folder-list">
          <button
            v-for="folder in filteredFolders"
            :key="folder"
            class="dropdown-item"
            :class="{ selected: workspaceFolders.includes(folder) }"
            @click="addFolderToWorkspace(folder)"
          >
            <el-icon :size="14"><Folder /></el-icon>
            <span class="item-label folder-path">{{ folder }}</span>
            <span v-if="workspaceFolders.includes(folder)" class="check">&#x2713;</span>
          </button>
        </div>

        <div class="dropdown-divider"></div>
        <button class="dropdown-item">
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
  min-width: 300px;
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

.item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check {
  flex-shrink: 0;
  color: var(--content-text);
  font-size: 14px;
}

.arrow {
  flex-shrink: 0;
  color: var(--content-text-tertiary);
  font-size: 16px;
}

.dropdown-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: var(--spacing-xs) 0;
}

.dropdown-actions {
  position: relative;
  padding: 0 var(--spacing-xs);
}

.submenu {
  position: absolute;
  left: calc(100% + 4px);
  top: 0;
  min-width: 180px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs);
  z-index: 1001;
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
  border-bottom: 1px solid var(--sidebar-border);
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

.folder-filter {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--sidebar-border);
}

.filter-input {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--content-text);
  font-size: var(--font-size-sm);
  outline: none;
}

.filter-input::placeholder {
  color: var(--content-text-tertiary);
}

.folder-list {
  max-height: 240px;
  overflow-y: auto;
  padding: var(--spacing-xs);
}

.folder-path {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-size: var(--font-size-xs);
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
