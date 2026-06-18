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

function tryReadPlanContent(plan: repo.PlanRow): string {
  try {
    return readPlanFile(plan.file_path)
  } catch {
    return '(Plan file not found or unreadable)'
  }
}

function buildReferencedPlanInstructions(planRefs: PlanReference[]): string {
  const planDetails = planRefs
    .map((ref) => {
      const plan = repo.getPlanById(ref.id)
      if (!plan) return null
      const absPath = resolvePlanAbsolutePath(plan.file_path)
      return `- Plan "${ref.title}" (file: ${absPath})`
    })
    .filter(Boolean)
    .join('\n')

  return `[Referenced Plan Context]
The user attached one or more execution plan(s) below. Read the plan content and the [User Request] carefully, then decide what to do.

## Step 1 — Infer intent (you decide; do not assume execution)
Classify the user's intent into ONE of these modes:

1. **Edit plan only** — user wants to change, update, revise, refine, or rewrite the plan document (e.g. "modify step 3", "update the plan", "revise the TODO list"). Works in any language.
2. **Review / discuss** — user wants feedback, questions answered, or a review without changing code or executing tasks (e.g. "what do you think?", "review this plan", "explain step 2").
3. **Execute / implement** — user clearly wants you to carry out the plan: implement tasks, edit source code, run commands, and work through TODO items (e.g. "execute the plan", "start implementing", "go ahead and build it", "开始执行", "按计划做").

If the [User Request] is empty, vague, or only attaches the plan without asking to run it → treat as **review/discuss** or **edit** if they implied changes; **never default to execute**.

If the user says NOT to execute (e.g. "don't run yet", "only update the plan", "先别执行") → honor that; use edit or review mode only.

When intent is ambiguous, ask a brief clarifying question OR stay in edit/review mode — do NOT start implementing.

## Step 2 — Act according to the mode

**Edit plan only:**
- Update the plan file via the Edit tool and/or explain changes in your reply.
- Preserve existing completed checkbox items (- [x]) unless the user asks to reset or replan.
- STOP after updating the plan. Do NOT implement TODOs or edit unrelated project source files.

**Review / discuss:**
- Answer or review in your reply only.
- Do NOT edit the plan file or project code unless the user asked for specific edits.

**Execute / implement:**
- Work through TODO items in order.
- When you complete a TODO item, update the plan file: change "- [ ]" to "- [x]" for that item using the Edit tool.
- Continue implementation until the request is done or you need user input.
- Do not stop after only editing the plan document when execution was requested.

${planDetails ? `Plan file(s):\n${planDetails}\n` : ''}`
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
        return `[Referenced Plan: ${ref.title}]\n(Plan not found)`
      }
      const planContent = tryReadPlanContent(plan)
      return `[Referenced Plan: ${ref.title}]\n${planContent}`
    })
    const planInstructions = buildReferencedPlanInstructions(planRefs)
    return `${planInstructions}\n\n${blocks.join('\n\n')}\n\n[User Request]\n${withAttachments}`
  }

  return withAttachments
}
