export type ExternalAppKind = 'finder' | 'protocol' | 'terminal' | 'reveal'

export type OpenPathErrorCode = 'NOT_INSTALLED' | 'PATH_NOT_FOUND' | 'INVALID_PROTOCOL' | 'UNKNOWN'

export const REVEAL_APP_ID = 'reveal'

export interface OpenPathResult {
  success: boolean
  error?: OpenPathErrorCode
  message?: string
}

export interface ExternalAppDefinition {
  id: string
  name: string
  kind: ExternalAppKind
  protocol?: string
  builtin: boolean
}

export interface CustomExternalApp {
  id: string
  name: string
  protocol: string
}

export interface ExternalAppsSettings {
  defaultAppId: string
  customApps: CustomExternalApp[]
}

export const DEFAULT_EXTERNAL_APPS_SETTINGS: ExternalAppsSettings = {
  defaultAppId: REVEAL_APP_ID,
  customApps: []
}

export const REVEAL_APP: ExternalAppDefinition = {
  id: REVEAL_APP_ID,
  name: '打开所在文件夹',
  kind: 'reveal',
  builtin: true
}

const SHARED_BUILTIN_APPS: ExternalAppDefinition[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    kind: 'protocol',
    protocol: 'vscode://file/{path}',
    builtin: true
  },
  {
    id: 'cursor',
    name: 'Cursor',
    kind: 'protocol',
    protocol: 'cursor://file/{path}',
    builtin: true
  },
  {
    id: 'terminal',
    name: '终端',
    kind: 'terminal',
    builtin: true
  },
  {
    id: 'trae',
    name: 'TRAE',
    kind: 'protocol',
    protocol: 'trae://file/{path}',
    builtin: true
  },
  {
    id: 'warp',
    name: 'Warp',
    kind: 'protocol',
    protocol: 'warp://action/new_tab?path={path}',
    builtin: true
  }
]

export const BUILTIN_EXTERNAL_APPS = SHARED_BUILTIN_APPS

export function isWindowsPlatform(platform = process.platform): boolean {
  return platform === 'win32'
}

export function getPlatformBuiltinApps(_platform = process.platform): ExternalAppDefinition[] {
  return SHARED_BUILTIN_APPS
}

const LEGACY_DEFAULT_APP_IDS = new Set(['finder', 'explorer'])

export function resolveDefaultAppId(
  settings: ExternalAppsSettings,
  _platform = process.platform
): string {
  if (LEGACY_DEFAULT_APP_IDS.has(settings.defaultAppId)) {
    return REVEAL_APP_ID
  }
  return settings.defaultAppId || REVEAL_APP_ID
}

export function buildProtocolUrl(template: string, filePath: string): string {
  if (template.includes('?') && template.includes('{path}')) {
    return template.replace('{path}', encodeURIComponent(filePath))
  }
  return template.replace('{path}', filePath)
}

export function mergeExternalApps(
  customApps: CustomExternalApp[],
  platform = process.platform
): ExternalAppDefinition[] {
  const custom = customApps.map((app) => ({
    id: app.id,
    name: app.name,
    kind: 'protocol' as const,
    protocol: app.protocol,
    builtin: false
  }))
  return [...getPlatformBuiltinApps(platform), ...custom]
}

export function getSelectableExternalApps(
  settings: ExternalAppsSettings,
  platform = process.platform
): ExternalAppDefinition[] {
  return mergeExternalApps(settings.customApps, platform)
}

export function findExternalAppById(
  appId: string,
  settings: ExternalAppsSettings,
  platform = process.platform
): ExternalAppDefinition | undefined {
  const resolvedId = LEGACY_DEFAULT_APP_IDS.has(appId) ? REVEAL_APP_ID : appId
  if (resolvedId === REVEAL_APP_ID) return REVEAL_APP
  return mergeExternalApps(settings.customApps, platform).find((app) => app.id === resolvedId)
}

export function getDefaultExternalAppsForSettings(
  settings: ExternalAppsSettings,
  platform = process.platform
): ExternalAppDefinition[] {
  return [REVEAL_APP, ...mergeExternalApps(settings.customApps, platform)]
}

export function getExternalAppProtocolHint(app: ExternalAppDefinition): string | null {
  if (app.protocol) return app.protocol
  if (app.kind === 'reveal') return 'showItemInFolder'
  if (app.kind === 'terminal') return 'system-terminal'
  return null
}

export function getBuiltinReferenceApps(platform = process.platform): ExternalAppDefinition[] {
  return [REVEAL_APP, ...getPlatformBuiltinApps(platform)]
}
