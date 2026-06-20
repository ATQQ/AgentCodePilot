<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownRender from 'markstream-vue'
import { usePlanStore } from '@renderer/stores/plan.store'
import { useLayoutStore } from '@renderer/stores/layout.store'
import { useChatStore } from '@renderer/stores/chat.store'
import { useComposerStore } from '@renderer/stores/composer.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { ownerScopeLabelKey, resolvePlanOwnerFromProjectId } from '@renderer/utils/planOwner'
import { CODE_BLOCK_PROPS } from '@renderer/constants/codeBlockTheme'
import { ensureMarkstreamPeers } from '@renderer/markstream-setup'

const { t } = useI18n()
const planStore = usePlanStore()
const layoutStore = useLayoutStore()
const chatStore = useChatStore()
const composerStore = useComposerStore()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const ownerContext = computed(() => {
  const rawId = layoutStore.plansOwnerId ?? chatStore.activeConversation?.projectId
  if (!rawId) return null
  if (layoutStore.plansOwnerType && layoutStore.plansOwnerId) {
    return { ownerType: layoutStore.plansOwnerType, ownerId: layoutStore.plansOwnerId }
  }
  return resolvePlanOwnerFromProjectId(rawId, workspaceStore)
})

const hasOwnerScope = computed(
  () => ownerContext.value != null && ownerContext.value.ownerType !== 'conversation'
)

const ownerScopeLabel = computed(() => {
  if (!ownerContext.value) return ''
  return t(ownerScopeLabelKey(ownerContext.value.ownerType))
})

const isDark = computed(() => {
  if (settingsStore.theme === 'dark') return true
  if (settingsStore.theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
})

async function refreshPlans(): Promise<void> {
  const conv = chatStore.activeConversation
  const owner = ownerContext.value

  if (layoutStore.plansScope === 'owner' && owner && owner.ownerType !== 'conversation') {
    await planStore.loadPlans(conv?.id ?? null, owner.ownerType, owner.ownerId, 'owner')
  } else if (conv) {
    await planStore.loadPlans(
      conv.id,
      owner?.ownerType ?? null,
      owner?.ownerId ?? null,
      'conversation'
    )
  } else if (owner && owner.ownerType !== 'conversation') {
    await planStore.loadPlans(null, owner.ownerType, owner.ownerId, 'owner')
  } else {
    planStore.reset()
    return
  }

  if (layoutStore.activePlanId) {
    await planStore.selectPlan(layoutStore.activePlanId)
    layoutStore.activePlanId = null
  }
}

onMounted(() => {
  void ensureMarkstreamPeers()
  void refreshPlans()
})

watch(
  () => chatStore.activeConversationId,
  () => {
    void refreshPlans()
  }
)

watch(
  () => [layoutStore.plansScope, layoutStore.plansOwnerType, layoutStore.plansOwnerId] as const,
  () => {
    void refreshPlans()
  }
)

watch(
  () => planStore.plans.length,
  () => {
    if (
      layoutStore.activePlanId &&
      planStore.plans.some((p) => p.id === layoutStore.activePlanId)
    ) {
      void planStore.selectPlan(layoutStore.activePlanId)
      layoutStore.activePlanId = null
    }
  }
)

watch(
  () => chatStore.isStreaming,
  (streaming, wasStreaming) => {
    if (wasStreaming && !streaming && planStore.activePlanId) {
      void planStore.loadPlanContent(planStore.activePlanId)
    }
  }
)

async function handleScopeChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as 'conversation' | 'owner'
  layoutStore.plansScope = value
  await planStore.setScope(value)
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function handleReferencePlan(): void {
  const plan = planStore.activePlan
  if (!plan) return
  composerStore.addPlanReference({ id: plan.id, title: plan.title })
}

function handleExecutePlan(): void {
  const plan = planStore.activePlan
  if (!plan || !chatStore.activeConversationId) return
  composerStore.executePlan({ id: plan.id, title: plan.title }, t('plans.executePlanMessage'))
}

async function handleCopyPlan(): Promise<void> {
  if (!planStore.activePlanContent) return
  await navigator.clipboard.writeText(planStore.activePlanContent)
}
</script>

<template>
  <div class="plans-panel">
    <div class="plans-toolbar">
      <select class="scope-select" :value="planStore.scope" @change="handleScopeChange">
        <option value="conversation">{{ t('plans.scopeConversation') }}</option>
        <option v-if="hasOwnerScope" value="owner">{{ ownerScopeLabel }}</option>
      </select>
    </div>

    <div v-if="planStore.loading" class="plans-empty">
      {{ t('plans.loading') }}
    </div>
    <div v-else-if="planStore.plans.length === 0" class="plans-empty">
      {{ t('plans.empty') }}
    </div>
    <template v-else>
      <div class="plans-list elegant-scroll">
        <button
          v-for="plan in planStore.plans"
          :key="plan.id"
          class="plan-item"
          :class="{ active: planStore.activePlanId === plan.id }"
          @click="planStore.selectPlan(plan.id)"
        >
          <span class="plan-item-title">{{ plan.title }}</span>
          <span class="plan-item-time">{{ formatTime(plan.createdAt) }}</span>
        </button>
      </div>

      <div v-if="planStore.activePlan" class="plan-preview">
        <div class="plan-preview-actions">
          <button class="action-btn" @click="handleReferencePlan">
            {{ t('plans.referenceToChat') }}
          </button>
          <button class="action-btn action-btn--primary" @click="handleExecutePlan">
            {{ t('plans.executePlan') }}
          </button>
          <button class="action-btn action-btn--secondary" @click="handleCopyPlan">
            {{ t('plans.copy') }}
          </button>
        </div>
        <div class="plan-preview-content elegant-scroll">
          <MarkdownRender
            mode="docs"
            custom-id="plans"
            :content="planStore.activePlanContent"
            :final="true"
            :is-dark="isDark"
            :batch-rendering="true"
            :render-batch-size="16"
            :render-batch-delay="8"
            :code-block-props="CODE_BLOCK_PROPS"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.plans-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.plans-toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
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

.plans-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.plans-list {
  flex-shrink: 0;
  max-height: 160px;
  overflow-y: auto;
  border-bottom: 1px solid var(--sidebar-border);
}

.plan-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--sidebar-border);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.plan-item:last-child {
  border-bottom: none;
}

.plan-item:hover {
  background: var(--sidebar-item-hover);
}

.plan-item.active {
  background: var(--sidebar-item-active);
}

.plan-item-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--content-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.plan-item-time {
  font-size: var(--font-size-xs);
  color: var(--content-text-secondary);
}

.plan-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.plan-preview-actions {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.action-btn {
  padding: 4px 10px;
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
  color: var(--accent-color);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: background 0.15s;
}

.action-btn:hover {
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
}

.action-btn--primary {
  background: var(--accent-color);
  color: var(--btn-primary-text, #fff);
  border-color: var(--accent-color);
}

.action-btn--primary:hover {
  opacity: 0.9;
  background: var(--accent-color);
}

.action-btn--secondary {
  border-color: var(--sidebar-border);
  background: transparent;
  color: var(--content-text-secondary);
}

.action-btn--secondary:hover {
  background: var(--sidebar-item-hover);
  color: var(--content-text);
}

.plan-preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-size: var(--font-size-sm);
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}

.plan-preview-content :deep(.markstream-vue),
.plan-preview-content :deep(.markstream-vue *) {
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}
</style>
