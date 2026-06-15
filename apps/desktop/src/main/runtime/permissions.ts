import { dialog, BrowserWindow } from 'electron'
import type { CanUseTool, Options, PermissionMode } from '@anthropic-ai/claude-agent-sdk'

export type ApprovalLevel = 'request' | 'auto' | 'full'

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

function createCanUseToolHandler(): CanUseTool {
  return async (toolName, input, options) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const displayName = options.displayName || TOOL_DISPLAY_NAMES[toolName] || toolName
    const inputDetail = formatToolInputDetail(toolName, input)
    const title = options.title || `允许执行「${displayName}」？`
    const detailParts = [
      `工具：${toolName}（${displayName}）`,
      options.description,
      inputDetail ? `详情：\n${inputDetail}` : undefined,
      options.decisionReason ? `原因：${options.decisionReason}` : undefined
    ].filter(Boolean)
    const detail = detailParts.join('\n\n') || 'Claude Code 请求执行一项操作，请确认是否允许。'

    const result = await dialog.showMessageBox(win ?? undefined, {
      type: 'question',
      title: '操作确认',
      message: title,
      detail,
      buttons: ['允许', '拒绝'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })

    if (result.response === 0) {
      return { behavior: 'allow' }
    }
    return { behavior: 'deny', message: '用户拒绝了此操作' }
  }
}

export function buildPermissionOptions(level: ApprovalLevel = 'request'): {
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

  if (level === 'request') {
    return {
      permissionMode,
      canUseTool: createCanUseToolHandler()
    }
  }

  return { permissionMode }
}

export function buildToolAccessOptions(
  level: ApprovalLevel,
  tools: readonly string[]
): Pick<Options, 'tools' | 'allowedTools'> {
  // allowedTools auto-approves without prompting — only use in full-access mode.
  if (level === 'full') {
    return { allowedTools: [...tools] }
  }
  return { tools: [...tools] }
}
