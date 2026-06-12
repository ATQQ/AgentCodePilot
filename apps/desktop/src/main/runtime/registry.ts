import type { AgentAdapter } from './types'

class AgentRegistry {
  private adapters = new Map<string, AgentAdapter>()

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id)
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values())
  }

  stopAll(conversationId: string): void {
    for (const adapter of this.adapters.values()) {
      adapter.stop(conversationId)
    }
  }
}

export const agentRegistry = new AgentRegistry()
