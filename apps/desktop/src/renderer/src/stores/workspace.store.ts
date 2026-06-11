import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, Workspace } from '@renderer/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const projects = ref<Project[]>([])
  const workspaces = ref<Workspace[]>([])
  const selectedProjectId = ref<string | null>(null)

  const currentProject = computed(() =>
    projects.value.find((p) => p.id === selectedProjectId.value) ?? null
  )

  const currentWorkspace = computed(() =>
    workspaces.value.find((w) => w.id === selectedProjectId.value) ?? null
  )

  const currentCwd = computed<string | undefined>(() => {
    if (currentProject.value) return currentProject.value.path
    if (currentWorkspace.value && currentWorkspace.value.folders.length > 0) {
      return currentWorkspace.value.folders[0]
    }
    return undefined
  })

  const workspaceProjects = computed<Project[]>(() => {
    if (!currentWorkspace.value) return []
    return projects.value.filter((p) =>
      currentWorkspace.value!.folders.includes(p.path)
    )
  })

  async function loadProjects(): Promise<void> {
    const list = await window.agentAPI.projects.list()
    projects.value = list.map((p) => ({ id: p.id, name: p.name, path: p.path }))
  }

  function selectProject(id: string | null): void {
    selectedProjectId.value = id
  }

  async function addProject(): Promise<Project | null> {
    const path = await window.agentAPI.dialog.selectFolder()
    if (!path) return null
    const existing = projects.value.find((p) => p.path === path)
    if (existing) return existing
    const name = path.split('/').pop() || path
    const project: Project = {
      id: `proj-${Date.now()}`,
      name,
      path
    }
    projects.value.push(project)
    await window.agentAPI.projects.save(project)
    return project
  }

  async function removeProject(id: string): Promise<void> {
    projects.value = projects.value.filter((p) => p.id !== id)
    if (selectedProjectId.value === id) {
      selectedProjectId.value = null
    }
    await window.agentAPI.projects.delete(id)
  }

  function createWorkspace(name: string, folders: string[]): void {
    workspaces.value.push({
      id: `ws-${Date.now()}`,
      name,
      folders
    })
  }

  function removeWorkspace(id: string): void {
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (selectedProjectId.value === id) {
      selectedProjectId.value = null
    }
  }

  return {
    projects,
    workspaces,
    selectedProjectId,
    currentProject,
    currentWorkspace,
    currentCwd,
    workspaceProjects,
    loadProjects,
    selectProject,
    addProject,
    removeProject,
    createWorkspace,
    removeWorkspace
  }
})
