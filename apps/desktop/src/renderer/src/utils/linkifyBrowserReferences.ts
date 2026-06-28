import { resolveBrowserTarget } from './extractUrls'

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
const HTML_PATH_PATTERN =
  /(?:file:\/\/\/|(?:[a-zA-Z]:)?[./~]?[\w@%+=:,./\\-]*[\w@%+=:,/\\-])\.html?(?:[?#][^\s<>"{}|\\^`[\]]*)?/gi
const TRAILING_PUNCT = /[)\]},.;!?]+$/
// HTTP 链接结尾还可能粘连 markdown 强调符（** / __ / ~~）和反引号，需要一并剔除
const HTTP_TRAILING_PUNCT = /[)\]},.;!?*_~`]+$/
const CODE_FENCE_PATTERN = /```[\s\S]*?```/g
const INLINE_CODE_PATTERN = /`+[^`\n]+`+/g
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g

interface TextRange {
  start: number
  end: number
}

interface BrowserRefMatch {
  start: number
  end: number
  text: string
  url: string
}

export type PlainTextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; url: string }

function trimTrailingPunctuation(raw: string): string {
  return raw.replace(TRAILING_PUNCT, '')
}

function trimHttpTrailing(raw: string): string {
  return raw.replace(HTTP_TRAILING_PUNCT, '')
}

function overlaps(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end
}

function isProtected(index: number, length: number, protectedRanges: TextRange[]): boolean {
  const range = { start: index, end: index + length }
  return protectedRanges.some((item) => overlaps(range, item))
}

function findPatternRanges(text: string, pattern: RegExp): TextRange[] {
  const ranges: TextRange[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

function findHttpMatches(text: string): BrowserRefMatch[] {
  const matches: BrowserRefMatch[] = []
  const regex = new RegExp(HTTP_URL_PATTERN.source, HTTP_URL_PATTERN.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0]
    const trimmed = trimHttpTrailing(raw)
    if (!trimmed) continue
    matches.push({
      start: match.index,
      end: match.index + trimmed.length,
      text: trimmed,
      url: trimmed
    })
  }
  return matches
}

function findHtmlMatches(text: string, htmlBaseDirs: string[]): BrowserRefMatch[] {
  if (htmlBaseDirs.length === 0) return []
  const matches: BrowserRefMatch[] = []
  const regex = new RegExp(HTML_PATH_PATTERN.source, HTML_PATH_PATTERN.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0]
    const trimmed = trimTrailingPunctuation(raw)
    if (!trimmed || /^https?:\/\//i.test(trimmed)) continue
    const url = resolveBrowserTarget(trimmed, htmlBaseDirs)
    if (!url) continue
    matches.push({
      start: match.index,
      end: match.index + trimmed.length,
      text: trimmed,
      url
    })
  }
  return matches
}

function mergeMatches(matches: BrowserRefMatch[], protectedRanges: TextRange[]): BrowserRefMatch[] {
  const filtered = matches
    .filter((item) => !isProtected(item.start, item.end - item.start, protectedRanges))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const merged: BrowserRefMatch[] = []
  for (const item of filtered) {
    const last = merged[merged.length - 1]
    if (last && overlaps(last, item)) {
      if (item.end - item.start > last.end - last.start) {
        merged[merged.length - 1] = item
      }
      continue
    }
    merged.push(item)
  }
  return merged
}

function findBrowserRefMatches(
  text: string,
  htmlBaseDirs: string[],
  protectedRanges: TextRange[]
): BrowserRefMatch[] {
  const matches = [...findHttpMatches(text), ...findHtmlMatches(text, htmlBaseDirs)]
  return mergeMatches(matches, protectedRanges)
}

/**
 * 处理行内代码 `...`：若内容是可解析的链接/项目内 HTML 路径，则整段（含反引号）转成可点击链接；
 * 否则视为受保护区，避免普通文本里的代码被误识别。
 */
function findInlineCodeMatches(
  text: string,
  htmlBaseDirs: string[]
): { matches: BrowserRefMatch[]; protectedRanges: TextRange[] } {
  const matches: BrowserRefMatch[] = []
  const protectedRanges: TextRange[] = []
  const regex = new RegExp(INLINE_CODE_PATTERN.source, INLINE_CODE_PATTERN.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const full = match[0]
    const start = match.index
    const end = start + full.length
    const inner = full.replace(/^`+/, '').replace(/`+$/, '').trim()
    const url = inner ? resolveBrowserTarget(inner, htmlBaseDirs) : null
    if (url) {
      matches.push({ start, end, text: inner, url })
    } else {
      protectedRanges.push({ start, end })
    }
  }
  return { matches, protectedRanges }
}

function applyMarkdownLinks(text: string, matches: BrowserRefMatch[]): string {
  if (matches.length === 0) return text
  let result = text
  for (let i = matches.length - 1; i >= 0; i--) {
    const item = matches[i]!
    result = `${result.slice(0, item.start)}[${item.text}](${item.url})${result.slice(item.end)}`
  }
  return result
}

function linkifyPlainSegment(text: string, htmlBaseDirs: string[]): string {
  const inline = findInlineCodeMatches(text, htmlBaseDirs)
  const protectedRanges = [...inline.protectedRanges, ...findPatternRanges(text, MARKDOWN_LINK_PATTERN)]
  const refMatches = findBrowserRefMatches(text, htmlBaseDirs, protectedRanges)
  const matches = mergeMatches([...inline.matches, ...refMatches], [])
  return applyMarkdownLinks(text, matches)
}

export function linkifyBrowserReferences(content: string, htmlBaseDirs: string[]): string {
  if (!content) return content
  if (htmlBaseDirs.length === 0) return content

  const fenceRanges = findPatternRanges(content, CODE_FENCE_PATTERN)
  if (fenceRanges.length === 0) {
    return linkifyPlainSegment(content, htmlBaseDirs)
  }

  const parts: string[] = []
  let cursor = 0
  for (const fence of fenceRanges) {
    if (cursor < fence.start) {
      parts.push(linkifyPlainSegment(content.slice(cursor, fence.start), htmlBaseDirs))
    }
    parts.push(content.slice(fence.start, fence.end))
    cursor = fence.end
  }
  if (cursor < content.length) {
    parts.push(linkifyPlainSegment(content.slice(cursor), htmlBaseDirs))
  }
  return parts.join('')
}

export function splitPlainTextBrowserReferences(
  text: string,
  htmlBaseDirs: string[]
): PlainTextSegment[] {
  if (!text) return [{ kind: 'text', value: '' }]
  if (htmlBaseDirs.length === 0) return [{ kind: 'text', value: text }]

  const matches = findBrowserRefMatches(text, htmlBaseDirs, [])
  if (matches.length === 0) return [{ kind: 'text', value: text }]

  const segments: PlainTextSegment[] = []
  let cursor = 0
  for (const item of matches) {
    if (cursor < item.start) {
      segments.push({ kind: 'text', value: text.slice(cursor, item.start) })
    }
    segments.push({ kind: 'link', value: item.text, url: item.url })
    cursor = item.end
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }
  return segments
}
