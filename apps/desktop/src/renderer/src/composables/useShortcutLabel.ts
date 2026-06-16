const isMacPlatform =
  typeof navigator !== 'undefined' &&
  (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    navigator.platform.toUpperCase().includes('MAC'))

export function formatShortcutKey(key: string): string {
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key
  return isMacPlatform ? `⌘${normalizedKey}` : `Ctrl+${normalizedKey}`
}
