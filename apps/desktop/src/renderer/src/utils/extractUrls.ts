import { toLocalFileUrl } from './localFile'

const HTTP_URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
const HTML_PATH_REGEX = /(?:file:\/\/\/|(?:[a-zA-Z]:)?[./~]?[\w@%+=:,./\\-]*[\w@%+=:,/\\-])\.html?(?:[?#][^\s<>"{}|\\^`[\]]*)?/gi

const TRAILING_PUNCT = /[)\]},.;!?]+$/

export function extractHttpUrls(text: string): string[] {
  if (!text) return []
  const matches = text.match(HTTP_URL_REGEX) ?? []
  const seen = new Set<string>()
  const result: string[] = []
  for (let raw of matches) {
    raw = raw.replace(TRAILING_PUNCT, '')
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    result.push(raw)
  }
  return result
}

export interface BrowserUrlExtractionOptions {
  htmlBaseDirs?: string[]
}

function trimPath(raw: string): string {
  return raw.replace(TRAILING_PUNCT, '')
}

function stripQueryAndHash(path: string): string {
  return path.split(/[?#]/, 1)[0]
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

function normalizePath(path: string): string {
  const normalized = normalizeSlashes(path)
  const prefix = normalized.startsWith('/') ? '/' : ''
  const parts: string[] = []
  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop()
      } else if (!prefix) {
        parts.push(part)
      }
      continue
    }
    parts.push(part)
  }
  return `${prefix}${parts.join('/')}`
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

function isPathInside(path: string, baseDir: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedBase = normalizePath(baseDir).replace(/\/+$/, '')
  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)
}

function joinPath(baseDir: string, relativePath: string): string {
  return normalizePath(`${baseDir.replace(/[/\\]+$/, '')}/${relativePath}`)
}

function decodeFileUrl(raw: string): string | null {
  try {
    return decodeURIComponent(new URL(raw).pathname)
  } catch {
    return null
  }
}

function resolveHtmlPaths(raw: string, baseDirs: string[]): string[] {
  const withoutQuery = stripQueryAndHash(trimPath(raw))
  if (!withoutQuery || /^https?:\/\//i.test(withoutQuery)) return []

  const fileUrlPath = withoutQuery.startsWith('file:///') ? decodeFileUrl(withoutQuery) : null
  const candidate = fileUrlPath ?? withoutQuery
  if (!candidate || candidate.startsWith('~')) return []

  if (isAbsolutePath(candidate)) {
    const normalized = normalizePath(candidate)
    return baseDirs.some((baseDir) => isPathInside(normalized, baseDir)) ? [normalized] : []
  }

  const paths: string[] = []
  const seen = new Set<string>()
  for (const baseDir of baseDirs) {
    const resolved = joinPath(baseDir, candidate)
    if (!isPathInside(resolved, baseDir)) continue
    if (seen.has(resolved)) continue
    seen.add(resolved)
    paths.push(resolved)
  }
  return paths
}

export function extractLocalHtmlUrls(text: string, baseDirs: string[]): string[] {
  if (!text || baseDirs.length === 0) return []
  const matches = text.match(HTML_PATH_REGEX) ?? []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of matches) {
    for (const path of resolveHtmlPaths(raw, baseDirs)) {
      const url = toLocalFileUrl(path)
      if (seen.has(url)) continue
      seen.add(url)
      result.push(url)
    }
  }
  return result
}

export function extractHttpUrlsFromTexts(texts: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const text of texts) {
    for (const url of extractHttpUrls(text)) {
      if (seen.has(url)) continue
      seen.add(url)
      result.push(url)
    }
  }
  return result
}

export function normalizeBrowserUrl(
  raw: string,
  options: BrowserUrlExtractionOptions = {}
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^local-file:\/\//i.test(trimmed)) return trimmed

  const htmlBaseDirs = Array.from(new Set(options.htmlBaseDirs?.filter(Boolean) ?? []))
  if (/^file:\/\//i.test(trimmed) || /\.html?(?:[?#]|$)/i.test(trimmed)) {
    return extractLocalHtmlUrls(trimmed, htmlBaseDirs)[0] ?? null
  }

  return `https://${trimmed}`
}

export function extractBrowserUrlsFromTexts(
  texts: string[],
  options: BrowserUrlExtractionOptions = {}
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const htmlBaseDirs = Array.from(new Set(options.htmlBaseDirs?.filter(Boolean) ?? []))
  for (const text of texts) {
    for (const url of [
      ...extractHttpUrls(text),
      ...extractLocalHtmlUrls(text, htmlBaseDirs)
    ]) {
      if (seen.has(url)) continue
      seen.add(url)
      result.push(url)
    }
  }
  return result
}
