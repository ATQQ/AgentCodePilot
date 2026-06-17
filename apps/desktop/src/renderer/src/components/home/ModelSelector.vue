<script setup lang="ts">
import { computed } from 'vue'
import { useModelStore } from '@renderer/stores/model.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useChatStore } from '@renderer/stores/chat.store'

const props = withDefaults(
  defineProps<{ compact?: boolean }>(),
  { compact: false }
)

const modelStore = useModelStore()
const agentStore = useAgentStore()
const chatStore = useChatStore()

const activeAgentId = computed(
  () => chatStore.activeConversation?.agentId ?? agentStore.selectedAgentId
)

const showSelector = computed(() => activeAgentId.value === 'claude-code')

const currentModelId = computed(() =>
  modelStore.getEffectiveModelId(chatStore.activeConversation?.modelId)
)

const currentModelName = computed(() => modelStore.getModelName(currentModelId.value))

function handleSelect(modelId: string): void {
  if (chatStore.activeConversationId) {
    void chatStore.setConversationModelId(chatStore.activeConversationId, modelId)
    return
  }
  void modelStore.selectDefaultModel(modelId)
}
</script>

<template>
  <div v-if="showSelector" class="model-selector">
    <el-dropdown trigger="click" @command="handleSelect">
      <button class="model-btn" :class="{ 'model-btn--compact': props.compact }" :title="currentModelName">
        <span class="model-name">{{ props.compact ? currentModelName.slice(0, 1) : currentModelName }}</span>
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
  max-width: 160px;
}

.model-btn--compact {
  max-width: 72px;
  padding: 4px 6px;
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
