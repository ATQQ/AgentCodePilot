import { dialog, BrowserWindow } from 'electron'
import type { CanUseTool, PermissionMode } from '@anthropic-ai/claude-agent-sdk'

export type ApprovalLevel = 'request' | 'auto' | 'full'

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
    const title = options.title || `允许执行「${options.displayName || toolName}」？`
    const detail =
      options.description ||
      formatToolInputDetail(toolName, input) ||
      'Claude Code 请求执行一项操作，请确认是否允许。'

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
