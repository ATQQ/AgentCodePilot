import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { AgentAdapter, AgentRunInput } from './types'
import { getAgentConfig } from './claude-model-catalog'
import { pickRandomMockResponse, resolveMockAgentConfig } from '../../shared/mock-agent-defaults'

const MOCK_USAGE: TokenUsage = {
  inputTokens: 186,
  outputTokens: 1240,
  cacheReadTokens: 512,
  cacheCreationTokens: 0,
  costUSD: 0.0038
}

interface MockToolStep {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  summary: string
  progressSeconds: number[]
}

const MOCK_TOOL_STEPS: MockToolStep[] = [
  {
    toolUseId: 'mock-tool-read-001',
    toolName: 'Read',
    input: { file_path: '~/projects/demo-web-app/src/types/index.ts' },
    summary: 'Read 42 lines',
    progressSeconds: [0.4, 0.9]
  },
  {
    toolUseId: 'mock-tool-bash-002',
    toolName: 'Bash',
    input: {
      command: 'pnpm typecheck',
      description: 'Verify TypeScript types in demo-web-app'
    },
    summary: 'Exit code 0',
    progressSeconds: [0.6, 1.4, 2.1]
  },
  {
    toolUseId: 'mock-tool-grep-003',
    toolName: 'Grep',
    input: {
      pattern: 'MarkdownRender',
      path: '~/projects/demo-web-app/apps/desktop/src/renderer'
    },
    summary: '3 matches in 2 files',
    progressSeconds: [0.5, 1.0]
  }
]

function getResponse(): string {
  return pickRandomMockResponse(getAgentConfig('mock').mock)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function simulateToolCalls(
  input: AgentRunInput,
  emit: (event: AgentEvent) => void,
  signal: AbortSignal
): Promise<void> {
  for (const step of MOCK_TOOL_STEPS) {
    if (signal.aborted) return

    emit({
      type: 'tool.started',
      conversationId: input.conversationId,
      messageId: input.messageId,
      tool: {
        toolUseId: step.toolUseId,
        toolName: step.toolName,
        input: {},
        status: 'pending'
      }
    })

    await delay(120)
    if (signal.aborted) return

    emit({
      type: 'tool.input_updated',
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolUseId: step.toolUseId,
      input: step.input
    })

    emit({
      type: 'tool.progress',
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolUseId: step.toolUseId,
      elapsedSeconds: 0.1
    })

    for (const elapsed of step.progressSeconds) {
      await delay(280)
      if (signal.aborted) return
      emit({
        type: 'tool.progress',
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolUseId: step.toolUseId,
        elapsedSeconds: elapsed
      })
    }

    await delay(200)
    if (signal.aborted) return

    const finalElapsed = step.progressSeconds[step.progressSeconds.length - 1] ?? 0.1
    emit({
      type: 'tool.completed',
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolUseId: step.toolUseId,
      summary: step.summary,
      elapsedSeconds: finalElapsed
    })

    await delay(150)
  }
}

async function streamMarkdown(
  input: AgentRunInput,
  emit: (event: AgentEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const text = getResponse()
  const chunkSize = 2 + Math.floor(Math.random() * 3)

  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal.aborted) break

    await delay(30 + Math.floor(Math.random() * 40))

    emit({
      type: 'message.delta',
      conversationId: input.conversationId,
      messageId: input.messageId,
      delta: text.slice(i, i + chunkSize)
    })
  }
}

function emitStoppedCompleted(input: AgentRunInput, emit: (event: AgentEvent) => void): void {
  emit({
    type: 'message.completed',
    conversationId: input.conversationId,
    messageId: input.messageId,
    stopped: true
  })
}

export class MockAgentAdapter implements AgentAdapter {
  readonly id = 'mock'
  readonly name = 'Mock Agent'
  readonly enabled = true
  private abortControllers = new Map<string, AbortController>()

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)

    emit({
      type: 'message.started',
      conversationId: input.conversationId,
      messageId: input.messageId
    })

    const mockConfig = resolveMockAgentConfig(getAgentConfig('mock').mock)
    if (mockConfig.initialDelayMs > 0) {
      await delay(mockConfig.initialDelayMs)
      if (controller.signal.aborted) {
        emitStoppedCompleted(input, emit)
        return
      }
    }

    await simulateToolCalls(input, emit, controller.signal)
    if (controller.signal.aborted) {
      emitStoppedCompleted(input, emit)
      return
    }
    await streamMarkdown(input, emit, controller.signal)

    if (controller.signal.aborted) {
      emitStoppedCompleted(input, emit)
      return
    }

    emit({
      type: 'message.completed',
      conversationId: input.conversationId,
      messageId: input.messageId,
      usage: MOCK_USAGE,
      debugInput: JSON.stringify({
        agentId: 'mock',
        prompt: input.content,
        cwd: input.cwd ?? '~/projects/demo-web-app'
      }),
      debugOutput: JSON.stringify({
        tools: MOCK_TOOL_STEPS.map((s) => s.toolName),
        markdownSections: ['text', 'katex', 'code', 'table', 'mermaid']
      })
    })

    this.abortControllers.delete(input.conversationId)
  }

  stop(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(conversationId)
    }
  }
}
