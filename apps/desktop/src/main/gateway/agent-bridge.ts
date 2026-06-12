import { app } from 'electron'
import type { UnifiedChatRequest } from './types'
import { agentRegistry } from '../runtime'
import type { AgentEvent } from '../../preload/types'

export async function runAgentForGateway(
  req: UnifiedChatRequest,
  onDelta: (text: string) => void
): Promise<void> {
  const agentId = resolveAgentId(req.model)
  const adapter = agentRegistry.get(agentId)
  if (!adapter) {
    throw new Error(`No adapter found for model "${req.model}" (resolved to agent "${agentId}")`)
  }

  const prompt = buildPrompt(req)
  const conversationId = `gw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const messageId = `gw-msg-${Date.now()}`

  return new Promise<void>((resolve, reject) => {
    const emit = (event: AgentEvent): void => {
      switch (event.type) {
        case 'message.delta':
          onDelta(event.delta)
          break
        case 'message.completed':
          resolve()
          break
        case 'message.error':
          reject(new Error(event.error))
          break
      }
    }

    adapter
      .run(
        {
          conversationId,
          messageId,
          content: prompt,
          agentId,
          cwd: app.getPath('home')
        },
        emit
      )
      .catch(reject)
  })
}

function resolveAgentId(model: string): string {
  if (model.startsWith('claude') || model === 'claude-code') return 'claude-code'
  return 'claude-code'
}

function buildPrompt(req: UnifiedChatRequest): string {
  const parts: string[] = []
  if (req.systemPrompt) {
    parts.push(`[System] ${req.systemPrompt}`)
  }
  const lastUserMsg = [...req.messages].reverse().find((m) => m.role === 'user')
  if (lastUserMsg) {
    parts.push(lastUserMsg.content)
  }
  return parts.join('\n\n') || 'Hello'
}
