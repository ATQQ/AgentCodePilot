import { existsSync } from 'fs'
import { dirname } from 'path'
import type { AttachmentPayload, PlanReference } from '../../preload/types'
import * as repo from '../database/repositories'
import { readPlanFile } from './plans'

export function formatAttachmentBlock(att: AttachmentPayload): string {
  if (att.type === 'url') {
    return `[参考链接: ${att.url}]`
  }
  if (att.type === 'image') {
    return `[图片附件: ${att.path}]`
  }
  return `[其它附件: ${att.path}]`
}

export function buildPromptWithAttachments(
  content: string,
  attachments?: AttachmentPayload[]
): string {
  if (!attachments || attachments.length === 0) return content
  const blocks = attachments.map(formatAttachmentBlock).join('\n')
  if (!content.trim()) return blocks
  return `${blocks}\n\n${content}`
}

export function formatMessageContentWithAttachments(
  content: string,
  attachmentsJson: string | null | undefined
): string {
  if (!attachmentsJson) return content
  try {
    const attachments = JSON.parse(attachmentsJson) as AttachmentPayload[]
    return buildPromptWithAttachments(content, attachments)
  } catch {
    return content
  }
}

export function buildPromptWithPlanRefs(content: string, planRefs?: PlanReference[]): string {
  if (!planRefs?.length) return content

  const blocks = planRefs.map((ref) => {
    const plan = repo.getPlanById(ref.id)
    if (!plan) {
      return `[Referenced Execution Plan: ${ref.title}]\n(Plan not found)`
    }
    const planContent = readPlanFile(plan.file_path)
    return `[Referenced Execution Plan: ${ref.title}]\n${planContent}`
  })

  return `${blocks.join('\n\n')}\n\n[User Request]\n${content}`
}

export function buildPromptWithAttachmentsAndPlans(
  content: string,
  attachments?: AttachmentPayload[],
  planRefs?: PlanReference[]
): string {
  return buildPromptWithPlanRefs(buildPromptWithAttachments(content, attachments), planRefs)
}

export function collectAttachmentDirectories(attachments?: AttachmentPayload[]): string[] {
  if (!attachments?.length) return []
  const dirs = new Set<string>()
  for (const att of attachments) {
    if (att.type === 'url') continue
    if (existsSync(att.path)) {
      dirs.add(dirname(att.path))
    }
  }
  return [...dirs]
}
