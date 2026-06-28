import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import type { AgentEvent, TokenUsage } from '../../preload/types'
import { logError, logInfo, logWarn } from '../logger'
import { mapRawTokenUsage } from './token-usage'
import { getShellEnvironment } from '../shell/shell-env'
import { resolveCliResumeSessionId } from './cursor-executable'
import type { AgentRunInput } from './types'

const LOG_CATEGORY = 'CursorCli'

export interface CursorCliRunOptions {
  agentPath: string
  apiKey?: string
  modelId: string
  cwd: string
  prompt: string
  planMode?: boolean
  autoReview?: boolean
  approvalLevel: NonNullable<AgentRunInput['approvalLevel']>
  sessionId?: string | null
  signal: AbortSignal
  onSpawn?: (child: ChildProcess) => void
}

function toolNameFromCliCall(toolCall: Record<string, unknown>): string {
  for (const key of Object.keys(toolCall)) {
    if (!key.endsWith('ToolCall')) continue
    if (key === 'shellToolCall') return 'Bash'
    if (key === 'editToolCall' || key === 'writeToolCall') return 'Edit'
    if (key === 'readToolCall') return 'Read'
    return key.replace(/ToolCall$/, '')
  }
  return 'tool'
}

function toolInputFromCliCall(toolCall: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(toolCall)) {
    if (!key.endsWith('ToolCall')) continue
    const payload = toolCall[key]
    if (payload && typeof payload === 'object' && 'args' in payload) {
      const args = (payload as { args?: Record<string, unknown> }).args ?? {}
      const description =
        typeof (payload as { description?: unknown }).description === 'string'
          ? String((payload as { description?: unknown }).description)
          : typeof args.description === 'string'
            ? args.description
            : undefined
      return description ? { ...args, description } : args
    }
  }
  return {}
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

function readTimestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function msToIso(ms: number | undefined): string | undefined {
  if (ms == null) return undefined
  return new Date(ms).toISOString()
}

function parseCliToolTiming(
  event: Record<string, unknown>,
  toolCall: Record<string, unknown>
): { startedAt?: string; elapsedSeconds?: number } {
  let startedMs = readTimestampMs(event.startedAtMs)
  let completedMs = readTimestampMs(event.completedAtMs)
  let elapsedSeconds: number | undefined

  for (const key of Object.keys(toolCall)) {
    if (!key.endsWith('ToolCall')) continue
    const payload = toolCall[key]
    if (!payload || typeof payload !== 'object') continue

    startedMs =
      startedMs ??
      readTimestampMs((payload as { startedAtMs?: unknown }).startedAtMs)
    completedMs =
      completedMs ??
      readTimestampMs((payload as { completedAtMs?: unknown }).completedAtMs)

    const result = (payload as { result?: Record<string, unknown> }).result
    if (result && typeof result === 'object' && 'success' in result) {
      const success = result.success
      if (success && typeof success === 'object') {
        const executionMs =
          readTimestampMs((success as { executionTime?: unknown }).executionTime) ??
          readTimestampMs((success as { localExecutionTimeMs?: unknown }).localExecutionTimeMs)
        if (executionMs != null) {
          elapsedSeconds = executionMs / 1000
        }
      }
    }
  }

  if (elapsedSeconds == null && startedMs != null && completedMs != null && completedMs >= startedMs) {
    elapsedSeconds = (completedMs - startedMs) / 1000
  }

  return {
    startedAt: msToIso(startedMs),
    elapsedSeconds
  }
}

function parseCliToolCompletion(toolCall: Record<string, unknown>): {
  summary: string
  status: 'completed' | 'error'
} {
  for (const key of Object.keys(toolCall)) {
    if (!key.endsWith('ToolCall')) continue
    const payload = toolCall[key] as { result?: Record<string, unknown> } | undefined
    const result = payload?.result
    if (!result || typeof result !== 'object') {
      return { summary: 'completed', status: 'completed' }
    }

    if ('spawnError' in result) {
      const spawnError = result.spawnError
      const message =
        spawnError &&
        typeof spawnError === 'object' &&
        typeof (spawnError as { error?: unknown }).error === 'string'
          ? (spawnError as { error: string }).error
          : 'Shell command failed to start'
      return { summary: message, status: 'error' }
    }

    if ('error' in result) {
      const message =
        typeof result.error === 'string'
          ? result.error
          : typeof result.message === 'string'
            ? result.message
            : 'Tool failed'
      return { summary: message, status: 'error' }
    }

    if ('rejected' in result || 'denied' in result) {
      const block = (result.rejected ?? result.denied) as { reason?: unknown } | undefined
      const message =
        block && typeof block.reason === 'string' ? block.reason : 'Tool call was rejected'
      return { summary: message, status: 'error' }
    }

    if ('success' in result) {
      const success = result.success
      if (!success || typeof success !== 'object') {
        return { summary: 'completed', status: 'completed' }
      }

      if (key === 'readToolCall') {
        const content =
          typeof (success as { content?: unknown }).content === 'string'
            ? (success as { content: string }).content
            : ''
        const path =
          typeof (success as { path?: unknown }).path === 'string'
            ? (success as { path: string }).path
            : undefined
        if (content) {
          return {
            summary: truncateText(content, 2000),
            status: 'completed'
          }
        }
        return { summary: path ? `Read ${path}` : 'Read completed', status: 'completed' }
      }

      if (key === 'shellToolCall') {
        const exitCode = Number((success as { exitCode?: unknown }).exitCode ?? 0)
        const stdout =
          typeof (success as { stdout?: unknown }).stdout === 'string'
            ? (success as { stdout: string }).stdout.trim()
            : ''
        const stderr =
          typeof (success as { stderr?: unknown }).stderr === 'string'
            ? (success as { stderr: string }).stderr.trim()
            : ''
        if (exitCode !== 0) {
          return {
            summary: truncateText(stderr || stdout || `Exit code ${exitCode}`, 2000),
            status: 'error'
          }
        }
        return {
          summary: truncateText(stdout || stderr || 'completed', 2000),
          status: 'completed'
        }
      }

      return { summary: 'completed', status: 'completed' }
    }
  }

  return { summary: 'completed', status: 'completed' }
}

function buildArgs(options: CursorCliRunOptions): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--trust',
    '--workspace',
    options.cwd,
    '--model',
    options.modelId
  ]

  if (options.apiKey) {
    args.push('--api-key', options.apiKey)
  }
  if (options.planMode) {
    args.push('--plan')
  }
  if (options.autoReview) {
    args.push('--auto-review')
  }
  // Non-interactive `-p` runs cannot prompt for per-command approval in the UI.
  if (options.approvalLevel === 'full' || options.approvalLevel === 'auto') {
    args.push('--force')
  }

  const resumeSessionId = resolveCliResumeSessionId(options.sessionId)
  if (resumeSessionId) {
    args.push('--resume', resumeSessionId)
  }

  args.push(options.prompt)
  return args
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: string; text?: string } => Boolean(block && typeof block === 'object'))
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('')
}

function serializeDebugPayload(payload: unknown): string | undefined {
  try {
    return JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol') return undefined
      if (typeof value === 'string' && value.length > 8000) return `${value.slice(0, 8000)}…`
      return value
    })
  } catch {
    return JSON.stringify({ error: 'Failed to serialize debug payload' })
  }
}

export async function runCursorViaCli(
  input: AgentRunInput,
  emit: (event: AgentEvent) => void,
  options: CursorCliRunOptions
): Promise<void> {
  const args = buildArgs(options)
  const resumeSessionId = resolveCliResumeSessionId(options.sessionId)

  logInfo(
    LOG_CATEGORY,
    `Spawn agent CLI: conv=${input.conversationId}, cwd=${options.cwd}, model=${options.modelId}, resume=${Boolean(resumeSessionId)}, sdkSessionSkipped=${Boolean(options.sessionId && !resumeSessionId)}`
  )

  const child = spawn(options.agentPath, args, {
    cwd: options.cwd,
    env: getShellEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe']
  })
  options.onSpawn?.(child)

  let assistantAccumulated = ''
  let sessionCaptured = false
  let completed = false
  let usage: TokenUsage | undefined
  let stderrBuffer = ''
  const rawLines: Record<string, unknown>[] = []

  const finishWithError = (error: string): void => {
    if (completed) return
    completed = true
    logError(LOG_CATEGORY, `CLI run failed: conv=${input.conversationId}, error=${error}`)
    emit({
      type: 'message.error',
      conversationId: input.conversationId,
      messageId: input.messageId,
      error
    })
  }

  const finishWithSuccess = (stopped: boolean): void => {
    if (completed) return
    completed = true
    emit({
      type: 'message.completed',
      conversationId: input.conversationId,
      messageId: input.messageId,
      usage,
      debugInput: serializeDebugPayload({
        prompt: options.prompt,
        args,
        cwd: options.cwd,
        modelId: options.modelId
      }),
      debugOutput: serializeDebugPayload({
        lines: rawLines,
        stderr: stderrBuffer
      }),
      stopped: stopped || undefined
    })
  }

  const onAbort = (): void => {
    logInfo(LOG_CATEGORY, `Abort CLI: conv=${input.conversationId}, pid=${child.pid ?? 'unknown'}`)
    child.kill('SIGTERM')
  }
  options.signal.addEventListener('abort', onAbort)

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    stderrBuffer += text
    const trimmed = text.trim()
    if (trimmed) {
      logWarn(LOG_CATEGORY, `CLI stderr: conv=${input.conversationId}, ${trimmed}`)
    }
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const rl = createInterface({ input: child.stdout })

      rl.on('line', (line) => {
        const trimmed = line.trim()
        if (!trimmed) return

        let event: Record<string, unknown>
        try {
          event = JSON.parse(trimmed) as Record<string, unknown>
        } catch {
          logWarn(LOG_CATEGORY, `Non-JSON CLI line: conv=${input.conversationId}, ${trimmed.slice(0, 200)}`)
          return
        }

        rawLines.push(event)

        const type = String(event.type ?? '')

        const captureSessionId = (sessionId: string | undefined): void => {
          if (!sessionId || sessionCaptured) return
          sessionCaptured = true
          logInfo(LOG_CATEGORY, `CLI session: conv=${input.conversationId}, sessionId=${sessionId}`)
          emit({
            type: 'session.updated',
            conversationId: input.conversationId,
            sessionId
          })
        }

        if (type === 'system' && event.subtype === 'init') {
          captureSessionId(typeof event.session_id === 'string' ? event.session_id : undefined)
          return
        }

        if (type === 'assistant') {
          const text = extractAssistantText(event.message)
          if (!text) return

          // With --stream-partial-output, events are usually incremental chunks; some
          // events are cumulative snapshots. Detect both shapes.
          let delta: string
          if (assistantAccumulated && text.startsWith(assistantAccumulated)) {
            delta = text.slice(assistantAccumulated.length)
          } else {
            delta = text
          }
          if (!delta) return

          assistantAccumulated += delta
          emit({
            type: 'message.delta',
            conversationId: input.conversationId,
            messageId: input.messageId,
            delta
          })
          return
        }

        if (type === 'tool_call') {
          const callId = typeof event.call_id === 'string' ? event.call_id : undefined
          const toolCall =
            event.tool_call && typeof event.tool_call === 'object'
              ? (event.tool_call as Record<string, unknown>)
              : undefined
          if (!callId || !toolCall) return

          if (event.subtype === 'started') {
            const timing = parseCliToolTiming(event, toolCall)
            emit({
              type: 'tool.started',
              conversationId: input.conversationId,
              messageId: input.messageId,
              tool: {
                toolUseId: callId,
                toolName: toolNameFromCliCall(toolCall),
                input: toolInputFromCliCall(toolCall),
                status: 'running',
                ...(timing.startedAt ? { startedAt: timing.startedAt } : {})
              }
            })
            return
          }

          if (event.subtype === 'completed') {
            const completion = parseCliToolCompletion(toolCall)
            const timing = parseCliToolTiming(event, toolCall)
            emit({
              type: 'tool.completed',
              conversationId: input.conversationId,
              messageId: input.messageId,
              toolUseId: callId,
              summary: completion.summary,
              status: completion.status,
              ...(timing.elapsedSeconds != null ? { elapsedSeconds: timing.elapsedSeconds } : {})
            })
          }
          return
        }

        if (type === 'connection' || type === 'retry') {
          logInfo(LOG_CATEGORY, `CLI ${type}: conv=${input.conversationId}, ${trimmed.slice(0, 300)}`)
          return
        }

        if (type === 'result') {
          usage =
            mapRawTokenUsage(event.usage as Record<string, unknown> | undefined) ?? usage
          captureSessionId(typeof event.session_id === 'string' ? event.session_id : undefined)

          const isError = event.is_error === true || event.subtype === 'error'
          if (isError) {
            const message =
              typeof event.result === 'string' && event.result.trim()
                ? event.result
                : typeof event.message === 'string' && event.message.trim()
                  ? event.message
                  : 'Cursor CLI agent run failed'
            finishWithError(message)
          } else {
            const finalText = typeof event.result === 'string' ? event.result : ''
            if (finalText) {
              if (finalText.startsWith(assistantAccumulated)) {
                const tail = finalText.slice(assistantAccumulated.length)
                if (tail) {
                  assistantAccumulated += tail
                  emit({
                    type: 'message.delta',
                    conversationId: input.conversationId,
                    messageId: input.messageId,
                    delta: tail
                  })
                }
              } else if (!assistantAccumulated) {
                assistantAccumulated = finalText
                emit({
                  type: 'message.delta',
                  conversationId: input.conversationId,
                  messageId: input.messageId,
                  delta: finalText
                })
              }
            }
            finishWithSuccess(options.signal.aborted)
          }
        }
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code) => {
        rl.close()
        if (options.signal.aborted) {
          finishWithSuccess(true)
          resolve()
          return
        }
        if (!completed) {
          if (code === 0) {
            finishWithSuccess(false)
          } else {
            const detail = stderrBuffer.trim()
            finishWithError(
              detail
                ? `Cursor CLI exited with code ${code ?? 'unknown'}: ${detail.slice(0, 500)}`
                : `Cursor CLI exited with code ${code ?? 'unknown'}`
            )
          }
        }
        resolve()
      })
    })
  } catch (error: unknown) {
    if (options.signal.aborted) {
      finishWithSuccess(true)
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    finishWithError(message)
  } finally {
    options.signal.removeEventListener('abort', onAbort)
  }
}
