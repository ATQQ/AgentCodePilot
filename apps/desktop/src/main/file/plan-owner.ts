import * as repo from '../database/repositories'

export interface PlanOwnerScope {
  ownerType: 'conversation' | 'project' | 'workspace'
  ownerId: string
}

export function resolvePlanOwnerForProjectId(
  projectId: string,
  fallbackConversationId?: string
): PlanOwnerScope {
  if (repo.getProjectById(projectId)) {
    return { ownerType: 'project', ownerId: projectId }
  }
  if (repo.getWorkspaceById(projectId)) {
    return { ownerType: 'workspace', ownerId: projectId }
  }
  return {
    ownerType: 'conversation',
    ownerId: fallbackConversationId ?? projectId
  }
}

export function resolvePlanOwnerForConversation(
  conv: repo.ConversationRow | undefined
): PlanOwnerScope {
  if (!conv?.project_id) {
    return { ownerType: 'conversation', ownerId: conv?.id ?? '' }
  }
  return resolvePlanOwnerForProjectId(conv.project_id, conv.id)
}
