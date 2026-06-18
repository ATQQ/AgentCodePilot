import type * as Monaco from 'monaco-editor'

let monacoPromise: Promise<typeof Monaco> | null = null
let themesDefined = false

export function loadMonaco(): Promise<typeof Monaco> {
  if (!monacoPromise) {
    monacoPromise = import('monaco-editor').then((monaco) => {
      ensureMonacoThemes(monaco)
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

  monaco.editor.defineTheme('app-light', {
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

  monaco.editor.defineTheme('app-dark', {
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
  monaco.editor.setTheme(isMonacoDarkTheme() ? 'app-dark' : 'app-light')
}

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    vue: 'html',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    py: 'python',
    go: 'go',
    rs: 'rust'
  }
  return map[ext] ?? 'plaintext'
}
