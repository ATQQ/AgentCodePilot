import { enableKatex, enableMermaid, preloadCodeBlockRuntime } from 'markstream-vue'

let peersReady = false
let peersPromise: Promise<void> | null = null

export function setupMarkstreamCore(): void {
  // CSS is imported via assets/main.css; core renderer needs no eager peer loading.
}

export function ensureMarkstreamPeers(): Promise<void> {
  if (peersReady) return Promise.resolve()
  if (!peersPromise) {
    peersPromise = Promise.resolve().then(() => {
      enableMermaid()
      enableKatex()
      preloadCodeBlockRuntime()
      peersReady = true
    })
  }
  return peersPromise
}

/** @deprecated Use ensureMarkstreamPeers() */
export function setupMarkstream(): void {
  setupMarkstreamCore()
  void ensureMarkstreamPeers()
}
