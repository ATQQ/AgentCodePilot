import vscodeIcon from '@renderer/assets/external-apps/vscode.svg'
import terminalIcon from '@renderer/assets/external-apps/terminal.svg'
import traeIcon from '@renderer/assets/external-apps/trae.webp'
import cursorIcon from '@renderer/assets/external-apps/cursor.svg'
import warpIcon from '@renderer/assets/external-apps/warp.png'
import revealIcon from '@renderer/assets/external-apps/reveal.svg'
import customIcon from '@renderer/assets/external-apps/custom.svg'

const ICONS: Record<string, string> = {
  vscode: vscodeIcon,
  cursor: cursorIcon,
  terminal: terminalIcon,
  trae: traeIcon,
  warp: warpIcon,
  reveal: revealIcon,
  custom: customIcon
}

export function getExternalAppIcon(appId: string, iconUrl?: string, iconSvg?: string): string {
  if (iconUrl?.trim()) return iconUrl.trim()
  if (iconSvg?.trim()) {
    const encoded = encodeURIComponent(iconSvg.trim())
    return `data:image/svg+xml,${encoded}`
  }
  return ICONS[appId] ?? customIcon
}

const MONOCHROME_ICON_IDS = new Set(['cursor'])

const INSET_ICON_IDS = new Set(['vscode', 'cursor', 'reveal', 'custom'])

export function isMonochromeExternalAppIcon(appId: string): boolean {
  return MONOCHROME_ICON_IDS.has(appId)
}

export function needsInsetExternalAppIcon(appId: string): boolean {
  return INSET_ICON_IDS.has(appId) || !ICONS[appId]
}

export function isWindowsPlatform(): boolean {
  const platform = window.electron?.process?.platform
  if (platform) return platform === 'win32'
  return typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent)
}
