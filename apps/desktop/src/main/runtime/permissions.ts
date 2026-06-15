import type { CanUseTool, Options, PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '../../preload/types'
import { waitForApproval } from './approval-manager'

export type ApprovalLevel = 'request' | 'auto' | 'full'

export interface PermissionContext {
  conversationId: string
  messageId: string
  emit: (event: AgentEvent) => void
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebFetch: '获取网页',
  WebSearch: '搜索网络'
}

export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] || toolName
}

export function mapApprovalToPermissionMode(level: ApprovalLevel): PermissionMode {
  switch (level) {
    case 'full':
      return 'bypassPermissions'
    case 'auto':
      return 'auto'
    case 'request':
    default:
      return 'default'
  }
}

function formatToolInputDetail(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return (input.command as string) || ''
    case 'Read':
    case 'Write':
    case 'Edit':
      return (input.file_path as string) || ''
    case 'WebFetch':
      return (input.url as string) || ''
    default:
      try {
        return JSON.stringify(input, null, 2)
      } catch {
        return String(input)
      }
  }
}

function getOperationLabel(toolName: string): string {
  switch (toolName) {
    case 'Read':
      return '读取文件'
    case 'Write':
      return '写入文件'
    case 'Edit':
      return '修改文件'
    case 'Bash':
      return '执行命令'
    case 'WebFetch':
      return '访问网页'
    case 'WebSearch':
      return '搜索网络'
    default:
      return getToolDisplayName(toolName)
  }
}

function createCanUseToolHandler(context: PermissionContext): CanUseTool {
  return async (toolName, input, options) => {
    const displayName = options.displayName || getToolDisplayName(toolName)
    const inputDetail = formatToolInputDetail(toolName, input)
    const title = options.title || `允许${getOperationLabel(toolName)}继续执行？`
    const detailParts = [
      inputDetail ? inputDetail : undefined,
      options.description,
      options.decisionReason ? options.decisionReason : undefined
    ].filter(Boolean)
    const detail = detailParts.join('\n') || 'Claude Code 请求执行一项操作，请确认是否允许。'
    const requestId = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const allowed = await waitForApproval(
      {
        requestId,
        conversationId: context.conversationId,
        messageId: context.messageId,
        toolUseId: options.toolUseID,
        toolName,
        displayName,
        title,
        description: options.description,
        detail,
        decisionReason: options.decisionReason
      },
      context.emit
    )

    if (allowed) {
      return { behavior: 'allow' }
    }
    return { behavior: 'deny', message: '用户拒绝了此操作' }
  }
}

export function buildPermissionOptions(
  level: ApprovalLevel = 'auto',
  context?: PermissionContext
): {
  permissionMode: PermissionMode
  allowDangerouslySkipPermissions?: boolean
  canUseTool?: CanUseTool
} {
  const permissionMode = mapApprovalToPermissionMode(level)

  if (level === 'full') {
    return {
      permissionMode,
      allowDangerouslySkipPermissions: true
    }
  }

  if (context) {
    return {
      permissionMode,
      canUseTool: createCanUseToolHandler(context)
    }
  }

  return { permissionMode }
}

export function buildToolAccessOptions(
  level: ApprovalLevel,
  tools: readonly string[]
): Pick<Options, 'tools' | 'allowedTools'> {
  if (level === 'full') {
    return { allowedTools: [...tools] }
  }
  return { tools: [...tools] }
}
