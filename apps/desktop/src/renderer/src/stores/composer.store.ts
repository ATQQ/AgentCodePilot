import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Attachment, FileReference, PlanReference, SkillReference } from '@renderer/types'
import { usePanelContextStore } from './panelContext.store'
import { createFileReference } from '@renderer/utils/fileReference'

export interface ComposerInsertRequest {
  id: string
  text?: string
  attachment?: Attachment
  planRef?: PlanReference
  fileRef?: FileReference
  skillRef?: SkillReference
}

export interface ExecutePlanRequest {
  id: string
  plan: PlanReference
  message: string
}

const HOME_CONVERSATION_KEY = '__home__'

export const useComposerStore = defineStore('composer', () => {
  const pendingInsert = ref<ComposerInsertRequest | null>(null)
  const pendingExecutePlan = ref<ExecutePlanRequest | null>(null)
  const planModeByConversation = ref<Record<string, boolean>>({})

  function isPlanMode(conversationId: string | null | undefined): boolean {
    const key = conversationId ?? HOME_CONVERSATION_KEY
    return planModeByConversation.value[key] ?? false
  }

  function setPlanMode(conversationId: string | null | undefined, enabled: boolean): void {
    const key = conversationId ?? HOME_CONVERSATION_KEY
    planModeByConversation.value = { ...planModeByConversation.value, [key]: enabled }
  }

  function togglePlanMode(conversationId: string | null | undefined): void {
    setPlanMode(conversationId, !isPlanMode(conversationId))
  }

  function transferHomePlanModeToConversation(conversationId: string): void {
    if (planModeByConversation.value[HOME_CONVERSATION_KEY]) {
      setPlanMode(conversationId, true)
      setPlanMode(HOME_CONVERSATION_KEY, false)
    }
  }

  function insertText(text: string): void {
    pendingInsert.value = { id: `ins-${Date.now()}`, text }
  }

  function addAttachment(attachment: Attachment): void {
    pendingInsert.value = { id: `ins-${Date.now()}`, attachment }
  }

  function addFileReference(path: string, startLine?: number, endLine?: number): void {
    const cwd = usePanelContextStore().effectivePanelCwd
    pendingInsert.value = {
      id: `ins-${Date.now()}`,
      fileRef: createFileReference(path, { startLine, endLine, cwd })
    }
  }

  function addPlanReference(plan: PlanReference): void {
    pendingInsert.value = { id: `ins-${Date.now()}`, planRef: plan }
  }

  function addSkillReference(skill: SkillReference): void {
    pendingInsert.value = { id: `ins-${Date.now()}`, skillRef: skill }
  }

  function executePlan(plan: PlanReference, message: string): void {
    pendingExecutePlan.value = { id: `exec-${Date.now()}`, plan, message }
  }

  function consumeInsert(): ComposerInsertRequest | null {
    const req = pendingInsert.value
    pendingInsert.value = null
    return req
  }

  function consumeExecutePlan(): ExecutePlanRequest | null {
    const req = pendingExecutePlan.value
    pendingExecutePlan.value = null
    return req
  }

  return {
    pendingInsert,
    pendingExecutePlan,
    planModeByConversation,
    isPlanMode,
    setPlanMode,
    togglePlanMode,
    transferHomePlanModeToConversation,
    insertText,
    addAttachment,
    addFileReference,
    addPlanReference,
    addSkillReference,
    executePlan,
    consumeInsert,
    consumeExecutePlan
  }
})
