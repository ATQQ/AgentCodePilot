import { agentRegistry } from './registry'
import { MockAgentAdapter } from './mock-agent'

/**
 * Cursor Agent is kept in-repo but disabled (not registered / excluded from tsconfig).
 *
 * To re-enable:
 * 1. apps/desktop/package.json — restore dependency `"@cursor/sdk": "^1.0.22"`
 * 2. apps/desktop/tsconfig.node.json — remove the `src/main/runtime/cursor-*.ts` excludes
 * 3. Uncomment the Cursor blocks in this file, model-catalog.ts, and gateway/router.ts
 * 4. Optionally restore UI wiring (AgentSettingsSection / MODEL_SELECTOR_AGENTS / i18n)
 * 5. pnpm install && pnpm typecheck
 */

let registryPromise: Promise<void> | null = null

export function ensureAgentRegistry(): Promise<void> {
  if (!registryPromise) {
    registryPromise = (async () => {
      if (agentRegistry.get('mock')) return

      const { ClaudeAgentAdapter } = await import('./claude-agent')
      if (!agentRegistry.get('claude-code')) {
        agentRegistry.register(new ClaudeAgentAdapter())
      }

      const { CodexAgentAdapter } = await import('./codex-agent')
      if (!agentRegistry.get('codex')) {
        agentRegistry.register(new CodexAgentAdapter())
      }

      // --- Cursor Agent (disabled) ---
      // const { isCursorRuntimeSupported } = await import('./cursor-runtime')
      // if (isCursorRuntimeSupported()) {
      //   const { CursorAgentAdapter } = await import('./cursor-agent')
      //   if (!agentRegistry.get('cursor')) {
      //     agentRegistry.register(new CursorAgentAdapter())
      //   }
      // }

      if (!agentRegistry.get('mock')) {
        agentRegistry.register(new MockAgentAdapter())
      }
    })()
  }
  return registryPromise
}

export function initializeAgentRegistry(): void {
  void ensureAgentRegistry()
}
