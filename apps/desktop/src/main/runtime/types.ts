import type { AgentEvent } from '../../preload/types'

export interface ConversationHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentRunInput {
  conversationId: string
  messageId: string
  content: string
  agentId: string
  cwd?: string
  workspaceFolders?: string[]
  agentSessionId?: string | null
  conversationHistory?: ConversationHistoryItem[]
  approvalLevel?: 'request' | 'auto' | 'full'
}

export interface AgentAdapter {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void>
  stop(conversationId: string): void
}
