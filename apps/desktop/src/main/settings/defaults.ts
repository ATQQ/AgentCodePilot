import type { AiPromptsSettings, ExternalAppsSettings, FilePreviewSettings } from '../../preload/types'
import { DEFAULT_EXTERNAL_APPS_SETTINGS, REVEAL_APP_ID } from '../../shared/externalApps'

const LEGACY_DEFAULT_APP_IDS = new Set(['finder', 'explorer'])

export const DEFAULT_TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'mjs', 'ts', 'mts', 'tsx', 'vue', 'css', 'scss', 'less',
  'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs',
  'sql', 'graphql', 'gql', 'env', 'gitignore', 'dockerignore', 'editorconfig', 'properties',
  'log', 'csv', 'svg', 'lock', 'prisma', 'gradle', 'makefile', 'dockerfile'
]

export const DEFAULT_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp']

export const DEFAULT_FILE_PREVIEW: FilePreviewSettings = {
  textExtensions: [...DEFAULT_TEXT_EXTENSIONS],
  imageExtensions: [...DEFAULT_IMAGE_EXTENSIONS]
}

export const DEFAULT_COMMIT_MESSAGE_PROMPT = `You are a commit message assistant. Analyze staged git changes and write a commit message.

Rules:
- Use Conventional Commits format in English
- First line ≤ 72 characters, imperative mood (add / fix / refactor / chore / etc.)
- Optional body: 1-2 sentences explaining why, not a file list
- Output ONLY the commit message, no markdown fences or extra commentary
- Common types: feat, fix, refactor, chore, docs, test, style, perf`

export const DEFAULT_AUTO_COMMIT_PROMPT = `Analyze staged git changes, write a Conventional Commits message, and confirm it is ready to commit. Output only the commit message.`

export const DEFAULT_AI_PROMPTS: AiPromptsSettings = {
  commitMessage: DEFAULT_COMMIT_MESSAGE_PROMPT,
  autoCommit: DEFAULT_AUTO_COMMIT_PROMPT
}

function parseJsonSetting<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function parseFilePreviewSetting(raw: string | undefined): FilePreviewSettings {
  return parseJsonSetting(raw, DEFAULT_FILE_PREVIEW)
}

export function parseAiPromptsSetting(raw: string | undefined): AiPromptsSettings {
  return parseJsonSetting(raw, DEFAULT_AI_PROMPTS)
}

export function parseExternalAppsSetting(raw: string | undefined): ExternalAppsSettings {
  const parsed = parseJsonSetting<ExternalAppsSettings>(raw, DEFAULT_EXTERNAL_APPS_SETTINGS)
  const defaultAppId = LEGACY_DEFAULT_APP_IDS.has(parsed.defaultAppId)
    ? REVEAL_APP_ID
    : parsed.defaultAppId || DEFAULT_EXTERNAL_APPS_SETTINGS.defaultAppId
  return {
    defaultAppId,
    customApps: Array.isArray(parsed.customApps)
      ? parsed.customApps.filter(
          (app) =>
            app &&
            typeof app.id === 'string' &&
            typeof app.name === 'string' &&
            typeof app.protocol === 'string' &&
            app.protocol.includes('{path}')
        ).map((app) => ({
          id: app.id,
          name: app.name,
          protocol: app.protocol,
          iconUrl: typeof app.iconUrl === 'string' ? app.iconUrl : undefined,
          iconSvg: typeof app.iconSvg === 'string' ? app.iconSvg : undefined
        }))
      : [],
    disabledBuiltinIds: Array.isArray(parsed.disabledBuiltinIds)
      ? parsed.disabledBuiltinIds.filter((id): id is string => typeof id === 'string')
      : []
  }
}
