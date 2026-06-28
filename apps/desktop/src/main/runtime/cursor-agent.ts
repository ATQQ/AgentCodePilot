import { app } from 'electron'
import type { ChildProcess } from 'child_process'
import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { AgentAdapter, AgentRunInput } from './types'
import { logError, logInfo, logWarn, getLogPath } from '../logger'
import { resolveConfiguredApiKey, resolveEnvValue } from './agent-auth'
import { getAgentConfig } from './agent-config'
import { buildAgentPrompt, withWorkspaceContext } from './agent-prompt'
import { runCursorViaCli } from './cursor-cli-runner'
import { hasLocalCursorCliConfig } from './cursor-cli-auth'
import { isSdkSessionId, resolveAgentExecutablePath } from './cursor-executable'
import { loadCursorSdk } from './cursor-sdk-loader'
import { isCursorRuntimeSupported } from './cursor-runtime'
import { mapSdkTokenUsage } from './token-usage'

type SDKAgent = Awaited<ReturnType<(typeof import('@cursor/sdk'))['Agent']['create']>>
type SDKMessage = import('@cursor/sdk').SDKMessage

const LOG_CATEGORY = 'CursorAgent'

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'string' && v.length > 800) return `${v.slice(0, 800)}…`
      return v
    })
  } catch {
    return String(value)
  }
}

function summarizeStreamEvent(event: SDKMessage): Record<string, unknown> {
  switch (event.type) {
    case 'assistant':
      return {
        type: event.type,
        agent_id: event.agent_id,
        run_id: event.run_id,
        textLength: event.message.content
          .filter((block) => block.type === 'text')
          .reduce((sum, block) => sum + block.text.length, 0)
      }
    case 'thinking':
      return {
        type: event.type,
        agent_id: event.agent_id,
        run_id: event.run_id,
        textLength: event.text.length,
        thinking_duration_ms: event.thinking_duration_ms
      }
    case 'tool_call':
      return {
        type: event.type,
        agent_id: event.agent_id,
        run_id: event.run_id,
        call_id: event.call_id,
        name: event.name,
        status: event.status,
        args: event.args,
        result: event.result
      }
    case 'status':
      return {
        type: event.type,
        agent_id: event.agent_id,
        run_id: event.run_id,
        status: event.status,
        message: event.message
      }
    default:
      return event as unknown as Record<string, unknown>
  }
}

function formatStatusError(event: Extract<SDKMessage, { type: 'status' }>): string {
  const parts = ['Cursor agent status error']
  if (event.message?.trim()) parts.push(event.message.trim())
  parts.push(`run_id=${event.run_id}`)
  parts.push(`agent_id=${event.agent_id}`)
  return parts.join(' · ')
}

export class CursorAgentAdapter implements AgentAdapter {
  readonly id = 'cursor'
  readonly name = 'Cursor'
  readonly enabled: boolean

  private abortControllers = new Map<string, AbortController>()
  private activeRuns = new Map<string, { cancel: () => Promise<void> }>()
  private agentHandles = new Map<string, SDKAgent>()
  private assistantTextEmitted = new Map<string, number>()
  private toolStarted = new Set<string>()
  private toolStartedAt = new Map<string, string>()
  private toolElapsedSeconds = new Map<string, number>()
  private cliProcesses = new Map<string, ChildProcess>()

  constructor() {
    this.enabled = isCursorRuntimeSupported()
    logInfo(
      LOG_CATEGORY,
      `Adapter initialized: enabled=${this.enabled}, node=${process.version}, runtimeSupported=${isCursorRuntimeSupported()}`
    )
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
        logError(
          LOG_CATEGORY,
          `CursorAgentError: conv=${input.conversationId}, msg=${input.messageId}, retryable=${error.isRetryable}, message=${error.message}`,
          error
        )
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: `${error.message}${error.isRetryable ? '（可重试）' : ''}`
        })
        return
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError(
        LOG_CATEGORY,
        `Unhandled run error: conv=${input.conversationId}, msg=${input.messageId}, message=${errorMessage}`,
        error
      )
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
      logWarn(
        LOG_CATEGORY,
        `Missing auth: conv=${input.conversationId}, configuredApiKey=${Boolean(configuredApiKey)}, envApiKey=${Boolean(envApiKey)}, localCliProfile=${usesLocalCliProfile}`
      )
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

    logInfo(
      LOG_CATEGORY,
      `Run start: conv=${input.conversationId}, msg=${input.messageId}, auth=${apiKey ? 'api-key' : usesLocalCliProfile ? 'local-cli' : 'none'}, model=${input.model ?? '(default)'}, cwd=${input.cwd ?? '(home)'}, resume=${Boolean(input.agentSessionId)}, planMode=${Boolean(input.planMode)}, approval=${input.approvalLevel ?? 'auto'}, logDir=${getLogPath()}`
    )

    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)
    this.assistantTextEmitted.set(input.conversationId, 0)
    this.toolStarted.clear()
    this.toolStartedAt.clear()
    this.toolElapsedSeconds.clear()

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

    logInfo(
      LOG_CATEGORY,
      `Resolved run options: modelId=${modelId}, cwd=${cwd}, mode=${input.planMode ? 'plan' : cursorConfig?.mode ?? 'agent'}, autoReview=${cursorConfig?.autoReview ?? approvalLevel === 'request'}, settingSources=${cursorConfig?.settingSources?.join(',') ?? '(none)'}, promptLen=${prompt.length}`
    )

    const agentCliPath = resolveAgentExecutablePath()
    if (agentCliPath) {
      if (input.agentSessionId && isSdkSessionId(input.agentSessionId)) {
        logWarn(
          LOG_CATEGORY,
          `Skipping incompatible SDK session for CLI: conv=${input.conversationId}, sessionId=${input.agentSessionId}`
        )
        emit({ type: 'session.cleared', conversationId: input.conversationId })
      }

      await runCursorViaCli(input, emit, {
        agentPath: agentCliPath,
        apiKey,
        modelId,
        cwd,
        prompt,
        planMode: input.planMode,
        autoReview: cursorConfig?.autoReview ?? approvalLevel === 'request',
        approvalLevel,
        sessionId: input.agentSessionId,
        signal: controller.signal,
        onSpawn: (child) => {
          this.cliProcesses.set(input.conversationId, child)
        }
      })
      this.cliProcesses.delete(input.conversationId)
      return
    }

    logInfo(LOG_CATEGORY, `CLI not found, falling back to SDK: conv=${input.conversationId}`)

    const agent = await this.resolveAgent(input, apiKey, modelId, cwd, approvalLevel, cursorConfig, emit)

    logInfo(LOG_CATEGORY, `Sending prompt: agentId=${agent.agentId}, conv=${input.conversationId}`)

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

    logInfo(
      LOG_CATEGORY,
      `Run created: conv=${input.conversationId}, supportsCancel=${run.supports('cancel')}`
    )

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
        if (event.type !== 'assistant') {
          logInfo(
            LOG_CATEGORY,
            `Stream event: conv=${input.conversationId}, ${safeSerialize(summarizeStreamEvent(event))}`
          )
        }
        usage = this.handleStreamEvent(event, input, emit, usage) ?? usage
      }

      const result = await run.wait()
      logInfo(
        LOG_CATEGORY,
        `Run finished: conv=${input.conversationId}, status=${result.status}, result=${safeSerialize(result.result)}`
      )
      if (result.usage) {
        usage = mapSdkTokenUsage(result.usage)
      } else if (run.usage) {
        usage = mapSdkTokenUsage(run.usage)
      }
      if (result.status === 'error') {
        logError(
          LOG_CATEGORY,
          `Run result error: conv=${input.conversationId}, status=${result.status}, result=${safeSerialize(result.result)}`
        )
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
        logInfo(LOG_CATEGORY, `Run aborted: conv=${input.conversationId}`)
        emit({
          type: 'message.completed',
          conversationId: input.conversationId,
          messageId: input.messageId,
          stopped: true
        })
      } else {
        logError(
          LOG_CATEGORY,
          `Stream/wait failed: conv=${input.conversationId}, msg=${input.messageId}`,
          error
        )
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
    if (existing) {
      logInfo(
        LOG_CATEGORY,
        `Reusing agent handle: conv=${input.conversationId}, agentId=${existing.agentId}`
      )
      return existing
    }

    const { Agent } = await loadCursorSdk()
    const sessionId = input.agentSessionId ?? undefined
    const settingSources = cursorConfig?.settingSources

    const localOptions = {
      cwd,
      autoReview: cursorConfig?.autoReview ?? approvalLevel === 'request',
      enableAgentRetries: true,
      ...(settingSources?.length ? { settingSources } : {})
    }

    const authOptions = apiKey ? { apiKey } : {}

    logInfo(
      LOG_CATEGORY,
      `${sessionId ? 'Resume' : 'Create'} agent: conv=${input.conversationId}, sessionId=${sessionId ?? '(new)'}, modelId=${modelId}, cwd=${cwd}, auth=${apiKey ? 'api-key' : 'local-cli'}, local=${safeSerialize(localOptions)}`
    )

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

    logInfo(
      LOG_CATEGORY,
      `Agent ready: conv=${input.conversationId}, agentId=${agent.agentId}, resumed=${Boolean(sessionId)}`
    )

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
          logError(
            LOG_CATEGORY,
            `Status ERROR: conv=${input.conversationId}, ${safeSerialize(summarizeStreamEvent(event))}`
          )
          emit({
            type: 'message.error',
            conversationId: input.conversationId,
            messageId: input.messageId,
            error: formatStatusError(event)
          })
        }
        break
      case 'usage':
        return mapSdkTokenUsage(event.usage)
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
      const startedAt = new Date().toISOString()
      this.toolStartedAt.set(toolUseId, startedAt)
      emit({
        type: 'tool.started',
        conversationId: input.conversationId,
        messageId: input.messageId,
        tool: {
          toolUseId,
          toolName: event.name,
          input: (event.args as Record<string, unknown>) || {},
          status: 'pending',
          startedAt
        }
      })
      return
    }

    if (event.status === 'completed' || event.status === 'error') {
      const startedAt = this.toolStartedAt.get(toolUseId)
      let elapsedSeconds = this.toolElapsedSeconds.get(toolUseId)
      if (elapsedSeconds == null && startedAt) {
        elapsedSeconds = Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000)
      }
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
              : JSON.stringify(event.result ?? {}),
        status: event.status === 'error' ? 'error' : 'completed',
        ...(elapsedSeconds != null ? { elapsedSeconds } : {})
      })
    }
  }

  stop(conversationId: string): void {
    logInfo(LOG_CATEGORY, `Stop requested: conv=${conversationId}`)
    const cliProcess = this.cliProcesses.get(conversationId)
    if (cliProcess) {
      cliProcess.kill('SIGTERM')
      this.cliProcesses.delete(conversationId)
    }
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
      logInfo(LOG_CATEGORY, `Dispose agent: conv=${conversationId}, agentId=${agent.agentId}`)
      await agent[Symbol.asyncDispose]()
      this.agentHandles.delete(conversationId)
    }
  }
}
