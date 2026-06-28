import { app } from 'electron'
import type {
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  SandboxMode,
  ThreadEvent,
  ThreadItem,
  Usage
} from '@openai/codex-sdk'
import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { CodexSandboxPreset } from '../../shared/agent-model'
import type { CodexOptions } from '@openai/codex-sdk'
import type { AgentAdapter, AgentRunInput } from './types'
import { resolveConfiguredApiKey, resolveEnvValue } from './agent-auth'
import { getAgentConfig } from './agent-config'
import { buildAgentPrompt, withWorkspaceContext } from './agent-prompt'
import { hasLocalCodexCliConfig, resolveCodexExecutablePath } from './codex-executable'
import { loadCodexSdk } from './codex-sdk-loader'
import { getShellEnvironment } from '../shell/shell-env'

type ApprovalLevel = NonNullable<AgentRunInput['approvalLevel']>

function mapSandbox(preset: CodexSandboxPreset | undefined, level: ApprovalLevel): SandboxMode {
  if (preset === 'full_access' || level === 'full') return 'danger-full-access'
  if (preset === 'read_only' || level === 'request') return 'read-only'
  return 'workspace-write'
}

function mapApprovalPolicy(level: ApprovalLevel): 'never' | 'on-request' | 'on-failure' {
  if (level === 'full') return 'never'
  if (level === 'request') return 'on-request'
  return 'on-failure'
}

function mapUsage(usage: Usage | null | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cached_input_tokens,
    cacheCreationTokens: 0,
    costUSD: 0
  }
}

function toolNameForItem(item: ThreadItem): string {
  switch (item.type) {
    case 'command_execution':
      return 'Bash'
    case 'file_change':
      return 'Edit'
    case 'mcp_tool_call':
      return item.tool
    case 'web_search':
      return 'WebSearch'
    default:
      return item.type
  }
}

function toolInputForItem(item: ThreadItem): Record<string, unknown> {
  switch (item.type) {
    case 'command_execution':
      return { command: item.command }
    case 'file_change':
      return { changes: item.changes }
    case 'mcp_tool_call':
      return { server: item.server, tool: item.tool, arguments: item.arguments }
    case 'web_search':
      return { query: item.query }
    default:
      return {}
  }
}

function serializeDebugPayload(payload: unknown): string | undefined {
  try {
    return JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol') return undefined
      return value
    })
  } catch {
    return JSON.stringify({ error: 'Failed to serialize debug payload' })
  }
}

export class CodexAgentAdapter implements AgentAdapter {
  readonly id = 'codex'
  readonly name = 'Codex'
  readonly enabled = true

  private abortControllers = new Map<string, AbortController>()
  private threadIds = new Map<string, string>()
  private messageTextByItemId = new Map<string, string>()
  private emittedToolIds = new Set<string>()
  private toolStartedAt = new Map<string, string>()

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const sessionId = input.agentSessionId ?? this.threadIds.get(input.conversationId) ?? undefined

    try {
      await this.runOnce(input, emit, sessionId)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: errorMessage
      })
    }
  }

  private async runOnce(
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    sessionId: string | undefined
  ): Promise<void> {
    const configuredApiKey = resolveConfiguredApiKey('codex')
    const envApiKey = resolveEnvValue(['OPENAI_API_KEY', 'CODEX_API_KEY'])
    const usesLocalCliProfile = hasLocalCodexCliConfig()

    if (!configuredApiKey && !envApiKey && !usesLocalCliProfile) {
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        messageId: input.messageId,
        error:
          '缺少 Codex 鉴权。请在设置中配置 API Key、设置 OPENAI_API_KEY / CODEX_API_KEY，或先在终端运行 codex login 生成本地 ~/.codex 配置。'
      })
      return
    }

    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)
    this.messageTextByItemId.clear()
    this.emittedToolIds.clear()
    this.toolStartedAt.clear()

    emit({
      type: 'message.started',
      conversationId: input.conversationId,
      messageId: input.messageId
    })

    const approvalLevel = input.approvalLevel ?? 'auto'
    const codexConfig = getAgentConfig('codex').codex
    const cwd = input.cwd || app.getPath('home')
    const prompt = withWorkspaceContext(buildAgentPrompt(input, sessionId), input.workspaceFolders)

    try {
      const { Codex } = await loadCodexSdk()
      const codexOptions: CodexOptions = {
        env: getShellEnvironment()
      }

      const codexPath = resolveCodexExecutablePath()
      if (codexPath) {
        codexOptions.codexPathOverride = codexPath
      }

      const apiKey = configuredApiKey || (!usesLocalCliProfile ? envApiKey : undefined)
      if (apiKey) {
        codexOptions.apiKey = apiKey
      }

      const codex = new Codex(codexOptions)

      const selectedModel = input.model || codexConfig?.defaultModelId
      const threadOptions = {
        ...(selectedModel ? { model: selectedModel } : {}),
        workingDirectory: cwd,
        sandboxMode: mapSandbox(codexConfig?.sandbox, approvalLevel),
        approvalPolicy: mapApprovalPolicy(approvalLevel),
        skipGitRepoCheck: true,
        ...(input.attachmentDirectories?.length
          ? { additionalDirectories: input.attachmentDirectories }
          : {})
      }

      const thread = sessionId
        ? codex.resumeThread(sessionId, threadOptions)
        : codex.startThread(threadOptions)

      const streamed = await thread.runStreamed(prompt, { signal: controller.signal })
      let usage: TokenUsage | undefined
      const rawEvents: unknown[] = []

      for await (const event of streamed.events) {
        if (controller.signal.aborted) break
        rawEvents.push(event)
        this.handleThreadEvent(event, input, emit, (nextUsage) => {
          usage = nextUsage
        })

        const threadId = thread.id
        if (threadId && threadId !== sessionId) {
          this.threadIds.set(input.conversationId, threadId)
          emit({
            type: 'session.updated',
            conversationId: input.conversationId,
            sessionId: threadId
          })
        }
      }

      emit({
        type: 'message.completed',
        conversationId: input.conversationId,
        messageId: input.messageId,
        usage,
        debugInput: serializeDebugPayload({ prompt, threadOptions, sessionId }),
        debugOutput: serializeDebugPayload({ events: rawEvents, threadId: thread.id }),
        stopped: controller.signal.aborted || undefined
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
      this.abortControllers.delete(input.conversationId)
    }
  }

  private handleThreadEvent(
    event: ThreadEvent,
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    setUsage: (usage: TokenUsage | undefined) => void
  ): void {
    switch (event.type) {
      case 'thread.started':
        this.threadIds.set(input.conversationId, event.thread_id)
        emit({
          type: 'session.updated',
          conversationId: input.conversationId,
          sessionId: event.thread_id
        })
        break
      case 'turn.completed':
        setUsage(mapUsage(event.usage))
        break
      case 'turn.failed':
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: event.error.message
        })
        break
      case 'error':
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: event.message
        })
        break
      case 'item.started':
        this.handleItemLifecycle(event.item, input, emit, 'started')
        break
      case 'item.updated':
        this.handleItemLifecycle(event.item, input, emit, 'updated')
        break
      case 'item.completed':
        this.handleItemLifecycle(event.item, input, emit, 'completed')
        break
      default:
        break
    }
  }

  private handleItemLifecycle(
    item: ThreadItem,
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    phase: 'started' | 'updated' | 'completed'
  ): void {
    if (item.type === 'agent_message') {
      const previous = this.messageTextByItemId.get(item.id) ?? ''
      if (item.text.length > previous.length) {
        emit({
          type: 'message.delta',
          conversationId: input.conversationId,
          messageId: input.messageId,
          delta: item.text.slice(previous.length)
        })
        this.messageTextByItemId.set(item.id, item.text)
      } else if (phase === 'started' && item.text) {
        emit({
          type: 'message.delta',
          conversationId: input.conversationId,
          messageId: input.messageId,
          delta: item.text
        })
        this.messageTextByItemId.set(item.id, item.text)
      }
      return
    }

    if (item.type === 'reasoning') {
      if (phase !== 'completed' && item.text) {
        emit({
          type: 'message.delta',
          conversationId: input.conversationId,
          messageId: input.messageId,
          delta: item.text
        })
      }
      return
    }

    if (
      item.type === 'command_execution' ||
      item.type === 'file_change' ||
      item.type === 'mcp_tool_call'
    ) {
      this.emitToolItem(item, input, emit, phase)
    }
  }

  private emitToolItem(
    item: CommandExecutionItem | FileChangeItem | McpToolCallItem,
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    phase: 'started' | 'updated' | 'completed'
  ): void {
    const toolUseId = item.id
    const toolName = toolNameForItem(item)

    if ((phase === 'started' || phase === 'updated') && !this.emittedToolIds.has(toolUseId)) {
      this.emittedToolIds.add(toolUseId)
      const startedAt = new Date().toISOString()
      this.toolStartedAt.set(toolUseId, startedAt)
      emit({
        type: 'tool.started',
        conversationId: input.conversationId,
        messageId: input.messageId,
        tool: {
          toolUseId,
          toolName,
          input: toolInputForItem(item),
          status: item.status === 'failed' ? 'error' : 'pending',
          startedAt
        }
      })
    }

    if (item.type === 'command_execution' && phase === 'updated' && item.aggregated_output) {
      emit({
        type: 'tool.progress',
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolUseId,
        elapsedSeconds: 0
      })
    }

    if (phase === 'completed') {
      const failed = item.status === 'failed'
      const startedAt = this.toolStartedAt.get(toolUseId)
      const elapsedSeconds = startedAt
        ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000)
        : undefined

      if (failed) {
        emit({
          type: 'tool.completed',
          conversationId: input.conversationId,
          messageId: input.messageId,
          toolUseId,
          summary:
            item.type === 'mcp_tool_call'
              ? item.error?.message || 'Tool failed'
              : item.type === 'command_execution'
                ? item.aggregated_output || 'Command failed'
                : 'Operation failed',
          status: 'error',
          ...(elapsedSeconds != null ? { elapsedSeconds } : {})
        })
      } else {
        emit({
          type: 'tool.completed',
          conversationId: input.conversationId,
          messageId: input.messageId,
          toolUseId,
          summary:
            item.type === 'command_execution'
              ? item.aggregated_output || `Exit code ${item.exit_code ?? 0}`
              : item.type === 'file_change'
                ? item.changes.map((change) => `${change.kind} ${change.path}`).join('\n')
                : item.type === 'mcp_tool_call'
                  ? JSON.stringify(item.result ?? item.arguments)
                  : 'Completed',
          status: 'completed',
          ...(elapsedSeconds != null ? { elapsedSeconds } : {})
        })
      }
    }
  }

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
    }
  }
}
