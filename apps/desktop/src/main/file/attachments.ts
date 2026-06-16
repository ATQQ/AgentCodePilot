import { app } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import type { AttachmentPayload } from '../../preload/types'

const ATTACHMENTS_DIR = 'attachments'

export function getAttachmentsRoot(): string {
  const dir = join(app.getPath('userData'), ATTACHMENTS_DIR)
  mkdirSync(dir, { recursive: true })
  return dir
}

function isPersistedAttachmentPath(filePath: string): boolean {
  const root = getAttachmentsRoot()
  return filePath === root || filePath.startsWith(`${root}/`) || filePath.startsWith(`${root}\\`)
}

export function persistAttachments(
  conversationId: string,
  messageId: string,
  attachments?: AttachmentPayload[]
): AttachmentPayload[] | undefined {
  if (!attachments || attachments.length === 0) return undefined

  const destDir = join(getAttachmentsRoot(), conversationId, messageId)
  mkdirSync(destDir, { recursive: true })

  return attachments.map((att) => {
    if (att.type === 'url') return att
    if (isPersistedAttachmentPath(att.path) && existsSync(att.path)) return att
    if (!existsSync(att.path)) return att

    const ext = extname(att.name) || extname(att.path)
    const destPath = join(destDir, `${att.id}${ext}`)
    copyFileSync(att.path, destPath)
    return { ...att, path: destPath }
  })
}
