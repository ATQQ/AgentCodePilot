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
import { hasLocalCodexCliConfig, probeCodexExecutable } from './codex-executable'
import { loadCodexSdk } from './codex-sdk-loader'
import { getShellEnvironment } from '../shell/shell-env'
import { loadGatewaySettings } from '../gateway/settings-store'
import { ensureGatewayRunning } from '../gateway/live/takeover'
import { PROXY_MANAGED, buildProxyV1Url } from '../gateway/live/constants'
import { routeModel } from '../gateway/router'

/** Strip providerId/ prefix so local Codex usage logs show the upstream model id. */
function toUpstreamFacingModelId(
  model: string | undefined,
  useGateway: boolean
): string | undefined {
  if (!model) return undefined
  if (!useGateway) return model
  const idx = model.indexOf('/')
  if (idx <= 0) return model
  return model.slice(idx + 1)
}

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
  // Codex cached_input_tokens is a subset of input_tokens (inclusive), not additive.
  const reasoning = usage.reasoning_output_tokens > 0 ? usage.reasoning_output_tokens : undefined
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cached_input_tokens,
    cacheCreationTokens: 0,
    totalTokens: usage.input_tokens + usage.output_tokens,
    costUSD: 0,
    ...(reasoning != null ? { reasoningTokens: reasoning } : {})
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

function isCodexResumeFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /resume|thread|session|not found|no such|unknown thread|ResponseCompleted|total_tokens|failed to parse/i.test(
    msg
  )
}

export class CodexAgentAdapter implements AgentAdapter {
  readonly id = 'codex'
  readonly name = 'Codex'
  readonly enabled: boolean
  readonly disabledReason?: string
  readonly installSource: 'global' | 'bundled' | 'none'
  private executablePath?: string

  private abortControllers = new Map<string, AbortController>()
  private threadIds = new Map<string, string>()
  private messageTextByItemId = new Map<string, string>()
  private emittedToolIds = new Set<string>()
  private toolStartedAt = new Map<string, string>()

  constructor() {
    const probe = probeCodexExecutable()
    this.enabled = Boolean(probe.path)
    this.installSource = probe.source
    this.executablePath = probe.path
    if (!probe.path) {
      this.disabledReason = '未找到 Codex CLI。请安装后重试：npm i -g @openai/codex'
    }
  }

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    // Explicit null from main means "do not resume" (e.g. mid-conversation agent switch).
    if (input.agentSessionId === null) {
      this.threadIds.delete(input.conversationId)
    }
    const sessionId =
      input.agentSessionId === null
        ? undefined
        : (input.agentSessionId ?? this.threadIds.get(input.conversationId) ?? undefined)

    try {
      await this.runOnce(input, emit, sessionId)
    } catch (error: unknown) {
      if (sessionId && isCodexResumeFailure(error)) {
        this.threadIds.delete(input.conversationId)
        emit({ type: 'session.cleared', conversationId: input.conversationId })
        try {
          await this.runOnce(input, emit, undefined)
          return
        } catch (retryError: unknown) {
          const errorMessage = retryError instanceof Error ? retryError.message : String(retryError)
          emit({
            type: 'message.error',
            conversationId: input.conversationId,
            messageId: input.messageId,
            error: errorMessage
          })
          return
        }
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

  private async runOnce(
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    sessionId: string | undefined
  ): Promise<void> {
    const gatewaySettings = loadGatewaySettings()
    const useGateway = gatewaySettings.enabled
    const configuredApiKey = resolveConfiguredApiKey('codex')
    const envApiKey = resolveEnvValue(['OPENAI_API_KEY', 'CODEX_API_KEY'])
    const usesLocalCliProfile = hasLocalCodexCliConfig()

    if (!useGateway && !configuredApiKey && !envApiKey && !usesLocalCliProfile) {
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        messageId: input.messageId,
        error:
          '缺少 Codex 鉴权。请在设置中配置 API Key、设置 OPENAI_API_KEY / CODEX_API_KEY，或先在终端运行 codex login 生成本地 ~/.codex 配置。'
      })
      return
    }

    let gatewayHost = gatewaySettings.host
    let gatewayPort = gatewaySettings.port
    if (useGateway) {
      try {
        const running = await ensureGatewayRunning()
        gatewayHost = running.host
        gatewayPort = running.port
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: `内置网关未运行：${msg}`
        })
        return
      }
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
        env: getShellEnvironment(),
        ...(useGateway
          ? {
              baseUrl: buildProxyV1Url(gatewayHost, gatewayPort),
              apiKey: PROXY_MANAGED
            }
          : {})
      }

      const codexPath = this.executablePath
      if (codexPath) {
        codexOptions.codexPathOverride = codexPath
      }

      const apiKey = configuredApiKey || (!usesLocalCliProfile ? envApiKey : undefined)
      if (!useGateway && apiKey) {
        codexOptions.apiKey = apiKey
      }

      const codex = new Codex(codexOptions)

      const routeModelName = input.model || codexConfig?.defaultModelId
      // Bare model id for local session/usage; gateway routeModel still resolves via models list.
      const selectedModel = toUpstreamFacingModelId(routeModelName, useGateway)
      if (useGateway) {
        const gatewayUrl = buildProxyV1Url(gatewayHost, gatewayPort)
        try {
          const route = routeModelName ? routeModel(routeModelName, 'codex') : null
          console.log(
            `[CodexAgent] routing via gateway ${gatewayUrl} ` +
              `routeModel=${routeModelName ?? '(cli-default)'} ` +
              `upstreamModel=${route?.upstreamModel ?? '(n/a)'} ` +
              `threadModel=${selectedModel ?? '(none)'} (no config.toml write)`
          )
        } catch (error) {
          console.warn(
            `[CodexAgent] routing via gateway ${gatewayUrl} ` +
              `routeModel=${routeModelName ?? '(cli-default)'} threadModel=${selectedModel ?? '(none)'} ` +
              `(route resolve failed: ${error instanceof Error ? error.message : String(error)})`
          )
        }
      }
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
      let turnFailed = false
      const rawEvents: unknown[] = []

      for await (const event of streamed.events) {
        if (controller.signal.aborted) break
        rawEvents.push(event)
        this.handleThreadEvent(
          event,
          input,
          emit,
          (nextUsage) => {
            usage = nextUsage
          },
          () => {
            turnFailed = true
          }
        )

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

      if (turnFailed) return

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
    setUsage: (usage: TokenUsage | undefined) => void,
    setFailed?: () => void
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
        setFailed?.()
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          messageId: input.messageId,
          error: event.error.message
        })
        break
      case 'error':
        setFailed?.()
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
      const previous = this.messageTextByItemId.get(item.id) ?? ''
      if (item.text.length > previous.length) {
        emit({
          type: 'message.thinking.delta',
          conversationId: input.conversationId,
          messageId: input.messageId,
          delta: item.text.slice(previous.length)
        })
        this.messageTextByItemId.set(item.id, item.text)
      } else if (phase === 'started' && item.text) {
        emit({
          type: 'message.thinking.delta',
          conversationId: input.conversationId,
          messageId: input.messageId,
          delta: item.text
        })
        this.messageTextByItemId.set(item.id, item.text)
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
