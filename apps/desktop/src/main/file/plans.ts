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

export function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
