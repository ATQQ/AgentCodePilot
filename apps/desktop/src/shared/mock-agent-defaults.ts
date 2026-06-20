export interface MockAgentConfig {
  initialDelayMs?: number
  responses?: string[]
}

export const DEFAULT_MOCK_MARKDOWN_RESPONSE = `## Markstream 渲染能力测试

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

export const DEFAULT_MOCK_AGENT_CONFIG: Required<MockAgentConfig> = {
  initialDelayMs: 800,
  responses: [DEFAULT_MOCK_MARKDOWN_RESPONSE]
}

export function resolveMockAgentConfig(config?: MockAgentConfig): Required<MockAgentConfig> {
  const responses = config?.responses?.map((item) => item.trim()).filter(Boolean) ?? []
  return {
    initialDelayMs: config?.initialDelayMs ?? DEFAULT_MOCK_AGENT_CONFIG.initialDelayMs,
    responses: responses.length > 0 ? responses : DEFAULT_MOCK_AGENT_CONFIG.responses
  }
}

export function pickRandomMockResponse(config?: MockAgentConfig): string {
  const resolved = resolveMockAgentConfig(config)
  const index = Math.floor(Math.random() * resolved.responses.length)
  return resolved.responses[index]
}
