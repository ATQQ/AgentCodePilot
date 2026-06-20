import type { FileReference } from '@renderer/types'

export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

export function resolveAbsoluteFilePath(path: string, cwd?: string | null): string {
  if (isAbsolutePath(path)) return path
  if (!cwd) return path
  const base = cwd.replace(/[/\\]+$/, '')
  const relative = path.replace(/^[/\\]+/, '')
  return `${base}/${relative}`
}

export function getFileBaseName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path
}

export function formatFileReferenceLabel(
  ref: Pick<FileReference, 'name' | 'startLine' | 'endLine'>
): string {
  if (ref.startLine !== undefined) {
    if (ref.endLine !== undefined && ref.endLine !== ref.startLine) {
      return `${ref.name} (${ref.startLine}-${ref.endLine})`
    }
    return `${ref.name} (${ref.startLine})`
  }
  return ref.name
}

export function serializeFileReference(
  ref: Pick<FileReference, 'path' | 'startLine' | 'endLine'>
): string {
  const { path, startLine, endLine } = ref
  if (startLine !== undefined) {
    if (endLine !== undefined && endLine !== startLine) {
      return `@${path}:${startLine}-${endLine}`
    }
    return `@${path}:${startLine}`
  }
  return `@${path}`
}

export function fileRefFromElement(
  el: HTMLElement
): Pick<FileReference, 'path' | 'name' | 'startLine' | 'endLine'> {
  const path = el.dataset.path ?? ''
  const startLine = el.dataset.startLine ? Number(el.dataset.startLine) : undefined
  const endLine = el.dataset.endLine ? Number(el.dataset.endLine) : undefined
  return {
    path,
    name: getFileBaseName(path),
    startLine,
    endLine
  }
}

export function formatFileReferenceTooltip(
  ref: Pick<FileReference, 'path' | 'startLine' | 'endLine'>
): string {
  if (ref.startLine !== undefined) {
    if (ref.endLine !== undefined && ref.endLine !== ref.startLine) {
      return `${ref.path}\n行 ${ref.startLine}-${ref.endLine}`
    }
    return `${ref.path}\n行 ${ref.startLine}`
  }
  return ref.path
}

export function serializeEditorContent(root: HTMLElement): string {
  const parts: string[] = []

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push((node.textContent ?? '').replace(/\u00A0/g, ' '))
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement

    if (el.classList.contains('inline-file-ref')) {
      parts.push(serializeFileReference(fileRefFromElement(el)))
      return
    }

    if (el.tagName === 'BR') {
      parts.push('\n')
      return
    }

    if (el.tagName === 'DIV' || el.tagName === 'P') {
      if (parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
        parts.push('\n')
      }
      for (const child of el.childNodes) walk(child)
      return
    }

    for (const child of el.childNodes) walk(child)
  }

  for (const child of root.childNodes) walk(child)
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildMessageWithFileReferences(userText: string, refs: FileReference[]): string {
  const trimmed = userText.trim()
  if (refs.length === 0) return trimmed
  const refLines = refs.map(serializeFileReference).join('\n')
  return trimmed ? `${refLines}\n${trimmed}` : refLines
}

export function createFileReference(
  path: string,
  options?: { startLine?: number; endLine?: number; cwd?: string | null }
): FileReference {
  const absolutePath = resolveAbsoluteFilePath(path, options?.cwd)
  return {
    id: `fref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    path: absolutePath,
    name: getFileBaseName(absolutePath),
    startLine: options?.startLine,
    endLine: options?.endLine
  }
}

export function isSameFileReference(a: FileReference, b: FileReference): boolean {
  return a.path === b.path && a.startLine === b.startLine && a.endLine === b.endLine
}
