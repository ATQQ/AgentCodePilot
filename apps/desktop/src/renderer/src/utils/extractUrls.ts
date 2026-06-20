const HTTP_URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

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
