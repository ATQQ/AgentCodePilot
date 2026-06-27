<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlanInfo, PlanReference } from '@renderer/types'
import { useChatStore } from '@renderer/stores/chat.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { ownerScopeLabelKey, resolvePlanOwnerFromProjectId } from '@renderer/utils/planOwner'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [plan: PlanReference]
}>()

const { t } = useI18n()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()
const plans = ref<PlanInfo[]>([])
const loading = ref(false)
const scope = ref<'conversation' | 'owner'>('owner')

/** Prefer composer project selector, then active conversation's project. */
const resolvedProjectId = computed(
  () => chatStore.activeConversation?.projectId ?? workspaceStore.selectedProjectId
)

const ownerContext = computed(() => {
  const projectId = resolvedProjectId.value
  if (!projectId) return null
  return resolvePlanOwnerFromProjectId(projectId, workspaceStore)
})

const hasOwnerScope = computed(
  () => ownerContext.value != null && ownerContext.value.ownerType !== 'conversation'
)

const hasConversationScope = computed(() => chatStore.activeConversationId != null)

const ownerScopeLabel = computed(() => {
  if (!ownerContext.value) return ''
  return t(ownerScopeLabelKey(ownerContext.value.ownerType))
})

function defaultScope(): 'conversation' | 'owner' {
  return hasOwnerScope.value ? 'owner' : 'conversation'
}

async function loadPlans(): Promise<void> {
  loading.value = true
  try {
    if (
      scope.value === 'owner' &&
      ownerContext.value &&
      ownerContext.value.ownerType !== 'conversation'
    ) {
      plans.value = await window.agentAPI.plans.list({
        ownerType: ownerContext.value.ownerType,
        ownerId: ownerContext.value.ownerId
      })
      return
    }

    const convId = chatStore.activeConversationId
    if (!convId) {
      plans.value = []
      return
    }

    plans.value = await window.agentAPI.plans.list({ conversationId: convId })
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    scope.value = defaultScope()
    void loadPlans()
  }
)

watch(scope, () => {
  if (props.visible) void loadPlans()
})

watch(resolvedProjectId, () => {
  if (!props.visible || scope.value !== 'owner') return
  void loadPlans()
})

function handleSelect(plan: PlanInfo): void {
  emit('select', { id: plan.id, title: plan.title })
  emit('close')
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div v-if="visible" class="plan-picker-overlay" @click.self="emit('close')">
    <div class="plan-picker">
      <div class="plan-picker-header">
        <span class="plan-picker-title">{{ t('composer.planPicker.title') }}</span>
        <button type="button" class="plan-picker-close" @click="emit('close')">&times;</button>
      </div>

      <div class="plan-picker-toolbar">
        <select v-model="scope" class="scope-select">
          <option v-if="hasOwnerScope" value="owner">{{ ownerScopeLabel }}</option>
          <option v-if="hasConversationScope" value="conversation">
            {{ t('plans.scopeConversation') }}
          </option>
        </select>
      </div>

      <div v-if="loading" class="plan-picker-empty">{{ t('plans.loading') }}</div>
      <div v-else-if="plans.length === 0" class="plan-picker-empty">{{ t('plans.empty') }}</div>
      <div v-else class="plan-picker-list elegant-scroll">
        <button
          v-for="plan in plans"
          :key="plan.id"
          type="button"
          class="plan-picker-item"
          @click="handleSelect(plan)"
        >
          <span class="plan-picker-item-title">{{ plan.title }}</span>
          <span class="plan-picker-item-time">{{ formatTime(plan.createdAt) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.plan-picker {
  width: min(420px, calc(100vw - 32px));
  max-height: min(480px, calc(100vh - 64px));
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.plan-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--sidebar-border);
}

.plan-picker-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--content-text);
}

.plan-picker-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: 18px;
  cursor: pointer;
}

.plan-picker-close:hover {
  background: var(--sidebar-item-hover);
}

.plan-picker-toolbar {
  padding: 8px 14px;
  border-bottom: 1px solid var(--sidebar-border);
}

.scope-select {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-sm);
  background: var(--content-bg);
  color: var(--content-text);
  font-size: var(--font-size-xs);
}

.plan-picker-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
}

.plan-picker-list {
  overflow-y: auto;
  padding: 6px;
}

.plan-picker-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.plan-picker-item:hover {
  background: var(--sidebar-item-hover);
}

.plan-picker-item-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--content-text);
}

.plan-picker-item-time {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}
</style>
