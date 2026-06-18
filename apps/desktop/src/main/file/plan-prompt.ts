import type { AttachmentPayload, PlanReference } from '../../preload/types'
import * as repo from '../database/repositories'
import { readPlanFile, resolvePlanAbsolutePath } from './plans'
import { buildPromptWithAttachments } from './prompt-attachments'

const NEW_PLAN_PATTERN = /新.{0,4}计划|重新规划|另.{0,2}计划|new plan|start over/i

export function userRequestsNewPlan(content: string): boolean {
  return NEW_PLAN_PATTERN.test(content)
}

export function getLatestPlanForConversation(conversationId: string): repo.PlanRow | undefined {
  const plans = repo.listPlansByConversation(conversationId)
  return plans[0]
}

function buildPlanModeInstructions(existingPlanContent?: string): string {
  const base = `[Plan Mode]
You are in plan mode. Produce or update an execution plan document in your response.

Rules:
- Output the FULL plan document as markdown (with a # title heading).
- The saved plan must contain ONLY the plan document — no exploratory preamble (e.g. "Let me explore...", "I'll first check...") and no post-plan chat.
- When you are ready to deliver the plan, start that text output directly with \`# Title\` on the first line.
- End the document with a "## TODO" section listing actionable steps as markdown checkboxes, one per line: - [ ] Task description
- Do NOT include confirmation prompts in the plan document (e.g. "是否继续?", "请确认", "是否同意") — those belong only in your conversational reply for multi-turn discussion with the user.
- Focus on concrete implementation steps, file paths, and technical details.`

  if (existingPlanContent) {
    return `${base}
- Unless the user explicitly asks for a brand-new plan, UPDATE the existing plan below based on their feedback. Do not discard prior work unnecessarily.

[Current Execution Plan]
${existingPlanContent}

[User Request]`
  }

  return `${base}

[User Request]`
}

function buildExecutionInstructions(planRefs: PlanReference[]): string {
  const planDetails = planRefs
    .map((ref) => {
      const plan = repo.getPlanById(ref.id)
      if (!plan) return null
      const absPath = resolvePlanAbsolutePath(plan.file_path)
      return `- Plan "${ref.title}" (file: ${absPath})`
    })
    .filter(Boolean)
    .join('\n')

  return `[Execution Mode]
Execute the referenced plan step by step. Work through the TODO items in order.
When you complete a TODO item, update the plan file to mark it done: change "- [ ]" to "- [x]" for that item using the Edit tool.
${planDetails ? `\nPlan file(s):\n${planDetails}\n` : ''}`
}

export function buildAgentPrompt(options: {
  content: string
  attachments?: AttachmentPayload[]
  planRefs?: PlanReference[]
  planMode?: boolean
  conversationId?: string
}): string {
  const { content, attachments, planRefs, planMode, conversationId } = options
  const withAttachments = buildPromptWithAttachments(content, attachments)

  if (planMode && conversationId) {
    const latestPlan = userRequestsNewPlan(content)
      ? undefined
      : getLatestPlanForConversation(conversationId)
    const existingContent = latestPlan ? readPlanFile(latestPlan.file_path) : undefined
    const instructions = buildPlanModeInstructions(existingContent)
    return `${instructions}\n${withAttachments}`
  }

  if (planRefs?.length) {
    const blocks = planRefs.map((ref) => {
      const plan = repo.getPlanById(ref.id)
      if (!plan) {
        return `[Referenced Execution Plan: ${ref.title}]\n(Plan not found)`
      }
      const planContent = readPlanFile(plan.file_path)
      return `[Referenced Execution Plan: ${ref.title}]\n${planContent}`
    })
    const executionInstructions = buildExecutionInstructions(planRefs)
    return `${executionInstructions}\n\n${blocks.join('\n\n')}\n\n[User Request]\n${withAttachments}`
  }

  return withAttachments
}
