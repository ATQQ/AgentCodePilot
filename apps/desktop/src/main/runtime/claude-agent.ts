import { Options, query } from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { AgentAdapter, AgentRunInput } from './types'
import type { ApprovalLevel } from './permissions'
import { buildPermissionOptions, buildToolAccessOptions } from './permissions'

const AGENT_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'] as const

function isStaleSessionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes('No conversation found with session ID')
}

function buildPrompt(input: AgentRunInput, sessionId: string | undefined): string {
  if (sessionId) {
    return input.content
  }

  if (input.conversationHistory && input.conversationHistory.length > 0) {
    return input.conversationHistory
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
  }

  return input.content
}

function withWorkspaceContext(prompt: string, workspaceFolders?: string[]): string {
  if (!workspaceFolders || workspaceFolders.length <= 1) return prompt
  const folderList = workspaceFolders.map((f) => `- ${f}`).join('\n')
  return `[Workspace Context] This is a multi-directory workspace. The working directories are:\n${folderList}\nYou may need to work across these directories.\n\n${prompt}`
}

export class ClaudeAgentAdapter implements AgentAdapter {
  readonly id = 'claude-code'
  readonly name = 'Claude Code'
  readonly enabled = true
  private abortControllers = new Map<string, AbortController>()
  private sessionIds = new Map<string, string>()

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const sessionId = this.resolveSessionId(input)

    try {
      await this.runOnce(input, emit, sessionId)
    } catch (error: unknown) {
      if (sessionId && isStaleSessionError(error)) {
        this.clearSession(input.conversationId, emit)
        await this.runOnce(input, emit, undefined, { skipStarted: true })
        return
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        error: errorMessage
      })
    }
  }

  private resolveSessionId(input: AgentRunInput): string | undefined {
    const sessionId = input.agentSessionId ?? this.sessionIds.get(input.conversationId)
    if (sessionId) {
      this.sessionIds.set(input.conversationId, sessionId)
    }
    return sessionId
  }

  private clearSession(conversationId: string, emit: (event: AgentEvent) => void): void {
    this.sessionIds.delete(conversationId)
    emit({ type: 'session.cleared', conversationId })
  }

  private async runOnce(
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    sessionId: string | undefined,
    options?: { skipStarted?: boolean }
  ): Promise<void> {
    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)

    if (!options?.skipStarted) {
      emit({
        type: 'message.started',
        conversationId: input.conversationId,
        messageId: input.messageId
      })
    }

    let usage: TokenUsage | undefined
    const rawMessages: unknown[] = []
    const blockIndexToToolId = new Map<number, string>()
    const toolInputBuffers = new Map<string, string>()
    const prompt = withWorkspaceContext(buildPrompt(input, sessionId), input.workspaceFolders)

    const approvalLevel = (input.approvalLevel ?? 'auto') as ApprovalLevel
    const permissionOptions = buildPermissionOptions(
      approvalLevel,
      {
        conversationId: input.conversationId,
        messageId: input.messageId,
        emit
      },
      input.planMode ?? false
    )
    const toolAccessOptions = buildToolAccessOptions(approvalLevel, AGENT_TOOLS)

    const queryOptions: Options = {
      abortController: controller,
      cwd: input.cwd || app.getPath('home'),
      ...toolAccessOptions,
      skills: 'all' as const,
      maxTurns: 20,
      ...permissionOptions,
      includePartialMessages: true,
      ...(input.model ? { model: input.model } : {}),
      ...(sessionId ? { resume: sessionId } : {})
    }

    try {
      const q = query({
        prompt,
        options: queryOptions
      })

      for await (const message of q) {
        if (controller.signal.aborted) break

        if (message.type !== 'stream_event') {
          rawMessages.push(message)
        }

        if (message.type === 'system' && message.subtype === 'init') {
          this.sessionIds.set(input.conversationId, message.session_id)
          emit({
            type: 'session.updated',
            conversationId: input.conversationId,
            sessionId: message.session_id
          })
        } else if (message.type === 'stream_event') {
          const event = (message as { event: { type: string; index?: number; content_block?: { type: string; id?: string; name?: string; input?: unknown }; delta?: { type: string; text?: string; partial_json?: string } } }).event
          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            const block = event.content_block
            const toolUseId = block.id || `tool-${Date.now()}`
            if (event.index !== undefined) {
              blockIndexToToolId.set(event.index, toolUseId)
            }
            toolInputBuffers.set(toolUseId, '')
            emit({
              type: 'tool.started',
              conversationId: input.conversationId,
              messageId: input.messageId,
              tool: {
                toolUseId,
                toolName: block.name || 'unknown',
                input: (block.input as Record<string, unknown>) || {},
                status: 'pending'
              }
            })
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              emit({
                type: 'message.delta',
                conversationId: input.conversationId,
                messageId: input.messageId,
                delta: event.delta.text
              })
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              const toolUseId = event.index !== undefined ? blockIndexToToolId.get(event.index) : undefined
              if (toolUseId) {
                const accumulated = (toolInputBuffers.get(toolUseId) || '') + event.delta.partial_json
                toolInputBuffers.set(toolUseId, accumulated)
                try {
                  const parsed = JSON.parse(accumulated) as Record<string, unknown>
                  emit({
                    type: 'tool.input_updated',
                    conversationId: input.conversationId,
                    messageId: input.messageId,
                    toolUseId,
                    input: parsed
                  })
                } catch {
                  // partial JSON, wait for more deltas
                }
              }
            }
          }
        } else if (message.type === 'tool_progress') {
          const toolMsg = message as { tool_use_id: string; tool_name: string; elapsed_time_seconds: number }
          emit({
            type: 'tool.progress',
            conversationId: input.conversationId,
            messageId: input.messageId,
            toolUseId: toolMsg.tool_use_id,
            elapsedSeconds: toolMsg.elapsed_time_seconds
          })
        } else if (message.type === 'tool_use_summary') {
          const summaryMsg = message as { summary: string; preceding_tool_use_ids: string[] }
          for (const toolId of summaryMsg.preceding_tool_use_ids) {
            emit({
              type: 'tool.completed',
              conversationId: input.conversationId,
              messageId: input.messageId,
              toolUseId: toolId,
              summary: summaryMsg.summary
            })
          }
        } else if (message.type === 'result') {
          const result = message as { subtype?: string; errors?: string[]; modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; costUSD?: number }> }
          if (result.modelUsage) {
            let totalInput = 0
            let totalOutput = 0
            let totalCacheRead = 0
            let totalCacheCreation = 0
            let totalCost = 0
            for (const model of Object.values(result.modelUsage)) {
              totalInput += model.inputTokens ?? 0
              totalOutput += model.outputTokens ?? 0
              totalCacheRead += model.cacheReadInputTokens ?? 0
              totalCacheCreation += model.cacheCreationInputTokens ?? 0
              totalCost += model.costUSD ?? 0
            }
            usage = {
              inputTokens: totalInput,
              outputTokens: totalOutput,
              cacheReadTokens: totalCacheRead,
              cacheCreationTokens: totalCacheCreation,
              costUSD: totalCost
            }
          }
          if (
            result.subtype === 'error_max_turns' ||
            result.subtype === 'error_during_execution'
          ) {
            const errors = result.errors ?? []
            const errText = errors.join('\n') || 'Agent execution error'
            if (sessionId && isStaleSessionError({ message: errText })) {
              this.clearSession(input.conversationId, emit)
              await this.runOnce(input, emit, undefined, { skipStarted: true })
              return
            }
            emit({
              type: 'message.error',
              conversationId: input.conversationId,
              error: errText
            })
            this.abortControllers.delete(input.conversationId)
            return
          }
        }
      }

      this.emitCompleted(input, emit, usage, rawMessages, queryOptions)
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        this.emitCompleted(input, emit, usage, rawMessages, queryOptions)
      } else {
        throw error
      }
    } finally {
      this.abortControllers.delete(input.conversationId)
    }
  }

  private emitCompleted(
    input: AgentRunInput,
    emit: (event: AgentEvent) => void,
    usage: TokenUsage | undefined,
    rawMessages: unknown[],
    queryOptions: Record<string, unknown>
  ): void {
    let debugInputStr: string | undefined
    let debugOutputStr: string | undefined
    try {
      debugInputStr = JSON.stringify({
        prompt: input.content,
        options: { ...queryOptions, abortController: undefined }
      })
    } catch {
      debugInputStr = JSON.stringify({ prompt: input.content, error: 'Failed to serialize options' })
    }
    try {
      debugOutputStr = JSON.stringify(rawMessages, (_key, value) => {
        if (typeof value === 'function' || typeof value === 'symbol') return undefined
        return value
      })
    } catch {
      debugOutputStr = JSON.stringify({ error: 'Failed to serialize raw messages', count: rawMessages.length })
    }
    emit({
      type: 'message.completed',
      conversationId: input.conversationId,
      messageId: input.messageId,
      usage,
      debugInput: debugInputStr,
      debugOutput: debugOutputStr
    })
  }

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
    }
  }
}
