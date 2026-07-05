import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export interface ScannedSkill {
  id: string
  name: string
  description: string
  path: string
  scope: 'workspace' | 'global'
}

const WORKSPACE_SKILL_DIRS = ['.agents/skills', '.claude/skills', '.cursor/skills']

const GLOBAL_SKILL_DIRS = [
  join(homedir(), '.agents/skills'),
  join(homedir(), '.cursor/skills-cursor'),
  join(homedir(), '.cursor/skills')
]

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const yaml = match[1]
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  return { name, description }
}

async function scanSkillDir(rootDir: string, scope: 'workspace' | 'global'): Promise<ScannedSkill[]> {
  const results: ScannedSkill[] = []
  if (!existsSync(rootDir)) return results

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (entry.name !== 'SKILL.md') continue

      try {
        const content = await readFile(fullPath, 'utf-8')
        const meta = parseFrontmatter(content)
        const dirName = fullPath.replace(/[/\\]SKILL\.md$/, '').split(/[/\\]/).pop() ?? 'skill'
        results.push({
          id: `${scope}:${fullPath}`,
          name: meta.name ?? dirName,
          description: meta.description ?? '',
          path: fullPath,
          scope
        })
      } catch {
        /* skip unreadable skill */
      }
    }
  }

  await walk(rootDir)
  return results
}

export async function scanSkills(workspaceCwd?: string | null): Promise<ScannedSkill[]> {
  const skills: ScannedSkill[] = []
  const seen = new Set<string>()

  if (workspaceCwd) {
    for (const rel of WORKSPACE_SKILL_DIRS) {
      const dir = join(workspaceCwd, rel)
      for (const skill of await scanSkillDir(dir, 'workspace')) {
        if (seen.has(skill.path)) continue
        seen.add(skill.path)
        skills.push(skill)
      }
    }
  }

  for (const dir of GLOBAL_SKILL_DIRS) {
    for (const skill of await scanSkillDir(dir, 'global')) {
      if (seen.has(skill.path)) continue
      seen.add(skill.path)
      skills.push(skill)
    }
  }

  return skills.sort(
    (a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name, 'zh-CN')
  )
}
