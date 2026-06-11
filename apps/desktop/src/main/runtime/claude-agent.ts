import { query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '../../preload/types'
import type { AgentRunInput } from './mock-agent'

export class ClaudeAgentAdapter {
  private abortControllers = new Map<string, AbortController>()

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)

    emit({
      type: 'message.started',
      conversationId: input.conversationId,
      messageId: input.messageId
    })

    try {
      const q = query({
        prompt: input.content,
        options: {
          abortController: controller,
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
          maxTurns: 20,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true
        }
      })

      for await (const message of q) {
        if (controller.signal.aborted) break

        if (message.type === 'assistant') {
          const content = message.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                emit({
                  type: 'message.delta',
                  conversationId: input.conversationId,
                  messageId: input.messageId,
                  delta: block.text
                })
              }
            }
          }
        } else if (message.type === 'result') {
          if (
            message.subtype === 'error_max_turns' ||
            message.subtype === 'error_during_execution'
          ) {
            const errors = 'errors' in message ? (message.errors as string[]) : []
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

      if (!controller.signal.aborted) {
        emit({
          type: 'message.completed',
          conversationId: input.conversationId,
          messageId: input.messageId
        })
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
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

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
    }
  }
}
