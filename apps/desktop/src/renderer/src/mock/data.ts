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

export const mockProjects: Project[] = [
  { id: 'proj-1', name: 'demo-web-app' },
  { id: 'proj-2', name: 'demo-api-server' },
  { id: 'proj-3', name: 'demo-cli-tool' },
  { id: 'proj-4', name: 'demo-shared-lib' }
]

export const mockWorkspaces: Workspace[] = [
  { id: 'ws-1', name: '全栈项目', folders: ['~/projects/demo-web-app', '~/projects/demo-api-server'] },
  { id: 'ws-2', name: '工具集合', folders: ['~/projects/demo-cli-tool', '~/projects/demo-shared-lib'] }
]

export interface MockConversationWithProject {
  id: string
  title: string
  updatedAt: string
  projectId: string | null
}

export const mockConversations: MockConversationWithProject[] = [
  { id: 'conv-1', title: '实现用户登录流程', updatedAt: '2 小时前', projectId: 'proj-1' },
  { id: 'conv-2', title: '修复分页组件 bug', updatedAt: '昨天', projectId: 'proj-1' },
  { id: 'conv-3', title: '重构数据库查询层', updatedAt: '3 天前', projectId: 'proj-2' },
  { id: 'conv-4', title: '添加单元测试', updatedAt: '1 小时前', projectId: 'proj-4' },
  { id: 'conv-5', title: '配置 CI/CD 流水线', updatedAt: '21 小时前', projectId: 'proj-4' }
]

export const mockFolders: MockFolder[] = [
  { path: '~/projects/demo-web-app' },
  { path: '~/projects/demo-api-server' },
  { path: '~/projects/demo-cli-tool' },
  { path: '~/projects/demo-shared-lib' },
  { path: '~/projects/demo-mobile-app' },
  { path: '~/projects/demo-docs-site' },
  { path: '~/projects/demo-infra-config' },
  { path: '~/projects/demo-e2e-tests' }
]
