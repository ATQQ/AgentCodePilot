<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useChatStore } from '@renderer/stores/chat.store'
import { useWorkspaceStore } from '@renderer/stores/workspace.store'
import { formatRelativeTime } from '@renderer/composables/useRelativeTime'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const filteredConversations = computed(() => {
  const all = chatStore.conversations.filter((c) => !c.archived)
  const sorted = [...all].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
  if (!query.value.trim()) return sorted.slice(0, 20)
  const q = query.value.toLowerCase()
  return sorted.filter((c) => {
    const title = c.title || c.messages[0]?.content || ''
    return title.toLowerCase().includes(q)
  })
})

function getProjectName(projectId: string | null): string {
  if (!projectId) return ''
  const proj = workspaceStore.projects.find((p) => p.id === projectId)
  return proj?.name || ''
}

function getTitle(conv: { title: string; messages: { content: string }[] }): string {
  if (conv.title) return conv.title
  if (conv.messages.length > 0) {
    const first = conv.messages[0].content
    return first.length > 40 ? first.slice(0, 40) + '...' : first
  }
  return '未命名对话'
}

function selectConversation(id: string): void {
  chatStore.setActive(id)
  router.push('/chat')
  emit('close')
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredConversations.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const conv = filteredConversations.value[selectedIndex.value]
    if (conv) selectConversation(conv.id)
  }
}

watch(query, () => {
  selectedIndex.value = 0
})

watch(
  () => props.visible,
  (val) => {
    if (val) {
      query.value = ''
      selectedIndex.value = 0
      nextTick(() => inputRef.value?.focus())
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="search-fade">
      <div v-if="visible" class="search-overlay" @mousedown.self="emit('close')">
        <div class="search-dialog" @keydown="handleKeydown">
          <div class="search-input-wrap">
            <el-icon :size="16" class="search-icon"><Search /></el-icon>
            <input
              ref="inputRef"
              v-model="query"
              class="search-input"
              placeholder="搜索对话..."
              @keydown.esc="emit('close')"
            />
            <kbd class="search-kbd">ESC</kbd>
          </div>
          <div v-if="filteredConversations.length" class="search-results elegant-scroll">
            <div class="results-label">{{ query ? '搜索结果' : '近期对话' }}</div>
            <div
              v-for="(conv, idx) in filteredConversations"
              :key="conv.id"
              class="result-item"
              :class="{ selected: idx === selectedIndex }"
              @click="selectConversation(conv.id)"
              @mouseenter="selectedIndex = idx"
            >
              <span class="result-title">{{ getTitle(conv) }}</span>
              <span v-if="getProjectName(conv.projectId)" class="result-project">{{ getProjectName(conv.projectId) }}</span>
              <span class="result-time">{{ formatRelativeTime(conv.updatedAt) }}</span>
            </div>
          </div>
          <div v-else class="search-empty">
            <span>无匹配对话</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  padding-top: 20vh;
  z-index: 9999;
}

.search-dialog {
  width: 480px;
  max-height: 420px;
  background: var(--content-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-xl);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-self: flex-start;
}

.search-input-wrap {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 14px 16px;
  border-bottom: 1px solid var(--sidebar-border);
}

.search-icon {
  color: var(--content-text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--content-text);
}

.search-input::placeholder {
  color: var(--composer-placeholder);
}

.search-kbd {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--btn-secondary-bg);
  color: var(--content-text-secondary);
  font-family: inherit;
  border: none;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs) 0;
}

.results-label {
  padding: var(--spacing-xs) 16px;
  font-size: var(--font-size-xs);
  color: var(--content-text-tertiary);
  font-weight: 500;
}

.result-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.result-item:hover,
.result-item.selected {
  background: var(--sidebar-item-hover);
}

.result-title {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--content-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-project {
  font-size: 11px;
  color: var(--content-text-tertiary);
  background: var(--btn-secondary-bg);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.result-time {
  font-size: 11px;
  color: var(--content-text-tertiary);
  flex-shrink: 0;
}

.search-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--content-text-tertiary);
  font-size: var(--font-size-sm);
}

.search-fade-enter-active {
  transition: opacity 0.15s;
}

.search-fade-leave-active {
  transition: opacity 0.12s;
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

.search-fade-enter-active .search-dialog {
  animation: search-pop-in 0.15s ease-out;
}

@keyframes search-pop-in {
  from {
    transform: scale(0.96) translateY(-8px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>
