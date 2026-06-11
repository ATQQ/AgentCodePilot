import type { AgentConfig, ModelConfig, Project, Workspace } from '@renderer/types'

export interface MockFolder {
  path: string
}

export const mockAgents: AgentConfig[] = [
  { id: 'claude-code', name: 'Claude Code', enabled: true },
  { id: 'codex', name: 'Codex', enabled: true },
  { id: 'gemini-cli', name: 'Gemini CLI', enabled: true },
  { id: 'cursor', name: 'Cursor', enabled: false }
]

export const mockModels: ModelConfig[] = [
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'anthropic' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' }
]

export const mockProjects: Project[] = []

export const mockWorkspaces: Workspace[] = []

export interface MockConversationWithProject {
  id: string
  title: string
  updatedAt: string
  projectId: string | null
}

export const mockConversations: MockConversationWithProject[] = []

export const mockFolders: MockFolder[] = []
