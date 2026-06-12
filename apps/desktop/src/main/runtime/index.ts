import { agentRegistry } from './registry'
import { ClaudeAgentAdapter } from './claude-agent'
import { MockAgentAdapter } from './mock-agent'

export { agentRegistry } from './registry'
export type { AgentAdapter, AgentRunInput } from './types'

export function initializeAgentRegistry(): void {
  agentRegistry.register(new ClaudeAgentAdapter())
  agentRegistry.register(new MockAgentAdapter())
}
