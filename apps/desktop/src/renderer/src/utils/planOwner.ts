import type { PlanOwnerType } from '../../../preload/types'
import type { useWorkspaceStore } from '@renderer/stores/workspace.store'

export function resolvePlanOwnerFromProjectId(
  projectId: string,
  workspaceStore: ReturnType<typeof useWorkspaceStore>
): { ownerType: PlanOwnerType; ownerId: string } {
  if (workspaceStore.workspaces.some((w) => w.id === projectId)) {
    return { ownerType: 'workspace', ownerId: projectId }
  }
  if (workspaceStore.projects.some((p) => p.id === projectId)) {
    return { ownerType: 'project', ownerId: projectId }
  }
  return { ownerType: 'conversation', ownerId: projectId }
}

export function ownerScopeLabelKey(ownerType: PlanOwnerType): string {
  switch (ownerType) {
    case 'workspace':
      return 'plans.scopeWorkspace'
    case 'project':
      return 'plans.scopeProject'
    default:
      return 'plans.scopeConversation'
  }
}
