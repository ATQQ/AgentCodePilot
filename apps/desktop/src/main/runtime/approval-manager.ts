import { Notification, BrowserWindow } from 'electron'
import type { AgentEvent } from '../../preload/types'
import { IPC_CHANNELS } from '../../preload/types'
import * as repo from '../database/repositories'

export interface ApprovalRequestPayload {
  requestId: string
  conversationId: string
  messageId: string
  toolUseId: string
  toolName: string
  displayName: string
  title: string
  description?: string
  detail: string
  decisionReason?: string
}

interface PendingApproval {
  resolve: (allowed: boolean) => void
  conversationId: string
}

const pendingApprovals = new Map<string, PendingApproval>()

function isPermissionNotificationsEnabled(): boolean {
  const value = repo.getSetting('permissionNotificationsEnabled')
  return value !== 'false'
}

function shouldShowSystemNotification(): boolean {
  if (!isPermissionNotificationsEnabled()) return false
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return true
  return !win.isFocused()
}

function showApprovalNotification(payload: ApprovalRequestPayload): void {
  if (!shouldShowSystemNotification()) return

  const notification = new Notification({
    title: '需要您的批准',
    body: `${payload.title}\n${payload.displayName}`,
    silent: false
  })

  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send(IPC_CHANNELS.APPROVAL_NAVIGATE, payload.conversationId)
  })

  notification.show()
}

export function waitForApproval(
  payload: ApprovalRequestPayload,
  emit: (event: AgentEvent) => void
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(payload.requestId, {
      resolve,
      conversationId: payload.conversationId
    })

    emit({
      type: 'approval.requested',
      ...payload
    })

    showApprovalNotification(payload)
  })
}

export function respondToApproval(
  requestId: string,
  allowed: boolean
): { resolved: boolean; conversationId?: string } {
  const pending = pendingApprovals.get(requestId)
  if (!pending) return { resolved: false }

  pendingApprovals.delete(requestId)
  pending.resolve(allowed)
  return { resolved: true, conversationId: pending.conversationId }
}

export function cancelApprovalsForConversation(conversationId: string): void {
  for (const [requestId, pending] of pendingApprovals) {
    if (pending.conversationId === conversationId) {
      pendingApprovals.delete(requestId)
      pending.resolve(false)
    }
  }
}

export function hasPendingApproval(conversationId: string): boolean {
  for (const pending of pendingApprovals.values()) {
    if (pending.conversationId === conversationId) return true
  }
  return false
}
