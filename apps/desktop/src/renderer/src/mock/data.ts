export interface MockProject {
  id: string
  name: string
}

export interface MockWorkspace {
  id: string
  name: string
  folders: string[]
}

export interface MockConversation {
  id: string
  title: string
  updatedAt: string
}

export interface MockFolder {
  path: string
}

export const mockProjects: MockProject[] = [
  { id: 'proj-1', name: 'demo-web-app' },
  { id: 'proj-2', name: 'demo-api-server' },
  { id: 'proj-3', name: 'demo-cli-tool' },
  { id: 'proj-4', name: 'demo-shared-lib' }
]

export const mockWorkspaces: MockWorkspace[] = [
  { id: 'ws-1', name: '全栈项目', folders: ['~/projects/demo-web-app', '~/projects/demo-api-server'] },
  { id: 'ws-2', name: '工具集合', folders: ['~/projects/demo-cli-tool', '~/projects/demo-shared-lib'] }
]

export const mockConversations: MockConversation[] = [
  { id: 'conv-1', title: '实现用户登录流程', updatedAt: '2 小时前' },
  { id: 'conv-2', title: '修复分页组件 bug', updatedAt: '昨天' },
  { id: 'conv-3', title: '重构数据库查询层', updatedAt: '3 天前' }
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
