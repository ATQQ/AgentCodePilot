import { existsSync } from 'fs'
import { dirname } from 'path'
import type { AttachmentPayload } from '../../preload/types'

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
