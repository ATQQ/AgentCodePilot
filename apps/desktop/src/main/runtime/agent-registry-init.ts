import { agentRegistry } from './registry'
import { MockAgentAdapter } from './mock-agent'
import { isCursorRuntimeSupported } from './cursor-runtime'

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

      if (isCursorRuntimeSupported()) {
        const { CursorAgentAdapter } = await import('./cursor-agent')
        if (!agentRegistry.get('cursor')) {
          agentRegistry.register(new CursorAgentAdapter())
        }
      }

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
