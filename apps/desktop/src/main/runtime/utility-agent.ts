import { app } from 'electron'
import type { AgentUtilityPayload } from '../../preload/types'
import { agentRegistry } from './registry'

export async function runUtilityAgent(payload: AgentUtilityPayload): Promise<string> {
  const agentId = payload.agentId?.trim() || 'claude-code'
  const adapter = agentRegistry.get(agentId)
  if (!adapter) {
    throw new Error(`Agent "${agentId}" 不可用`)
  }

  const conversationId = `utility-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const messageId = `utility-msg-${Date.now()}`
  const prompt = `${payload.systemPrompt.trim()}\n\n---\n\n${payload.userPrompt.trim()}`

  return new Promise<string>((resolve, reject) => {
    let content = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      adapter.stop(conversationId)
      reject(new Error('AI 请求超时'))
    }, 120_000)

    const emit = (event: import('../../preload/types').AgentEvent): void => {
      if (settled) return
      switch (event.type) {
        case 'message.delta':
          content += event.delta
          break
        case 'message.completed':
          settled = true
          clearTimeout(timeout)
          resolve(content.trim())
          break
        case 'message.error':
          settled = true
          clearTimeout(timeout)
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
          model: payload.modelId,
          cwd: payload.cwd || app.getPath('home'),
          approvalLevel: 'request'
        },
        emit
      )
      .catch((err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(err instanceof Error ? err : new Error('AI 请求失败'))
      })
  })
}
