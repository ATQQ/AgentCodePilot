export function joinWorkspacePath(parentDir: string, name: string): string {
  const base = parentDir.replace(/[/\\]+$/, '')
  return `${base}/${name}`
}

export function getParentDir(entryPath: string): string {
  return entryPath.replace(/[/\\][^/\\]+$/, '')
}

export function getBaseName(entryPath: string): string {
  const parts = entryPath.split(/[/\\]/)
  return parts[parts.length - 1] ?? entryPath
}

export function isDescendantOrSelf(ancestor: string, path: string): boolean {
  const a = ancestor.replace(/[/\\]+$/, '')
  const p = path.replace(/[/\\]+$/, '')
  if (p === a) return true
  return p.startsWith(`${a}/`) || p.startsWith(`${a}\\`)
}

export function remapPathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  const normalizedOld = oldPrefix.replace(/[/\\]+$/, '')
  const normalizedNew = newPrefix.replace(/[/\\]+$/, '')
  if (path === normalizedOld) return normalizedNew
  if (path.startsWith(`${normalizedOld}/`)) {
    return `${normalizedNew}${path.slice(normalizedOld.length)}`
  }
  if (path.startsWith(`${normalizedOld}\\`)) {
    return `${normalizedNew}${path.slice(normalizedOld.length)}`
  }
  return path
}
