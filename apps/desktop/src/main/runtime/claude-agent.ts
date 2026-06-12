import { query } from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { AgentRunInput } from './mock-agent'

export class ClaudeAgentAdapter {
  private abortControllers = new Map<string, AbortController>()
  private sessionIds = new Map<string, string>()

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)

    emit({
      type: 'message.started',
      conversationId: input.conversationId,
      messageId: input.messageId
    })

    let usage: TokenUsage | undefined
    const rawMessages: unknown[] = []
    const existingSessionId = this.sessionIds.get(input.conversationId)

    let prompt = input.content
    if (input.workspaceFolders && input.workspaceFolders.length > 1) {
      const folderList = input.workspaceFolders.map((f) => `- ${f}`).join('\n')
      prompt = `[Workspace Context] This is a multi-directory workspace. The working directories are:\n${folderList}\nYou may need to work across these directories.\n\n${prompt}`
    }

    const queryOptions = {
      abortController: controller,
      cwd: input.cwd || app.getPath('home'),
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
      skills: 'all' as const,
      maxTurns: 20,
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      ...(existingSessionId ? { resume: existingSessionId } : {})
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
        } else if (message.type === 'stream_event') {
          const event = (message as { event: { type: string; delta?: { type: string; text?: string } } }).event
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            emit({
              type: 'message.delta',
              conversationId: input.conversationId,
              messageId: input.messageId,
              delta: event.delta.text
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
            emit({
              type: 'message.error',
              conversationId: input.conversationId,
              error: errors.join('\n') || 'Agent execution error'
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
        const errorMessage = error instanceof Error ? error.message : String(error)
        emit({
          type: 'message.error',
          conversationId: input.conversationId,
          error: errorMessage
        })
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
