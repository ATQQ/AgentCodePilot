<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useModelStore } from '@renderer/stores/model.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useChatStore } from '@renderer/stores/chat.store'

const router = useRouter()
const modelStore = useModelStore()
const agentStore = useAgentStore()
const chatStore = useChatStore()

onMounted(() => {
  if (agentStore.selectedAgentId) {
    void modelStore.fetchCatalog(agentStore.selectedAgentId)
  }
})

const activeAgentId = computed(() => agentStore.selectedAgentId)

const showSelector = computed(() => ['claude-code', 'codex'].includes(activeAgentId.value))

const gatewayProviders = computed(() => modelStore.getGatewayProvidersForAgent(activeAgentId.value))

const gatewayOptions = computed(() =>
  gatewayProviders.value.map((provider) => {
    const modelIds = [...(provider.config.models ?? [])]
    if (provider.config.defaultModel && !modelIds.includes(provider.config.defaultModel)) {
      modelIds.unshift(provider.config.defaultModel)
    }
    return {
      value: provider.id,
      label: provider.name,
      children: modelIds.map((modelId) => ({ value: modelId, label: modelId }))
    }
  })
)

const currentGatewaySelection = computed(() =>
  modelStore.getEffectiveGatewaySelection(
    chatStore.activeConversation?.providerId,
    chatStore.activeConversation?.modelId,
    activeAgentId.value
  )
)

const currentGatewayPath = computed(() => {
  const selection = currentGatewaySelection.value
  return selection ? [selection.providerId, selection.modelId] : []
})

const currentModelId = computed(() =>
  modelStore.getEffectiveModelId(chatStore.activeConversation?.modelId)
)

const currentModelName = computed(() => modelStore.getModelName(currentModelId.value))

async function handleGatewaySelect(value: unknown): Promise<void> {
  if (!Array.isArray(value) || value.length !== 2) return
  const [providerId, modelId] = value
  if (typeof providerId !== 'string' || typeof modelId !== 'string') return
  modelStore.selectGatewayProviderModel(activeAgentId.value, providerId, modelId)
  if (chatStore.activeConversationId) {
    await chatStore.setConversationProviderModel(
      chatStore.activeConversationId,
      providerId,
      modelId
    )
  }
}

function handleSelect(modelId: string): void {
  if (chatStore.activeConversationId) {
    void chatStore.setConversationModelId(chatStore.activeConversationId, modelId)
    return
  }
  void modelStore.selectDefaultModel(modelId, activeAgentId.value)
}

const needsGatewayConfig = computed(
  () => modelStore.gatewayEnabled && gatewayOptions.value.length === 0
)

function openGatewayProviderSettings(): void {
  void router.push({ path: '/settings', query: { section: 'gateway', tab: 'providers' } })
}
</script>

<template>
  <div v-if="showSelector" class="model-selector">
    <Transition name="model-notice">
      <div v-if="modelStore.switchNotice" class="model-switch-notice">
        <span class="model-switch-from" :title="modelStore.switchNotice.from">
          {{ modelStore.switchNotice.from }}
        </span>
        <span class="model-switch-arrow">→</span>
        <span class="model-switch-to" :title="modelStore.switchNotice.to">
          {{ modelStore.switchNotice.to }}
        </span>
      </div>
    </Transition>
    <button
      v-if="needsGatewayConfig"
      type="button"
      class="model-config-link"
      title="点击前往 API Gateway 配置 Provider 和模型"
      @click="openGatewayProviderSettings"
    >
      <span class="model-config-label">请配置 Provider 和模型</span>
      <span class="model-config-action">去设置</span>
    </button>
    <el-cascader
      v-else-if="modelStore.gatewayEnabled"
      class="provider-model-cascader"
      :model-value="currentGatewayPath"
      :options="gatewayOptions"
      :props="{ expandTrigger: 'hover' }"
      :show-all-levels="true"
      separator=" / "
      placeholder="请配置 Provider 和模型"
      :clearable="false"
      @change="handleGatewaySelect"
    />
    <el-dropdown trigger="click" @command="handleSelect">
      <button v-if="!modelStore.gatewayEnabled" class="model-btn" :title="currentModelName">
        <span class="model-name">{{ currentModelName }}</span>
        <span class="chevron">&#x25BE;</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu v-if="!modelStore.gatewayEnabled">
          <el-dropdown-item
            v-for="model in modelStore.models"
            :key="model.id"
            :command="model.id"
            :class="{ active: model.id === currentModelId }"
          >
            <div class="model-option">
              <span class="model-option-name">{{ model.name }}</span>
              <span class="model-option-desc">{{ model.description }}</span>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.model-selector {
  position: relative;
}

.model-config-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 280px;
  min-height: 28px;
  padding: 3px 6px 3px 10px;
  border: 1px solid color-mix(in srgb, var(--content-text-secondary) 22%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--content-text-secondary) 6%, transparent);
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.model-config-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-config-action {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: calc(var(--radius-md) - 2px);
  background: color-mix(in srgb, var(--composer-border-focus) 14%, transparent);
  color: var(--composer-border-focus);
  font-size: 11px;
  font-weight: 500;
  transition: background 0.15s;
}

.model-config-link:hover {
  border-color: color-mix(in srgb, var(--composer-border-focus) 40%, transparent);
  background: color-mix(in srgb, var(--composer-border-focus) 8%, transparent);
  color: var(--content-text);
}

.model-config-link:hover .model-config-action {
  background: color-mix(in srgb, var(--composer-border-focus) 22%, transparent);
}

.provider-model-cascader {
  width: 250px;
}

:deep(.provider-model-cascader .el-input__wrapper) {
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  background: transparent;
  box-shadow: none;
}

:deep(.provider-model-cascader .el-input__inner) {
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
}

:deep(.provider-model-cascader .el-input__wrapper:hover) {
  background: var(--btn-ghost-hover);
  box-shadow: none;
}

.model-switch-notice {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: min(360px, 72vw);
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--composer-border-focus) 12%, var(--content-bg));
  border: 1px solid color-mix(in srgb, var(--composer-border-focus) 35%, transparent);
  color: var(--composer-border-focus);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
  pointer-events: none;
}

.model-switch-from,
.model-switch-to {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.model-switch-arrow {
  flex-shrink: 0;
  opacity: 0.75;
}

.model-notice-enter-active,
.model-notice-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.model-notice-enter-from,
.model-notice-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--content-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 180px;
}

.model-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-btn:hover {
  background: var(--btn-ghost-hover);
}

.chevron {
  font-size: 10px;
  opacity: 0.5;
  flex-shrink: 0;
}

.model-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
}

.model-option-name {
  font-size: var(--font-size-sm);
  color: var(--content-text);
}

.model-option-desc {
  font-size: 11px;
  color: var(--content-text-tertiary);
  line-height: 1.3;
}

:deep(.el-dropdown-menu__item.active) {
  background: var(--btn-ghost-hover);
}
</style>
