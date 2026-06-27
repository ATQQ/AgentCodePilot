import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, Workspace } from '@renderer/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const projects = ref<Project[]>([])
  const workspaces = ref<Workspace[]>([])
  const selectedProjectId = ref<string | null>(null)

  const currentProject = computed(
    () => projects.value.find((p) => p.id === selectedProjectId.value) ?? null
  )

  const currentWorkspace = computed(
    () => workspaces.value.find((w) => w.id === selectedProjectId.value) ?? null
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
    return projects.value.filter((p) => currentWorkspace.value!.folders.includes(p.path))
  })

  const allWorkspaceFolders = computed<Set<string>>(() => {
    const folders = new Set<string>()
    for (const ws of workspaces.value) {
      for (const f of ws.folders) {
        folders.add(f)
      }
    }
    return folders
  })

  const standaloneProjects = computed<Project[]>(() => {
    return projects.value.filter((p) => !allWorkspaceFolders.value.has(p.path))
  })

  function getProjectsForWorkspace(wsId: string): Project[] {
    const ws = workspaces.value.find((w) => w.id === wsId)
    if (!ws) return []
    return projects.value.filter((p) => ws.folders.includes(p.path))
  }

  async function loadProjects(): Promise<void> {
    const list = await window.agentAPI.projects.list()
    projects.value = list.map((p) => ({ id: p.id, name: p.name, path: p.path }))
    const wsList = await window.agentAPI.workspaces.list()
    workspaces.value = wsList.map((w) => ({ id: w.id, name: w.name, folders: w.folders }))
  }

  function selectProject(id: string | null): void {
    selectedProjectId.value = id
  }

  async function ensureProjectForPath(path: string): Promise<Project> {
    const existing = projects.value.find((p) => p.path === path)
    if (existing) return existing

    const restored = await window.agentAPI.projects.restoreByPath(path)
    if (restored) {
      const project = { id: restored.id, name: restored.name, path: restored.path }
      projects.value.push(project)
      return project
    }

    const name = path.split('/').pop() || path
    const project: Project = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      path
    }
    projects.value.push(project)
    await window.agentAPI.projects.save(project)
    return project
  }

  async function addProject(): Promise<Project | null> {
    const path = await window.agentAPI.dialog.selectFolder()
    if (!path) return null
    return ensureProjectForPath(path)
  }

  async function removeProject(id: string): Promise<void> {
    projects.value = projects.value.filter((p) => p.id !== id)
    if (selectedProjectId.value === id) {
      selectedProjectId.value = null
    }
    await window.agentAPI.projects.delete(id)
  }

  async function createWorkspace(name: string, folders: string[]): Promise<string> {
    const ws = { id: `ws-${Date.now()}`, name, folders }
    workspaces.value.push(ws)
    await window.agentAPI.workspaces.save(ws)
    return ws.id
  }

  async function removeWorkspace(id: string): Promise<void> {
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (selectedProjectId.value === id) {
      selectedProjectId.value = null
    }
    await window.agentAPI.workspaces.delete(id)
  }

  async function renameProject(id: string, newName: string): Promise<void> {
    const project = projects.value.find((p) => p.id === id)
    if (!project) return
    project.name = newName
    await window.agentAPI.projects.save({ id: project.id, name: project.name, path: project.path })
  }

  async function renameWorkspace(id: string, newName: string): Promise<void> {
    const ws = workspaces.value.find((w) => w.id === id)
    if (!ws) return
    ws.name = newName
    await window.agentAPI.workspaces.save({ id: ws.id, name: ws.name, folders: ws.folders })
  }

  return {
    projects,
    workspaces,
    selectedProjectId,
    currentProject,
    currentWorkspace,
    currentCwd,
    workspaceProjects,
    standaloneProjects,
    allWorkspaceFolders,
    loadProjects,
    selectProject,
    addProject,
    ensureProjectForPath,
    removeProject,
    createWorkspace,
    removeWorkspace,
    renameProject,
    renameWorkspace,
    getProjectsForWorkspace
  }
})
