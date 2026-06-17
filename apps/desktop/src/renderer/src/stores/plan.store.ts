import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PlanInfo, PlanOwnerType } from '../../../preload/types'

export type PlanScope = 'conversation' | 'owner'

export const usePlanStore = defineStore('plan', () => {
  const plans = ref<PlanInfo[]>([])
  const activePlanId = ref<string | null>(null)
  const activePlanContent = ref<string>('')
  const scope = ref<PlanScope>('conversation')
  const loading = ref(false)
  const currentConversationId = ref<string | null>(null)
  const currentOwnerType = ref<PlanOwnerType | null>(null)
  const currentOwnerId = ref<string | null>(null)

  const activePlan = computed(() => plans.value.find((p) => p.id === activePlanId.value) ?? null)

  async function loadPlans(
    conversationId?: string | null,
    ownerType?: PlanOwnerType | null,
    ownerId?: string | null,
    preferredScope?: PlanScope
  ): Promise<void> {
    currentConversationId.value = conversationId ?? null
    currentOwnerType.value = ownerType ?? null
    currentOwnerId.value = ownerId ?? null
    if (preferredScope) scope.value = preferredScope

    loading.value = true
    try {
      if (scope.value === 'owner' && ownerType && ownerId) {
        plans.value = await window.agentAPI.plans.list({ ownerType, ownerId })
      } else if (conversationId) {
        scope.value = 'conversation'
        plans.value = await window.agentAPI.plans.list({ conversationId })
      } else {
        plans.value = []
      }

      if (activePlanId.value && !plans.value.some((p) => p.id === activePlanId.value)) {
        activePlanId.value = plans.value[0]?.id ?? null
      } else if (!activePlanId.value && plans.value.length > 0) {
        activePlanId.value = plans.value[0].id
      }

      if (activePlanId.value) {
        await loadPlanContent(activePlanId.value)
      } else {
        activePlanContent.value = ''
      }
    } finally {
      loading.value = false
    }
  }

  async function loadPlanContent(planId: string): Promise<void> {
    const detail = await window.agentAPI.plans.get(planId)
    if (detail) {
      activePlanId.value = planId
      activePlanContent.value = detail.content
    }
  }

  async function selectPlan(planId: string): Promise<void> {
    await loadPlanContent(planId)
  }

  async function setScope(nextScope: PlanScope): Promise<void> {
    if (nextScope === scope.value) return
    scope.value = nextScope
    await loadPlans(currentConversationId.value, currentOwnerType.value, currentOwnerId.value)
  }

  function setActivePlanId(planId: string | null): void {
    activePlanId.value = planId
  }

  function reset(): void {
    plans.value = []
    activePlanId.value = null
    activePlanContent.value = ''
    scope.value = 'conversation'
    currentConversationId.value = null
    currentOwnerType.value = null
    currentOwnerId.value = null
  }

  return {
    plans,
    activePlanId,
    activePlanContent,
    activePlan,
    scope,
    loading,
    currentConversationId,
    currentOwnerType,
    currentOwnerId,
    loadPlans,
    loadPlanContent,
    selectPlan,
    setScope,
    setActivePlanId,
    reset
  }
})
