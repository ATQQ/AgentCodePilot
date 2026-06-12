import { logInfo, logError } from '../logger'
import { agentRegistry } from './registry'
import type { AgentAdapter, AgentRunInput } from './types'
import type { AgentEvent } from '../../preload/types'

const MAX_RETRIES = 2
const activeRuns = new Map<string, { adapter: AgentAdapter; retries: number }>()

export function supervisedRun(
  input: AgentRunInput,
  emit: (event: AgentEvent) => void
): void {
  const adapter = agentRegistry.get(input.agentId)
  if (!adapter) {
    emit({
      type: 'message.error',
      conversationId: input.conversationId,
      error: `Agent "${input.agentId}" not found`
    })
    return
  }

  activeRuns.set(input.conversationId, { adapter, retries: 0 })
  logInfo('Supervisor', `Starting run: agent=${input.agentId}, conv=${input.conversationId}`)

  runWithRetry(adapter, input, emit, 0)
}

function runWithRetry(
  adapter: AgentAdapter,
  input: AgentRunInput,
  emit: (event: AgentEvent) => void,
  attempt: number
): void {
  adapter.run(input, emit).catch((error: unknown) => {
    const entry = activeRuns.get(input.conversationId)
    if (!entry) return

    const errMsg = error instanceof Error ? error.message : String(error)
    logError('Supervisor', `Run failed (attempt ${attempt + 1}): ${errMsg}`, error)

    if (attempt < MAX_RETRIES && isRetryable(error)) {
      logInfo('Supervisor', `Retrying (${attempt + 1}/${MAX_RETRIES})...`)
      entry.retries = attempt + 1
      setTimeout(() => runWithRetry(adapter, input, emit, attempt + 1), 1000 * (attempt + 1))
    } else {
      activeRuns.delete(input.conversationId)
      emit({
        type: 'message.error',
        conversationId: input.conversationId,
        error: `Agent crashed after ${attempt + 1} attempt(s): ${errMsg}`
      })
    }
  })
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('abort') || msg.includes('cancel')) return false
    if (msg.includes('api key') || msg.includes('authentication')) return false
    return true
  }
  return false
}

export function supervisedStop(conversationId: string): void {
  const entry = activeRuns.get(conversationId)
  if (entry) {
    entry.adapter.stop(conversationId)
    activeRuns.delete(conversationId)
    logInfo('Supervisor', `Stopped run: conv=${conversationId}`)
  } else {
    agentRegistry.stopAll(conversationId)
  }
}
