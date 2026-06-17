import * as repo from '../database/repositories'
import {
  copyPlanFile,
  extractPlanTitle,
  generatePlanId,
  getScopedPlanFilePath,
  writePlanFile
} from './plans'
import { resolvePlanOwnerForConversation } from './plan-owner'

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
  const planId = generatePlanId()
  const createdAt = new Date().toISOString()
  const title = extractPlanTitle(content)
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
