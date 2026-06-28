<script setup lang="ts">
import { computed } from 'vue'
import { useModelStore } from '@renderer/stores/model.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useChatStore } from '@renderer/stores/chat.store'

const modelStore = useModelStore()
const agentStore = useAgentStore()
const chatStore = useChatStore()

const activeAgentId = computed(() => agentStore.selectedAgentId)

const showSelector = computed(() =>
  ['claude-code', 'codex', 'cursor'].includes(activeAgentId.value)
)

const currentModelId = computed(() =>
  modelStore.getEffectiveModelId(chatStore.activeConversation?.modelId)
)

const currentModelName = computed(() => modelStore.getModelName(currentModelId.value))

function handleSelect(modelId: string): void {
  if (chatStore.activeConversationId) {
    void chatStore.setConversationModelId(chatStore.activeConversationId, modelId)
    return
  }
  void modelStore.selectDefaultModel(modelId, activeAgentId.value)
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
    <el-dropdown trigger="click" @command="handleSelect">
      <button class="model-btn" :title="currentModelName">
        <span class="model-name">{{ currentModelName }}</span>
        <span class="chevron">&#x25BE;</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
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
