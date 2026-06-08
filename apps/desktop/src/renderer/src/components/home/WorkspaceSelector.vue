<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpened, Search, Plus, Close } from '@element-plus/icons-vue'

const { t } = useI18n()

const showDropdown = ref(false)
const showAddSubmenu = ref(false)
const searchQuery = ref('')
const selectedProject = ref<string | null>(null)

const mockProjects = [
  { id: 'easypicker2-client', name: 'easypicker2-client' },
  { id: 'claude-code-best-practice', name: 'claude-code-best-practice' },
  { id: 'demo-shared-lib', name: 'demo-shared-lib' },
  { id: 'demo-checker', name: 'demo-checker' }
]

const filteredProjects = computed(() => {
  if (!searchQuery.value) return mockProjects
  const q = searchQuery.value.toLowerCase()
  return mockProjects.filter(p => p.name.toLowerCase().includes(q))
})

function selectProject(id: string | null): void {
  selectedProject.value = id
  showDropdown.value = false
  searchQuery.value = ''
}

function toggleDropdown(): void {
  showDropdown.value = !showDropdown.value
  showAddSubmenu.value = false
  searchQuery.value = ''
}
</script>

<template>
  <div class="workspace-selector">
    <!-- Selected state -->
    <div v-if="selectedProject" class="selected-bar">
      <button class="selected-project" @click="toggleDropdown">
        <el-icon :size="14"><FolderOpened /></el-icon>
        <span>{{ selectedProject }}</span>
        <span class="chevron">&#x25BE;</span>
      </button>
      <span class="separator">|</span>
      <button class="context-btn">
        <span>{{ t('project.localMode') }}</span>
        <span class="chevron">&#x25BE;</span>
      </button>
    </div>

    <!-- Unselected state -->
    <button v-else class="enter-project-btn" @click="toggleDropdown">
      <el-icon :size="14"><FolderOpened /></el-icon>
      <span>{{ t('project.enterProject') }}</span>
      <span class="chevron">&#x25BE;</span>
    </button>

    <!-- Dropdown -->
    <Transition name="fade">
      <div v-if="showDropdown" class="project-dropdown">
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
            :class="{ selected: selectedProject === proj.id }"
            @click="selectProject(proj.id)"
          >
            <el-icon :size="14"><FolderOpened /></el-icon>
            <span>{{ proj.name }}</span>
            <span v-if="selectedProject === proj.id" class="check">&#x2713;</span>
          </button>
        </div>

        <div class="dropdown-divider"></div>

        <div class="dropdown-actions" @mouseenter="showAddSubmenu = true" @mouseleave="showAddSubmenu = false">
          <button class="dropdown-item">
            <el-icon :size="14"><Plus /></el-icon>
            <span>{{ t('project.addNewProject') }}</span>
            <span class="arrow">&#8250;</span>
          </button>

          <!-- Add submenu -->
          <Transition name="fade">
            <div v-if="showAddSubmenu" class="submenu">
              <button class="dropdown-item">
                <el-icon :size="14"><Plus /></el-icon>
                <span>{{ t('project.createBlank') }}</span>
              </button>
              <button class="dropdown-item">
                <el-icon :size="14"><FolderOpened /></el-icon>
                <span>{{ t('project.useExistingFolder') }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <button class="dropdown-item" @click="selectProject(null)">
          <el-icon :size="14"><Close /></el-icon>
          <span>{{ t('project.noProject') }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workspace-selector {
  position: relative;
}

.enter-project-btn {
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

.enter-project-btn:hover {
  background: var(--btn-ghost-hover);
  border-color: var(--content-text-tertiary);
}

.selected-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px var(--spacing-sm);
  border: 1px solid var(--composer-border);
  border-radius: var(--radius-lg);
  background: var(--btn-ghost-hover);
}

.selected-project,
.context-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.selected-project:hover,
.context-btn:hover {
  background: var(--sidebar-item-hover);
}

.separator {
  color: var(--sidebar-border);
  font-size: 14px;
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
}

/* Dropdown */
.project-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 1000;
  overflow: hidden;
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

.dropdown-item .check {
  margin-left: auto;
  color: var(--content-text);
}

.dropdown-item .arrow {
  margin-left: auto;
  color: var(--content-text-tertiary);
  font-size: 14px;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
