import { setupMonacoWorkers } from './monacoWorkers'

let bootstrapped = false
let bootstrapPromise: Promise<void> | null = null

export function ensureMonacoBootstrap(): Promise<void> {
  if (bootstrapped) return Promise.resolve()
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      setupMonacoWorkers()
      // stream-monaco / markstream load editor.api first unless the full bundle is already
      // registered. Import every contribution + service up front.
      await import('monaco-editor')
      // DiffEditor breadcrumbs need IOutlineModelService; Vite may tree-shake the
      // side-effect registration out of the main monaco-editor entry.
      await import('monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/outlineModel.js')
      bootstrapped = true
    })()
  }
  return bootstrapPromise
}
