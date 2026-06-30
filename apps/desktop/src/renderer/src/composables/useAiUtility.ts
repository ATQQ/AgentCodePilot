import { computed, ref, watch, type Ref } from 'vue'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useAgentStore } from '@renderer/stores/agent.store'
import { useModelStore } from '@renderer/stores/model.store'
import { usePanelContextStore } from '@renderer/stores/panelContext.store'
import { useChatStore } from '@renderer/stores/chat.store'
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from '@renderer/constants/defaults'

export type AiUtilityKey = 'commitMessage' | 'autoCommit'

export function useAiUtility(): {
  running: Ref<boolean>
  error: Ref<string | null>
  generateCommitMessage: () => Promise<string | null>
} {
  const settingsStore = useSettingsStore()
  const agentStore = useAgentStore()
  const modelStore = useModelStore()
  const panelContext = usePanelContextStore()
  const chatStore = useChatStore()
  const running = ref(false)
  const error = ref<string | null>(null)

  const systemPrompt = computed(() => {
    const custom = settingsStore.aiPrompts.commitMessage?.trim()
    return custom || DEFAULT_COMMIT_MESSAGE_PROMPT
  })

  function resolveConversationAgentId(): string {
    const conv = chatStore.activeConversation
    const convId = chatStore.activeConversationId
    return (
      conv?.agentId ??
      (convId ? chatStore.getPendingAgent(convId) : undefined) ??
      agentStore.selectedAgentId ??
      'claude-code'
    )
  }

  function resolveConversationModelId(): string {
    return modelStore.getEffectiveModelId(chatStore.activeConversation?.modelId)
  }

  async function generateCommitMessage(): Promise<string | null> {
    const cwd = panelContext.effectivePanelCwd
    if (!cwd) {
      error.value = '请先选择项目'
      return null
    }

    running.value = true
    error.value = null
    try {
      const [stagedDiff, recentLog] = await Promise.all([
        window.agentAPI.git.stagedDiff(cwd),
        window.agentAPI.git.recentLog(cwd, 10)
      ])

      if (!stagedDiff.trim()) {
        error.value = '没有已暂存的变更'
        return null
      }

      const userPrompt = [
        'Analyze the following staged git changes and write a commit message.',
        '',
        '## Staged diff',
        '```diff',
        stagedDiff.slice(0, 12000),
        stagedDiff.length > 12000 ? '\n... (truncated)' : '',
        '```',
        '',
        '## Recent commits (for style reference)',
        recentLog.length ? recentLog.join('\n') : '(none)',
        '',
        'Output only the commit message in Conventional Commits format (English).'
      ].join('\n')

      const result = await window.agentAPI.agent.runUtility({
        systemPrompt: systemPrompt.value,
        userPrompt,
        cwd,
        agentId: resolveConversationAgentId(),
        modelId: resolveConversationModelId()
      })

      const message = result
        .replace(/^```[\w]*\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim()

      if (!message) {
        error.value = '未生成有效提交消息'
        return null
      }

      return message
    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败'
      return null
    } finally {
      running.value = false
    }
  }

  watch(
    () => panelContext.effectivePanelCwd,
    () => {
      error.value = null
    }
  )

  return {
    running,
    error,
    generateCommitMessage
  }
}
