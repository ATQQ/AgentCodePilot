import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, Workspace } from '@renderer/types'
import { mockProjects, mockWorkspaces } from '@renderer/mock/data'

export const useWorkspaceStore = defineStore('workspace', () => {
  const projects = ref<Project[]>(mockProjects)
  const workspaces = ref<Workspace[]>(mockWorkspaces)
  const selectedProjectId = ref<string | null>(null)

  const currentProject = computed(() =>
    projects.value.find((p) => p.id === selectedProjectId.value) ?? null
  )

  function selectProject(id: string | null): void {
    selectedProjectId.value = id
  }

  function createWorkspace(name: string, folders: string[]): void {
    workspaces.value.push({
      id: `ws-${Date.now()}`,
      name,
      folders
    })
  }

  return { projects, workspaces, selectedProjectId, currentProject, selectProject, createWorkspace }
})
