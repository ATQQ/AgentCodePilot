import { readFile } from 'fs/promises'
import type { SkillReference } from '../../preload/types'

async function readSkillFile(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}

function buildSkillInstructions(skillRefs: SkillReference[]): string {
  const details = skillRefs
    .map((ref) => `- Skill "${ref.name}" (${ref.scope}, file: ${ref.path})`)
    .join('\n')

  return `[Referenced Skill Context]
The user explicitly attached one or more Agent skill(s). Read each skill document below and follow its workflow when handling the [User Request].

${details ? `Skill file(s):\n${details}\n` : ''}`
}

export async function buildSkillPromptBlocks(skillRefs: SkillReference[]): Promise<string[]> {
  if (!skillRefs.length) return []

  return Promise.all(
    skillRefs.map(async (ref) => {
      try {
        const content = await readSkillFile(ref.path)
        return `[Referenced Skill: ${ref.name}]\n${content}`
      } catch {
        return `[Referenced Skill: ${ref.name}]\n(Skill file not found: ${ref.path})`
      }
    })
  )
}

export async function buildPromptWithSkillRefs(
  content: string,
  skillRefs?: SkillReference[]
): Promise<string> {
  if (!skillRefs?.length) return content

  const instructions = buildSkillInstructions(skillRefs)
  const blocks = await buildSkillPromptBlocks(skillRefs)
  return `${instructions}\n\n${blocks.join('\n\n')}\n\n[User Request]\n${content}`
}
