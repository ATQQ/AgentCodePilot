import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'fs'
import { getAppDataDir } from '../database'

export type PlanOwnerType = 'conversation' | 'project' | 'workspace'

export function getPlansRootDir(): string {
  return join(getAppDataDir(), 'plans')
}

export function getScopedPlanFilePath(
  ownerType: PlanOwnerType,
  ownerId: string,
  planId: string
): string {
  return join('scopes', ownerType, ownerId, `${planId}.md`)
}

export function resolvePlanAbsolutePath(relativePath: string): string {
  return join(getPlansRootDir(), relativePath)
}

export function writePlanFile(relativePath: string, content: string): void {
  const absPath = resolvePlanAbsolutePath(relativePath)
  mkdirSync(join(absPath, '..'), { recursive: true })
  writeFileSync(absPath, content, 'utf-8')
}

export function readPlanFile(relativePath: string): string {
  const absPath = resolvePlanAbsolutePath(relativePath)
  return readFileSync(absPath, 'utf-8')
}

export function copyPlanFile(srcRelativePath: string, destRelativePath: string): void {
  const srcAbs = resolvePlanAbsolutePath(srcRelativePath)
  const destAbs = resolvePlanAbsolutePath(destRelativePath)
  mkdirSync(join(destAbs, '..'), { recursive: true })
  copyFileSync(srcAbs, destAbs)
}

export function planFileExists(relativePath: string): boolean {
  return existsSync(resolvePlanAbsolutePath(relativePath))
}

export function extractPlanTitle(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()

  const plain = content.replace(/[#*_`>\[\]()]/g, '').trim()
  if (!plain) return '未命名计划'
  return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain
}

const PLAN_H1_PATTERN = /^#\s+.+$/gm
const PLAN_TODO_HEADING = /^##\s+TODO\s*$/im
const PLAN_CHECKLIST_ITEM = /^- \[[ xX]\]/

function trimTrailingConversationalText(plan: string): string {
  const todoMatch = plan.match(PLAN_TODO_HEADING)
  if (!todoMatch || todoMatch.index === undefined) return plan

  const beforeTodo = plan.slice(0, todoMatch.index)
  const fromTodo = plan.slice(todoMatch.index)
  const lines = fromTodo.split('\n')

  let lastChecklistLine = 0
  for (let i = 1; i < lines.length; i++) {
    if (PLAN_CHECKLIST_ITEM.test(lines[i].trim())) {
      lastChecklistLine = i
    }
  }
  if (lastChecklistLine === 0) return plan

  let end = lastChecklistLine + 1
  while (end < lines.length && lines[end].trim() === '') end++
  if (end >= lines.length) return plan.trimEnd()

  const firstTrailingLine = lines[end].trim()
  if (
    /^#/.test(firstTrailingLine) ||
    PLAN_CHECKLIST_ITEM.test(firstTrailingLine) ||
    /^[-*]/.test(firstTrailingLine) ||
    /^```/.test(firstTrailingLine)
  ) {
    return plan
  }

  return (beforeTodo + lines.slice(0, end).join('\n')).trimEnd()
}

/** Strip multi-turn preamble and trailing chat from a plan-mode assistant reply. */
export function extractPlanDocument(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed

  let lastHeadingIndex = -1
  let match: RegExpExecArray | null
  while ((match = PLAN_H1_PATTERN.exec(trimmed)) !== null) {
    lastHeadingIndex = match.index
  }

  if (lastHeadingIndex < 0) return trimmed

  return trimTrailingConversationalText(trimmed.slice(lastHeadingIndex).trim())
}

export function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
