import type { SkillReference } from '@renderer/types'

export function serializeSkillReference(ref: Pick<SkillReference, 'name'>): string {
  return `[skill:${ref.name}]`
}

export function skillRefFromElement(el: HTMLElement): SkillReference {
  return {
    name: el.dataset.name ?? '',
    path: el.dataset.path ?? '',
    scope: el.dataset.scope === 'global' ? 'global' : 'workspace'
  }
}

export function extractSkillRefsFromEditor(root: HTMLElement): SkillReference[] {
  const refs: SkillReference[] = []
  const seen = new Set<string>()

  root.querySelectorAll('.inline-skill-ref').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const ref = skillRefFromElement(node)
    const key = ref.path || ref.name
    if (!key || seen.has(key)) return
    seen.add(key)
    refs.push(ref)
  })

  return refs
}

export function formatSkillReferenceLabel(ref: Pick<SkillReference, 'name'>): string {
  return `技能 ${ref.name}`
}
