import type { Attachment, FileAttachment } from '@renderer/types'
import type { AttachmentPayload } from '../../../preload/types'

export function toLocalFileUrl(filePath: string): string {
  return `local-file://local/${encodeURIComponent(filePath)}`
}

export function attachmentFromPayload(payload: AttachmentPayload): Attachment {
  if (payload.type === 'url') return payload
  const file: FileAttachment = {
    id: payload.id,
    type: payload.type,
    name: payload.name,
    path: payload.path
  }
  if (payload.type === 'image') {
    file.previewUrl = toLocalFileUrl(payload.path)
  }
  return file
}

export function enrichAttachment(att: Attachment): Attachment {
  if (att.type === 'url') return att
  if (att.type === 'image') {
    return {
      ...att,
      previewUrl: att.previewUrl?.startsWith('blob:') ? att.previewUrl : toLocalFileUrl(att.path)
    }
  }
  return att
}

export function getAttachmentPreviewUrl(att: Attachment): string | undefined {
  if (att.type !== 'image') return undefined
  if (att.previewUrl?.startsWith('blob:')) return att.previewUrl
  return toLocalFileUrl(att.path)
}
