import type { AgentEvent, TokenUsage } from '../../preload/types'
import type { AgentAdapter, AgentRunInput } from './types'

const MOCK_MARKDOWN_RESPONSE = `## Markstream 渲染能力测试

这是 **Mock Agent** 的完整输出样例，用于验证当前已接入的 UI 与 Markdown 渲染能力。

### 文本格式

- **加粗**、*斜体*、~~删除线~~、\`inline code\`
- 嵌套列表：
  1. 流式输出（smooth-streaming）
  2. 工具调用展示
     - Read / Bash / Grep
  3. 完成后 Monaco 代码块

> 提示：Mock 数据使用虚构项目路径 \`~/projects/demo-web-app\`，请勿替换为真实路径。

### 数学公式 (KaTeX)

行内：$E = mc^2$，欧拉恒等式 $e^{i\\pi} + 1 = 0$

块级：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

### Monaco 代码块

\`\`\`typescript
interface StreamEvent {
  type: 'started' | 'delta' | 'completed'
  payload: Record<string, unknown>
}

export function processEvent(event: StreamEvent): void {
  console.log(\`Processing: \${event.type}\`)
}
\`\`\`

\`\`\`bash
cd ~/projects/demo-web-app
pnpm install
pnpm typecheck && pnpm dev
\`\`\`

\`\`\`json
{
  "name": "demo-web-app",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "typecheck": "vue-tsc --noEmit"
  }
}
\`\`\`

\`\`\`python
def fibonacci(n: int) -> list[int]:
    seq = [0, 1]
    while len(seq) <= n:
        seq.append(seq[-1] + seq[-2])
    return seq[: n + 1]
\`\`\`

### 表格

| 能力 | Peer 依赖 | 用途 |
|------|-----------|------|
| Monaco 代码块 | stream-monaco | 语法高亮、复制 |
| Mermaid 图表 | mermaid | 流程图 |
| KaTeX 公式 | katex | 数学渲染 |
| 工具调用 | — | ToolCallsSection |

### Mermaid 流程图

\`\`\`mermaid
flowchart TD
  A[用户发送消息] --> B[Mock Agent]
  B --> C[模拟工具调用]
  C --> D[流式 Markdown]
  D --> E{Markstream}
  E --> F[Monaco 代码块]
  E --> G[Mermaid 图表]
  E --> H[KaTeX 公式]
  F --> I[渲染完成]
  G --> I
  H --> I
\`\`\`

### 时序图

\`\`\`mermaid
sequenceDiagram
  participant U as 用户
  participant M as Mock Agent
  participant R as MarkdownRender
  U->>M: sendMessage
  M->>M: tool.started (Read/Bash)
  M->>R: message.delta
  R-->>U: 流式渲染
  M->>R: message.completed
\`\`\`

### 参考链接

- [Markstream 安装指南](https://markstream.simonhe.me/zh/guide/installation.html)
- [AI 聊天与流式输出](https://markstream.simonhe.me/zh/guide/ai-chat-streaming.html)

---

**测试完成。** 若某类内容未正确渲染，请检查 peer 依赖、CSS 导入顺序与 CSP \`worker-src\` 配置。`

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
  return MOCK_MARKDOWN_RESPONSE
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

    emit({
      type: 'tool.completed',
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolUseId: step.toolUseId,
      summary: step.summary
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

    await simulateToolCalls(input, emit, controller.signal)
    if (!controller.signal.aborted) {
      await streamMarkdown(input, emit, controller.signal)
    }

    if (!controller.signal.aborted) {
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
    }

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
