import type { FilePreviewSettings } from '@renderer/types'
import {
  DEFAULT_FILE_PREVIEW,
  DEFAULT_IMAGE_EXTENSIONS,
  DEFAULT_TEXT_EXTENSIONS
} from '@renderer/constants/defaults'

export type FileKind = 'text' | 'image' | 'unsupported'

function getExtension(path: string): string {
  const base = path.split('/').pop() ?? path
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function resolveFileKind(
  path: string,
  settings?: FilePreviewSettings,
  forceText = false
): FileKind {
  if (forceText) return 'text'

  const ext = getExtension(path)
  if (!ext) return 'text'

  const textExts = settings?.textExtensions ?? DEFAULT_TEXT_EXTENSIONS
  const imageExts = settings?.imageExtensions ?? DEFAULT_IMAGE_EXTENSIONS

  if (imageExts.includes(ext)) return 'image'
  if (textExts.includes(ext)) return 'text'
  return 'unsupported'
}

export function getFileExtension(path: string): string {
  return getExtension(path)
}

export { DEFAULT_FILE_PREVIEW, DEFAULT_TEXT_EXTENSIONS, DEFAULT_IMAGE_EXTENSIONS }
