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

async function registerCliAgents(): Promise<void> {
  const { ClaudeAgentAdapter } = await import('./claude-agent')
  agentRegistry.register(new ClaudeAgentAdapter())

  const { CodexAgentAdapter } = await import('./codex-agent')
  agentRegistry.register(new CodexAgentAdapter())
}

export function ensureAgentRegistry(): Promise<void> {
  if (!registryPromise) {
    registryPromise = (async () => {
      if (agentRegistry.get('mock')) return

      await registerCliAgents()

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

/** Re-probe Claude / Codex CLIs after the user installs them without restarting. */
export async function refreshCliAgentRegistry(): Promise<void> {
  await ensureAgentRegistry()
  await registerCliAgents()
}

export function initializeAgentRegistry(): void {
  void ensureAgentRegistry()
}
