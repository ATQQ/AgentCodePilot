import type {
  CanUseTool,
  HookCallback,
  Options,
  PermissionMode,
  PermissionRequestHookInput,
  PermissionResult,
  PermissionUpdate
} from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '../../preload/types'
import type { ApprovalRequestPayload, ApprovalResult } from './approval-manager'
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

const activeApprovalByToolUse = new Map<string, Promise<ApprovalResult>>()

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

function buildApprovalKey(
  conversationId: string,
  toolUseId: string | undefined,
  toolName: string,
  input: Record<string, unknown>
): string {
  if (toolUseId) return `${conversationId}:${toolUseId}`
  return `${conversationId}:${toolName}:${formatToolInputDetail(toolName, input)}`
}

function buildPermissionResult(
  approval: ApprovalResult,
  suggestions?: PermissionUpdate[]
): PermissionResult {
  if (!approval.allowed) {
    return {
      behavior: 'deny',
      message: '用户拒绝了此操作',
      decisionClassification: 'user_reject'
    }
  }

  const decisionClassification =
    approval.scope === 'conversation' ? 'user_permanent' : 'user_temporary'

  if (suggestions?.length) {
    return {
      behavior: 'allow',
      updatedPermissions: suggestions,
      decisionClassification
    }
  }

  return {
    behavior: 'allow',
    decisionClassification
  }
}

async function requestToolApproval(
  context: PermissionContext,
  params: {
    toolUseId: string | undefined
    toolName: string
    input: Record<string, unknown>
    title?: string
    displayName?: string
    description?: string
    decisionReason?: string
    suggestions?: PermissionUpdate[]
  }
): Promise<PermissionResult> {
  const inputDetail = formatToolInputDetail(params.toolName, params.input)
  const title = params.title || `允许${getOperationLabel(params.toolName)}继续执行？`
  const detailParts = [
    inputDetail ? inputDetail : undefined,
    params.description,
    params.decisionReason ? params.decisionReason : undefined
  ].filter(Boolean)
  const detail = detailParts.join('\n') || 'Claude Code 请求执行一项操作，请确认是否允许。'
  const approvalKey = buildApprovalKey(
    context.conversationId,
    params.toolUseId,
    params.toolName,
    params.input
  )

  let pending = activeApprovalByToolUse.get(approvalKey)
  if (!pending) {
    const requestId = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const payload: ApprovalRequestPayload = {
      requestId,
      conversationId: context.conversationId,
      messageId: context.messageId,
      toolUseId: params.toolUseId || requestId,
      toolName: params.toolName,
      displayName: params.displayName || getToolDisplayName(params.toolName),
      title,
      description: params.description,
      detail,
      decisionReason: params.decisionReason
    }

    pending = waitForApproval(payload, context.emit).finally(() => {
      activeApprovalByToolUse.delete(approvalKey)
    })
    activeApprovalByToolUse.set(approvalKey, pending)
  }

  const approval = await pending
  return buildPermissionResult(approval, params.suggestions)
}

function createCanUseToolHandler(context: PermissionContext): CanUseTool {
  return async (toolName, input, options) =>
    requestToolApproval(context, {
      toolUseId: options.toolUseID,
      toolName,
      input,
      title: options.title,
      displayName: options.displayName,
      description: options.description,
      decisionReason: options.decisionReason,
      suggestions: options.suggestions
    })
}

function createPermissionRequestHook(context: PermissionContext): HookCallback {
  return async (input, toolUseID) => {
    if (input.hook_event_name !== 'PermissionRequest') {
      return {}
    }

    const hookInput = input as PermissionRequestHookInput
    const toolInput =
      hookInput.tool_input && typeof hookInput.tool_input === 'object'
        ? (hookInput.tool_input as Record<string, unknown>)
        : {}

    const result = await requestToolApproval(context, {
      toolUseId: toolUseID,
      toolName: hookInput.tool_name,
      input: toolInput,
      suggestions: hookInput.permission_suggestions
    })

    if (result.behavior === 'deny') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'deny',
            message: result.message
          }
        }
      }
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow',
          updatedPermissions: result.updatedPermissions
        }
      }
    }
  }
}

function createPostToolUseHook(context: PermissionContext): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PostToolUse') {
      return {}
    }

    const hookInput = input as { tool_use_id: string; duration_ms?: number }
    context.emit({
      type: 'tool.completed',
      conversationId: context.conversationId,
      messageId: context.messageId,
      toolUseId: hookInput.tool_use_id,
      elapsedSeconds:
        hookInput.duration_ms != null ? hookInput.duration_ms / 1000 : undefined,
      status: 'completed'
    })
    return {}
  }
}

function createPostToolUseFailureHook(context: PermissionContext): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PostToolUseFailure') {
      return {}
    }

    const hookInput = input as { tool_use_id: string; error: string }
    context.emit({
      type: 'tool.completed',
      conversationId: context.conversationId,
      messageId: context.messageId,
      toolUseId: hookInput.tool_use_id,
      summary: hookInput.error,
      status: 'error'
    })
    return {}
  }
}

function buildToolLifecycleHooks(context: PermissionContext): NonNullable<Options['hooks']> {
  return {
    PostToolUse: [{ hooks: [createPostToolUseHook(context)] }],
    PostToolUseFailure: [{ hooks: [createPostToolUseFailureHook(context)] }]
  }
}

export function buildPermissionOptions(
  level: ApprovalLevel = 'auto',
  context?: PermissionContext,
  planMode = false
): {
  permissionMode: PermissionMode
  allowDangerouslySkipPermissions?: boolean
  canUseTool?: CanUseTool
  hooks?: Options['hooks']
} {
  if (planMode) {
    return { permissionMode: 'plan' }
  }

  const permissionMode = mapApprovalToPermissionMode(level)
  const lifecycleHooks = context ? buildToolLifecycleHooks(context) : undefined

  if (level === 'full') {
    return {
      permissionMode,
      allowDangerouslySkipPermissions: true,
      ...(lifecycleHooks ? { hooks: lifecycleHooks } : {})
    }
  }

  if (context) {
    return {
      permissionMode,
      canUseTool: createCanUseToolHandler(context),
      hooks: {
        ...lifecycleHooks,
        PermissionRequest: [{ hooks: [createPermissionRequestHook(context)] }]
      }
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
