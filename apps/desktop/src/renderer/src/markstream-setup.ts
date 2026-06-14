import { enableKatex, enableMermaid, preloadCodeBlockRuntime } from 'markstream-vue'

export function setupMarkstream(): void {
  enableMermaid()
  enableKatex()
  preloadCodeBlockRuntime()
}
