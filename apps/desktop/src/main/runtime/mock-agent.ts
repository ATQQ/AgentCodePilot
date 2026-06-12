import type { AgentEvent } from '../../preload/types'

export interface AgentRunInput {
  conversationId: string
  messageId: string
  content: string
  agentId: string
  cwd?: string
  workspaceFolders?: string[]
}

const MOCK_MARKDOWN_RESPONSE = `## 分析结果

我已经完成了对代码的分析，以下是具体的修改建议：

### 1. 类型定义更新

需要在 \`src/types/index.ts\` 中新增以下接口：

\`\`\`typescript
interface StreamEvent {
  type: 'started' | 'delta' | 'completed'
  payload: Record<string, unknown>
}

function processEvent(event: StreamEvent): void {
  console.log(\`Processing: \${event.type}\`)
}
\`\`\`

### 2. 关键修改点

| 文件 | 修改内容 | 优先级 |
|------|----------|--------|
| \`agent.store.ts\` | 新增 fetchAgents 方法 | 高 |
| \`chat.store.ts\` | 重构消息流处理 | 高 |
| \`preload/index.ts\` | 暴露 IPC API | 中 |
| \`main/index.ts\` | 注册 handlers | 中 |

### 3. 注意事项

- **重要**：确保在组件卸载时清理事件监听器
- *建议*：使用 \`AbortController\` 管理异步操作生命周期
- ~~旧方案~~：不再使用轮询方式获取消息

> 提示：运行 \`pnpm typecheck\` 可以验证类型是否正确。

### 4. 操作步骤

1. 首先更新类型定义
2. 然后修改 store 逻辑
   - 添加 streaming 状态
   - 注册事件回调
3. 最后更新视图层
4. 运行测试验证

### 5. 相关链接

详细文档参考 [Electron IPC 指南](https://www.electronjs.org/docs/latest/tutorial/ipc) 和 [Vue 响应式原理](https://vuejs.org/guide/extras/reactivity-in-depth.html)。

---

如果有任何问题，请随时告诉我！`

function getResponse(): string {
  return MOCK_MARKDOWN_RESPONSE
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class MockAgentAdapter {
  private abortControllers = new Map<string, AbortController>()

  async run(input: AgentRunInput, emit: (event: AgentEvent) => void): Promise<void> {
    const controller = new AbortController()
    this.abortControllers.set(input.conversationId, controller)

    emit({
      type: 'message.started',
      conversationId: input.conversationId,
      messageId: input.messageId
    })

    const text = getResponse()
    const chunkSize = 2 + Math.floor(Math.random() * 3)

    for (let i = 0; i < text.length; i += chunkSize) {
      if (controller.signal.aborted) break

      await delay(30 + Math.floor(Math.random() * 40))

      const chunk = text.slice(i, i + chunkSize)
      emit({
        type: 'message.delta',
        conversationId: input.conversationId,
        messageId: input.messageId,
        delta: chunk
      })
    }

    if (!controller.signal.aborted) {
      emit({
        type: 'message.completed',
        conversationId: input.conversationId,
        messageId: input.messageId
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
