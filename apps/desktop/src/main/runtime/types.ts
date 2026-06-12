import type { AgentEvent } from '../../preload/types'

export interface AgentRunInput {
  conversationId: string
  messageId: string
  content: string
  agentId: string
  cwd?: string
  workspaceFolders?: string[]
}

export interface AgentAdapter {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void>
  stop(conversationId: string): void
}
