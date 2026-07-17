import { enableKatex, enableMermaid, preloadCodeBlockRuntime } from 'markstream-vue'
import { ensureMonacoBootstrap } from '@renderer/utils/monacoBootstrap'

let peersReady = false
let peersPromise: Promise<void> | null = null

export function setupMarkstreamCore(): void {
  // CSS is imported via assets/main.css; core renderer needs no eager peer loading.
}

export function ensureMarkstreamPeers(): Promise<void> {
  if (peersReady) return Promise.resolve()
  if (!peersPromise) {
    peersPromise = (async () => {
      enableMermaid()
      enableKatex()
      // Register Monaco services (incl. IOutlineModelService) before stream-monaco boots,
      // otherwise DiffEditor breadcrumbs throw and restore can hang on loading.
      await ensureMonacoBootstrap()
      await preloadCodeBlockRuntime()
      peersReady = true
    })()
  }
  return peersPromise
}

/** @deprecated Use ensureMarkstreamPeers() */
export function setupMarkstream(): void {
  setupMarkstreamCore()
  void ensureMarkstreamPeers()
}
