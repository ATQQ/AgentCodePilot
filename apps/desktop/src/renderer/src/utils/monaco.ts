import type * as Monaco from 'monaco-editor'
import { registerMonacoThemes } from 'stream-monaco'
import { CODE_BLOCK_MONACO_THEMES, CODE_BLOCK_THEME } from '@renderer/constants/codeBlockTheme'

const MONACO_LANGUAGES = [
  'plaintext',
  'typescript',
  'javascript',
  'html',
  'json',
  'markdown',
  'css',
  'scss',
  'yaml',
  'shell',
  'python',
  'go',
  'rust',
  'java',
  'sql',
  'xml'
] as const

export type PreviewLanguageId = (typeof MONACO_LANGUAGES)[number]

export const PREVIEW_LANGUAGE_OPTIONS: { id: PreviewLanguageId; label: string }[] = [
  { id: 'plaintext', label: '纯文本' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'html', label: 'HTML' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'yaml', label: 'YAML' },
  { id: 'shell', label: 'Shell' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'sql', label: 'SQL' },
  { id: 'xml', label: 'XML' }
]

let monacoPromise: Promise<typeof Monaco> | null = null
let themesDefined = false

export function getMonacoThemeName(isDark = isMonacoDarkTheme()): string {
  return isDark ? CODE_BLOCK_THEME.dark : CODE_BLOCK_THEME.light
}

export function loadMonaco(): Promise<typeof Monaco> {
  if (!monacoPromise) {
    monacoPromise = import('monaco-editor').then(async (monaco) => {
      ensureMonacoThemes(monaco)
      await registerMonacoThemes(CODE_BLOCK_MONACO_THEMES, [...MONACO_LANGUAGES]).catch(() => undefined)
      return monaco
    })
  }
  return monacoPromise
}

export function isMonacoDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function ensureMonacoThemes(monaco: typeof Monaco): void {
  if (themesDefined) return
  themesDefined = true

  monaco.editor.defineTheme(CODE_BLOCK_THEME.light, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'diffEditor.insertedTextBackground': '#2ea04355',
      'diffEditor.removedTextBackground': '#ff818266',
      'diffEditor.insertedLineBackground': '#2ea04333',
      'diffEditor.removedLineBackground': '#ff818240',
      'diffEditor.border': '#e5e7eb',
      'diffEditor.diagonalFill': '#d1d5db66'
    }
  })

  monaco.editor.defineTheme(CODE_BLOCK_THEME.dark, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'diffEditor.insertedTextBackground': '#3fb95066',
      'diffEditor.removedTextBackground': '#f8514966',
      'diffEditor.insertedLineBackground': '#3fb95040',
      'diffEditor.removedLineBackground': '#f8514940',
      'diffEditor.border': '#30363d',
      'diffEditor.diagonalFill': '#484f5840'
    }
  })
}

export function applyMonacoTheme(monaco: typeof Monaco): void {
  ensureMonacoThemes(monaco)
  monaco.editor.setTheme(getMonacoThemeName())
}

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'html',
    json: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    sql: 'sql',
    xml: 'xml',
    toml: 'toml',
    ini: 'ini'
  }
  return map[ext] ?? 'plaintext'
}
