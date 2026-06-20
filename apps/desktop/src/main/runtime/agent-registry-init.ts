import { agentRegistry } from './registry'
import { MockAgentAdapter } from './mock-agent'

let registryPromise: Promise<void> | null = null

export function ensureAgentRegistry(): Promise<void> {
  if (!registryPromise) {
    registryPromise = (async () => {
      if (agentRegistry.get('mock')) return

      const { ClaudeAgentAdapter } = await import('./claude-agent')
      if (!agentRegistry.get('claude-code')) {
        agentRegistry.register(new ClaudeAgentAdapter())
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
