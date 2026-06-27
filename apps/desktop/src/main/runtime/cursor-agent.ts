import { app } from 'electron'
import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { AgentAdapter, AgentRunInput } from './types'
import { resolveConfiguredApiKey, resolveEnvValue } from './agent-auth'
import { getAgentConfig } from './agent-config'
import { buildAgentPrompt, withWorkspaceContext } from './agent-prompt'
import { hasLocalCursorCliConfig } from './cursor-cli-auth'
import { loadCursorSdk } from './cursor-sdk-loader'
import { isCursorRuntimeSupported } from './cursor-runtime'

type SDKAgent = Awaited<ReturnType<(typeof import('@cursor/sdk'))['Agent']['create']>>
type SDKMessage = import('@cursor/sdk').SDKMessage

export class CursorAgentAdapter implements AgentAdapter {
  readonly id = 'cursor'
  readonly name = 'Cursor'
  readonly enabled: boolean

  private abortControllers = new Map<string, AbortController>()
  private activeRuns = new Map<string, { cancel: () => Promise<void> }>()
  private agentHandles = new Map<string, SDKAgent>()
  private assistantTextEmitted = new Map<string, number>()
  private toolStarted = new Set<string>()

  constructor() {
    this.enabled = isCursorRuntimeSupported()
  }

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    if (!this.enabled) {
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: 'Cursor SDK 需要 Node.js 22.13 或更高版本。'
      })
      return
    }

    try {
      await this.runOnce(input, emit)
    } catch (error: unknown) {
      const { CursorAgentError } = await loadCursorSdk()
      if (error instanceof CursorAgentError) {
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: `${error.message}${error.isRetryable ? '（可重试）' : ''}`
        })
        return
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: errorMessage
      })
    }
  }

  private async runOnce(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const configuredApiKey = resolveConfiguredApiKey('cursor')
    const envApiKey = resolveEnvValue(['CURSOR_API_KEY'])
    const usesLocalCliProfile = hasLocalCursorCliConfig()

    if (!configuredApiKey && !envApiKey && !usesLocalCliProfile) {
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        messageId: input.messageId,
        error:
          '缺少 Cursor 鉴权。请在设置中配置 API Key、设置 CURSOR_API_KEY，或先在终端运行 agent login 完成本地登录。'
      })
      return
    }

    const apiKey = configuredApiKey || (!usesLocalCliProfile ? envApiKey : undefined)

    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)
    this.assistantTextEmitted.set(input.conversationId, 0)
    this.toolStarted.clear()

    emit({
      type: 'message.started',
      conversationId: input.conversationId,
      messageId: input.messageId
    })

    const cursorConfig = getAgentConfig('cursor').cursor
    const approvalLevel = input.approvalLevel ?? 'auto'
    const cwd = input.cwd || app.getPath('home')
    const modelId = input.model || cursorConfig?.defaultModelId || 'composer-2.5'
    const prompt = withWorkspaceContext(
      buildAgentPrompt(input, input.agentSessionId ?? undefined),
      input.workspaceFolders
    )

    const agent = await this.resolveAgent(input, apiKey, modelId, cwd, approvalLevel, cursorConfig, emit)

    const run = await agent.send(prompt, {
      model: { id: modelId },
      mode: input.planMode ? 'plan' : cursorConfig?.mode,
      onDelta: async ({ update }) => {
        if (controller.signal.aborted) return
        if (update.type === 'text-delta' && update.text) {
          emit({
            type: 'message.delta',
            conversationId: input.conversationId,
            messageId: input.messageId,
            delta: update.text
          })
        }
      }
    })

    this.activeRuns.set(input.conversationId, {
      cancel: async () => {
        if (run.supports('cancel')) {
          await run.cancel()
        }
      }
    })

    let usage: TokenUsage | undefined

    try {
      for await (const event of run.stream()) {
        if (controller.signal.aborted) break
        usage = this.handleStreamEvent(event, input, emit, usage) ?? usage
      }

      const result = await run.wait()
      if (result.status === 'error') {
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: result.result || 'Cursor agent run failed'
        })
        return
      }

      emit({
        type: 'message.completed',
        conversationId: input.conversationId,
        messageId: input.messageId,
        usage,
        stopped: controller.signal.aborted || result.status === 'cancelled' || undefined
      })
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        emit({
          type: 'message.completed',
          conversationId: input.conversationId,
          messageId: input.messageId,
          stopped: true
        })
      } else {
        throw error
      }
    } finally {
      this.activeRuns.delete(input.conversationId)
      this.abortControllers.delete(input.conversationId)
    }
  }

  private async resolveAgent(
    input: AgentRunInput,
    apiKey: string | undefined,
    modelId: string,
    cwd: string,
    approvalLevel: NonNullable<AgentRunInput['approvalLevel']>,
    cursorConfig: ReturnType<typeof getAgentConfig>['cursor'],
    emit: (event: AgentEvent) => void
  ): Promise<SDKAgent> {
    const existing = this.agentHandles.get(input.conversationId)
    if (existing) return existing

    const { Agent } = await loadCursorSdk()
    const sessionId = input.agentSessionId ?? undefined
    const settingSources = cursorConfig?.settingSources

    const localOptions = {
      cwd,
      autoReview: cursorConfig?.autoReview ?? approvalLevel === 'request',
      ...(settingSources?.length ? { settingSources } : {})
    }

    const authOptions = apiKey ? { apiKey } : {}

    const agent = sessionId
      ? await Agent.resume(sessionId, {
          ...authOptions,
          model: { id: modelId },
          local: localOptions
        })
      : await Agent.create({
          ...authOptions,
          model: { id: modelId },
          local: localOptions,
          mode: input.planMode ? 'plan' : cursorConfig?.mode
        })

    this.agentHandles.set(input.conversationId, agent)
    emit({
      type: 'session.updated',
      conversationId: input.conversationId,
      sessionId: agent.agentId
    })
    return agent
  }

  private handleStreamEvent(
    event: SDKMessage,
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    usage: TokenUsage | undefined
  ): TokenUsage | undefined {
    switch (event.type) {
      case 'assistant':
        for (const block of event.message.content) {
          if (block.type !== 'text') continue
          const key = input.conversationId
          const emitted = this.assistantTextEmitted.get(key) ?? 0
          if (block.text.length > emitted) {
            emit({
              type: 'message.delta',
              conversationId: input.conversationId,
              messageId: input.messageId,
              delta: block.text.slice(emitted)
            })
            this.assistantTextEmitted.set(key, block.text.length)
          }
        }
        break
      case 'thinking':
        if (event.text) {
          emit({
            type: 'message.delta',
            conversationId: input.conversationId,
            messageId: input.messageId,
            delta: event.text
          })
        }
        break
      case 'tool_call':
        this.handleToolCall(event, input, emit)
        break
      case 'status':
        if (event.status === 'ERROR') {
          emit({
            type: 'message.error',
            conversationId: input.conversationId,
            messageId: input.messageId,
            error: event.message || 'Cursor agent status error'
          })
        }
        break
      default:
        break
    }

    return usage
  }

  private handleToolCall(
    event: Extract<SDKMessage, { type: 'tool_call' }>,
    input: AgentRunInput,
    emit: (event: AgentEvent) => void
  ): void {
    const toolUseId = event.call_id

    if (event.status === 'running' && !this.toolStarted.has(toolUseId)) {
      this.toolStarted.add(toolUseId)
      emit({
        type: 'tool.started',
        conversationId: input.conversationId,
        messageId: input.messageId,
        tool: {
          toolUseId,
          toolName: event.name,
          input: (event.args as Record<string, unknown>) || {},
          status: 'pending'
        }
      })
      return
    }

    if (event.status === 'completed' || event.status === 'error') {
      emit({
        type: 'tool.completed',
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolUseId,
        summary:
          event.status === 'error'
            ? JSON.stringify(event.result ?? 'Tool error')
            : typeof event.result === 'string'
              ? event.result
              : JSON.stringify(event.result ?? {})
      })
    }
  }

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
    }

    const activeRun = this.activeRuns.get(conversationId)
    if (activeRun) {
      void activeRun.cancel()
      this.activeRuns.delete(conversationId)
    }
  }

  async disposeConversation(conversationId: string): Promise<void> {
    const agent = this.agentHandles.get(conversationId)
    if (agent) {
      await agent[Symbol.asyncDispose]()
      this.agentHandles.delete(conversationId)
    }
  }
}
