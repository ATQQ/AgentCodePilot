import type { AiPromptsSettings, FilePreviewSettings } from '@renderer/types'

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
