import { existsSync, statSync } from 'fs'
import { readdir, readFile, writeFile, unlink, copyFile, mkdir } from 'fs/promises'
import { join, resolve, relative, basename, extname } from 'path'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])

export interface FileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size?: number
}

function normalizeRoots(roots: string[]): string[] {
  return roots.map((r) => resolve(r))
}

export function assertInsideWorkspace(targetPath: string, roots: string[]): string {
  const resolved = resolve(targetPath)
  const normalized = normalizeRoots(roots)
  const allowed = normalized.some((root) => {
    const rel = relative(root, resolved)
    return rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))
  })
  if (!allowed) {
    throw new Error('路径不在工作区范围内')
  }
  return resolved
}

export async function listDirectory(dirPath: string, roots: string[]): Promise<FileEntry[]> {
  const resolved = assertInsideWorkspace(dirPath, roots)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return []
  }

  const entries = await readdir(resolved, { withFileTypes: true })
  const root = roots[0] ? resolve(roots[0]) : resolved

  return entries
    .filter((e) => !IGNORED_DIRS.has(e.name))
    .map((e) => {
      const fullPath = join(resolved, e.name)
      const stat = existsSync(fullPath) ? statSync(fullPath) : null
      return {
        name: e.name,
        path: fullPath,
        relativePath: relative(root, fullPath) || e.name,
        isDirectory: e.isDirectory(),
        size: stat && !e.isDirectory() ? stat.size : undefined
      }
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export async function readWorkspaceFile(filePath: string, roots: string[]): Promise<string> {
  const resolved = assertInsideWorkspace(filePath, roots)
  if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
    throw new Error('文件不存在')
  }
  return readFile(resolved, 'utf-8')
}

export async function writeWorkspaceFile(
  filePath: string,
  content: string,
  roots: string[]
): Promise<void> {
  const resolved = assertInsideWorkspace(filePath, roots)
  await writeFile(resolved, content, 'utf-8')
}

export async function deleteWorkspaceFile(filePath: string, roots: string[]): Promise<void> {
  const resolved = assertInsideWorkspace(filePath, roots)
  await unlink(resolved)
}

export async function copyWorkspaceFile(
  srcPath: string,
  destPath: string,
  roots: string[]
): Promise<void> {
  const src = assertInsideWorkspace(srcPath, roots)
  const dest = assertInsideWorkspace(destPath, roots)
  const destDir = resolve(dest, '..')
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true })
  }
  await copyFile(src, dest)
}

export function getFileKind(filePath: string): 'text' | 'image' | 'markdown' | 'unknown' {
  const ext = extname(filePath).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) {
    return 'image'
  }
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (
    [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.vue',
      '.json',
      '.css',
      '.scss',
      '.html',
      '.yaml',
      '.yml',
      '.xml',
      '.sh',
      '.py',
      '.go',
      '.rs',
      '.txt'
    ].includes(ext)
  ) {
    return 'text'
  }
  return 'unknown'
}

export function getFileName(filePath: string): string {
  return basename(filePath)
}
