import * as repo from '../database/repositories'
import {
  copyPlanFile,
  extractPlanTitle,
  generatePlanId,
  getScopedPlanFilePath,
  writePlanFile
} from './plans'
import { resolvePlanOwnerForConversation } from './plan-owner'
import { getLatestPlanForConversation, userRequestsNewPlan } from './plan-prompt'

function writePlanToAllScopes(
  filePath: string,
  content: string,
  ownerType: string,
  ownerId: string,
  planId: string
): void {
  writePlanFile(filePath, content)
  if (ownerType !== 'conversation') {
    const scopePath = getScopedPlanFilePath(
      ownerType as 'project' | 'workspace',
      ownerId,
      planId
    )
    writePlanFile(scopePath, content)
  }
}

export function savePlanFromAssistantMessage(
  conversationId: string,
  assistantMessageId: string,
  content: string
): repo.PlanRow | null {
  if (!content.trim()) return null
  if (repo.getPlanByAssistantMessageId(assistantMessageId)) return null

  const messages = repo.getMessagesByConversation(conversationId)
  const idx = messages.findIndex((m) => m.id === assistantMessageId)
  if (idx <= 0) return null

  const prev = messages[idx - 1]
  if (prev.role !== 'user' || prev.plan_mode !== 1) return null

  const conv = repo.getConversationById(conversationId)
  const owner = resolvePlanOwnerForConversation(conv)
  const title = extractPlanTitle(content)
  const latestPlan = getLatestPlanForConversation(conversationId)

  if (latestPlan && !userRequestsNewPlan(prev.content)) {
    writePlanToAllScopes(
      latestPlan.file_path,
      content,
      latestPlan.owner_type,
      latestPlan.owner_id,
      latestPlan.id
    )
    repo.updatePlan(latestPlan.id, {
      assistantMessageId,
      userMessageId: prev.id,
      title
    })
    return repo.getPlanById(latestPlan.id) ?? null
  }

  const planId = generatePlanId()
  const createdAt = new Date().toISOString()
  const filePath = getScopedPlanFilePath('conversation', conversationId, planId)

  writePlanFile(filePath, content)

  if (owner.ownerType !== 'conversation') {
    const scopePath = getScopedPlanFilePath(owner.ownerType, owner.ownerId, planId)
    copyPlanFile(filePath, scopePath)
  }

  repo.createPlan({
    id: planId,
    conversationId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    userMessageId: prev.id,
    assistantMessageId,
    title,
    filePath,
    createdAt
  })

  return repo.getPlanById(planId) ?? null
}
