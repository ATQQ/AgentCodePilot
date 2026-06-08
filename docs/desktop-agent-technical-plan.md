# 桌面编程 Agent 技术方案与实施路径

## 1. 目标与定位

本项目第一版目标是交付一个面向编程场景的桌面 Agent 应用，交互形态参考 Cursor Agents、Codex Desktop、Claude Desktop。

核心目标：

- 以桌面 App 形式交付，用户只需要安装和启动一个应用。
- 支持在会话入口选择不同 Agent：Codex、Claude、Cursor、Open Agent 以及自定义 Agent。
- 通过统一的应用内部 API 屏蔽不同 Agent SDK、模型供应商和协议差异。
- 内置本地 API Gateway，可选择性对外暴露 OpenAI-compatible 与 Anthropic-compatible API。
- 为后续接入文件读写、Shell、Git、MCP、项目索引和自动路由能力预留架构边界。

## 2. 第一版技术选型

第一版 MVP 使用以下技术栈：

```text
Desktop Shell: Electron
Build Tool: electron-vite
Renderer: Vue 3 + TypeScript
UI Component: Element Plus
AI Chat UI: vue-element-plus-x
State: Pinia
Router: Vue Router
Editor / Diff: Monaco Editor
Terminal: xterm.js
Storage: SQLite
Runtime: Node.js in Electron Main Process, later optional child process
```

选择该组合的原因：

- 现有 Agent SDK 基本都在 TypeScript / Node 生态内，Electron + Node 的兼容性最高。
- electron-vite 对 Vue 3 + TypeScript 的开发体验成熟，适合快速搭建 MVP。
- Element Plus 适合桌面应用的通用 UI，vue-element-plus-x 适合快速构建 AI 对话界面。
- Electron 内置 Chromium，对 Monaco、xterm.js、复杂 Markdown、虚拟列表和流式 UI 的跨平台一致性更稳定。

## 3. 关于 Tauri、ElectronBun 和 Electron 的判断

### 3.1 Tauri

Tauri 的 Rust 后端不适合作为第一版核心运行时。原因是当前核心能力依赖以下 TypeScript SDK：

```text
@anthropic-ai/claude-agent-sdk
@codeany/open-agent-sdk
@cursor/sdk
@openai/codex-sdk
```

如果使用 Tauri，通常需要额外启动 Node/Bun sidecar 来承载这些 SDK：

```text
Tauri UI
  -> Rust Backend
  -> Node/Bun Agent Runtime Sidecar
  -> Agent SDKs
```

该方案可行，但会带来两套语言栈、额外进程管理、打包、日志和崩溃恢复复杂度。第一版不建议采用。

### 3.2 ElectronBun

ElectronBun 的方向很适合 TypeScript 桌面应用：使用 Bun 作为主进程 runtime，并通过系统 WebView 或可选 CEF 渲染 UI。它的优势是包体小、启动快、全 TypeScript。

但第一版不建议重度依赖 ElectronBun，原因是：

- 这些 Agent SDK 是否完全兼容 Bun 需要验证。
- 编程 Agent UI 可能依赖 Monaco、xterm.js、复杂 Markdown 和大规模流式渲染，Electron 的 Chromium 一致性更稳。
- 桌面发布、签名、更新、协议处理、系统兼容等生态成熟度 Electron 更高。

ElectronBun 可以作为后续 POC 方向：

- 验证 Agent SDK 在 Bun 下是否可用。
- 验证 streaming、tool call、文件系统、Shell、Monaco、xterm.js 和打包能力。
- 验证通过后再考虑迁移或提供轻量版本。

### 3.3 Electron

第一版推荐 Electron，因为它可以直接承载 Node.js 生态中的 Agent SDK，降低 MVP 风险。

最终产物仍然是单个桌面 App。即使后续将 Agent Runtime 拆成子进程，也应由桌面 App 自动启动和管理，用户无需手动运行任何服务。

## 4. 进程模型

### 4.1 MVP 进程模型

第一版先将 Agent Runtime 和 Gateway 放在 Electron Main Process 内，减少初期复杂度：

```text
Vue Renderer
  -> Preload IPC
  -> Electron Main
      -> Agent Runtime
      -> Local Gateway
      -> SDK Adapters
      -> SQLite
```

优点：

- 实现简单。
- 打包简单。
- 用户只感知一个 App。
- 不需要额外端口或子进程管理即可完成第一条链路。

### 4.2 后续目标进程模型

当 Agent 能力变复杂后，将 Runtime 拆为桌面 App 内嵌子进程：

```text
Desktop App
  Renderer: Vue 3 UI
  Preload: 安全 IPC Bridge
  Main Process:
    - Window lifecycle
    - App menu
    - Permission dialog
    - Runtime supervisor
  Embedded Agent Runtime child process:
    - Agent SDK adapters
    - Tool execution
    - Local API Gateway
    - Protocol adapters
    - Routing policy
    - SQLite storage
```

注意：这里的子进程是应用内部实现细节。用户仍然只安装和启动桌面 App，不需要单独运行服务。

## 5. 总体架构

```text
┌──────────────────────────────────────┐
│ Desktop App                           │
│ Electron + electron-vite              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Renderer                        │
│  │ Vue 3 / Element Plus            │
│  │ vue-element-plus-x              │
│  └───────────────┬────────────────┘  │
│                  │ IPC               │
│  ┌───────────────▼────────────────┐  │
│  │ Preload                         │
│  │ Safe typed API bridge           │
│  └───────────────┬────────────────┘  │
│                  │ IPC               │
│  ┌───────────────▼────────────────┐  │
│  │ Main Process                    │
│  │ Window / permission / runtime   │
│  └───────────────┬────────────────┘  │
│                  │ Internal API      │
│  ┌───────────────▼────────────────┐  │
│  │ Agent Runtime                   │
│  │ Agent adapters / tools          │
│  │ protocol adapters / gateway     │
│  └───────────────┬────────────────┘  │
└──────────────────┼───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ Providers / SDKs                      │
│ Claude / Codex / Cursor / Open Agent  │
│ OpenAI / Anthropic / custom providers │
└──────────────────────────────────────┘
```

## 6. Agent SDK 接入方式

Renderer 不直接依赖任何 Agent SDK。所有 Agent 都通过 Runtime 内部的 Adapter 接入。

统一接口示例：

```ts
export interface CodingAgent {
  id: string
  run(input: AgentRunInput): AsyncIterable<AgentEvent>
  stop(conversationId: string): Promise<void>
}
```

第一批 Adapter：

```text
ClaudeAgentAdapter  -> @anthropic-ai/claude-agent-sdk
CodexAgentAdapter   -> @openai/codex-sdk
CursorAgentAdapter  -> @cursor/sdk
OpenAgentAdapter    -> @codeany/open-agent-sdk
CustomAgentAdapter  -> OpenAI / Anthropic compatible endpoint
```

Agent 配置示例：

```ts
export interface AgentConfig {
  id: string
  name: string
  type: 'claude' | 'codex' | 'cursor' | 'open-agent' | 'custom'
  model?: string
  provider?: string
  systemPrompt?: string
  tools: string[]
  permissions: {
    readFile: boolean
    writeFile: boolean
    shell: boolean
    network: boolean
  }
  routingPolicy?: RoutingPolicy
}
```

## 7. 统一事件模型

UI 层只消费统一事件，不关心底层 SDK 的事件格式。

```ts
export type AgentEvent =
  | { type: 'message.started'; messageId: string }
  | { type: 'message.delta'; messageId: string; text: string }
  | { type: 'message.completed'; messageId: string }
  | { type: 'tool.started'; toolCallId: string; name: string; input?: unknown }
  | { type: 'tool.delta'; toolCallId: string; text: string }
  | { type: 'tool.completed'; toolCallId: string; result: unknown }
  | { type: 'tool.failed'; toolCallId: string; error: string }
  | { type: 'error'; error: string }
```

这样可以保证：

- vue-element-plus-x 只负责展示，不参与核心 Agent 逻辑。
- 不同 SDK 的 streaming、tool call、thinking、status 都可以被适配为统一事件。
- 后续替换 UI 组件库或新增 Agent SDK 不影响核心流程。

## 8. 本地 API Gateway

Gateway 是桌面 App 内嵌能力，可在设置中开启或关闭。

默认建议：

```text
Host: 127.0.0.1
Port: 3456
Auth: auto-generated local token
```

对外提供：

```text
POST http://127.0.0.1:3456/v1/chat/completions
POST http://127.0.0.1:3456/v1/messages
```

职责：

- 提供 OpenAI-compatible API。
- 提供 Anthropic-compatible API。
- 将外部请求转换为内部统一请求格式。
- 根据路由规则选择目标供应商或 Agent。
- 支持 fallback、成本策略和本地模型策略。

内部统一格式示例：

```ts
export interface UnifiedChatRequest {
  model: string
  messages: UnifiedMessage[]
  tools?: UnifiedTool[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  metadata?: Record<string, unknown>
}

export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: UnifiedContent[]
}

export type UnifiedContent =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'tool_result'; toolCallId: string; content: string }
```

Gateway 路由示例：

```yaml
routes:
  - match:
      protocol: openai
      model: claude-sonnet
    target:
      provider: anthropic
      model: claude-3-7-sonnet
      transform:
        from: openai
        to: anthropic

  - match:
      protocol: anthropic
      model: codex
    target:
      provider: openai
      model: gpt-4.1
      transform:
        from: anthropic
        to: openai

  - match:
      model: local-coder
    target:
      provider: ollama
      model: qwen2.5-coder
```

## 9. UI 组件分工

### 9.1 Element Plus

用于通用桌面 UI：

- Layout
- Button
- Dialog
- Drawer
- Form
- Select
- Dropdown
- Tabs
- Tree
- Menu
- Notification
- Settings pages

### 9.2 vue-element-plus-x

用于 AI 对话场景：

- Conversation list
- Bubble
- Sender / composer
- Typewriter
- Thinking state
- Prompt examples
- Markdown message display

建议通过项目自有组件进行二次封装：

```text
MessageList.vue
MessageBubble.vue
Composer.vue
ToolCallCard.vue
AgentSelector.vue
```

不要让业务状态直接绑定 vue-element-plus-x 的内部数据结构。

## 10. 推荐目录结构

```text
desktop-agent/
  electron.vite.config.ts
  package.json
  tsconfig.json

  src/
    main/
      index.ts
      window.ts
      ipc/
        chat-ipc.ts
        agent-ipc.ts
        settings-ipc.ts
      runtime/
        supervisor.ts
      security/
        permissions.ts

    preload/
      index.ts
      api/
        agent-api.ts

    renderer/
      src/
        main.ts
        App.vue
        router/
        stores/
          agent.store.ts
          chat.store.ts
          settings.store.ts
        views/
          ChatView.vue
          SettingsView.vue
        components/
          layout/
            AppShell.vue
            Sidebar.vue
            TopBar.vue
          chat/
            AgentSelector.vue
            MessageList.vue
            MessageBubble.vue
            Composer.vue
            ToolCallCard.vue
          workspace/
            FileTree.vue
            CodePreview.vue
            DiffViewer.vue
          terminal/
            TerminalPanel.vue
          settings/
            ProviderSettings.vue
            AgentSettings.vue
            GatewaySettings.vue

    runtime/
      index.ts
      agents/
        base-agent.ts
        claude-agent.ts
        codex-agent.ts
        cursor-agent.ts
        open-agent.ts
        custom-agent.ts
      gateway/
        server.ts
        routes/
          openai.ts
          anthropic.ts
        adapters/
          openai-adapter.ts
          anthropic-adapter.ts
      tools/
        file-tool.ts
        shell-tool.ts
        git-tool.ts
      storage/
        db.ts
      protocol/
        unified.ts
```

## 11. MVP 范围

第一版只保证最短闭环：

```text
Vue Chat UI
  -> IPC
  -> Agent Adapter
  -> 一个真实 Agent SDK
  -> Streaming 返回
  -> UI 展示
```

建议 MVP 功能：

- electron-vite + Vue 3 初始化。
- Element Plus + vue-element-plus-x 接入。
- 基础三栏或两栏布局。
- Agent 选择器。
- 会话列表和消息列表。
- Prompt 输入框与流式输出。
- Agent Runtime 统一接口。
- 至少接入一个真实 Agent SDK。
- 基础配置页：API Key、默认 Agent、默认模型。
- 本地 SQLite 保存会话和配置。

MVP 可以暂缓：

- 完整 Gateway 协议转换。
- 多供应商自动路由。
- MCP。
- 项目索引。
- 全量文件 patch review。
- 高级权限系统。

## 12. 分阶段实施路径

### 阶段 1：桌面壳与基础 UI

目标：

- 初始化 electron-vite + Vue 3 + TypeScript。
- 接入 Element Plus、vue-element-plus-x、Pinia、Vue Router。
- 实现主布局、会话列表、Agent 选择器和基础 Chat 页面。
- 定义 Renderer 与 Main 之间的 IPC API 边界。

输出：

- 可启动桌面 App。
- 可创建会话。
- 可选择 Agent。
- 可发送消息，但可以先使用 mock runtime。

### 阶段 2：Agent Runtime 与第一个 SDK

目标：

- 定义 `CodingAgent`、`AgentEvent`、`AgentConfig`。
- 接入第一个真实 SDK，优先选择 Claude 或 Codex。
- 支持 streaming 输出。
- 将 SDK 原生事件转换为统一 `AgentEvent`。
- 实现 stop/cancel。

输出：

- 可以通过真实 Agent SDK 完成一轮对话。
- UI 能展示流式结果、错误和完成状态。

### 阶段 3：会话存储与设置

目标：

- 引入 SQLite。
- 保存 conversations、messages、agent_configs、provider_configs。
- 实现设置页：API Key、默认 Agent、默认模型、Gateway 开关。
- 对敏感配置进行本地安全存储方案评估。

输出：

- 重启 App 后会话和配置可恢复。
- 用户可以配置 Agent 和模型。

### 阶段 4：多 Agent Adapter

目标：

- 接入 Claude、Codex、Cursor、Open Agent 和 Custom Agent。
- 将不同 SDK 的事件统一转换为 `AgentEvent`。
- 会话与 Agent 绑定，新建会话时选择 Agent。
- 支持自定义 Agent 配置。

输出：

- 用户可在会话入口切换不同 Agent。
- 同一套 Chat UI 适配多个 Agent 后端。

### 阶段 5：工具系统

目标：

- 定义统一 Tool 接口。
- 实现基础工具：
  - file.read
  - file.write
  - file.patch
  - shell.exec
  - git.status
  - git.diff
- 实现权限确认弹窗。
- 将工具调用结果回传给 Agent。

输出：

- Agent 可以读取文件、生成补丁、执行受控命令。
- UI 能展示 tool call 状态和结果。

### 阶段 6：本地 API Gateway

目标：

- 在 App 内嵌启动 Gateway。
- 支持 OpenAI-compatible `/v1/chat/completions`。
- 支持 Anthropic-compatible `/v1/messages`。
- 将 OpenAI / Anthropic 请求转换为内部 `UnifiedChatRequest`。
- 支持本地 token 鉴权和端口配置。

输出：

- 外部工具可使用本地地址调用当前 App 的模型路由能力。
- Gateway 随 App 启停，用户无需单独运行服务。

### 阶段 7：自动路由与协议适配增强

目标：

- 引入路由策略：
  - 按模型名路由。
  - 按 Agent 类型路由。
  - 按成本策略路由。
  - fallback。
- 完善 OpenAI <-> Anthropic 协议转换。
- 统一 streaming chunk。

输出：

- 不同供应商和不同协议可被转换为目标协议。
- 用户可通过本地 Gateway 获得统一 API。

### 阶段 8：工程化增强

目标：

- 将 Agent Runtime 从 Main Process 拆为内嵌子进程。
- 增加 Runtime supervisor、崩溃恢复和日志采集。
- 完善自动更新、错误上报、打包发布和签名流程。
- 评估 ElectronBun POC 结果，决定是否迁移部分 Runtime 到 Bun。

输出：

- 更稳定的长任务执行。
- 更清晰的进程隔离。
- 更适合生产发布的桌面应用。

## 13. 安全与权限原则

默认权限建议：

```text
文件读取: 允许，但限制在用户选择的 workspace 内
文件写入: 需要确认或受 Agent Mode 控制
Shell 执行: 默认需要确认
Git 操作: 默认需要确认
网络访问: 可配置
读取密钥: 禁止主动读取，API Key 只能来自用户配置
系统目录修改: 禁止
```

运行模式：

```text
Ask Mode: 只读，不改文件，不执行危险命令
Agent Mode: 可写文件和执行命令，但危险操作需要确认
Full Auto Mode: 自动执行，仅建议在隔离 workspace 或 git worktree 内使用
```

## 14. 关键风险

- Agent SDK 事件模型差异大，需要可靠 Adapter 层。
- tool call 与 streaming 的协议适配复杂，尤其是 OpenAI 与 Anthropic 的差异。
- 编程 Agent 的文件写入和 Shell 执行必须有权限控制。
- 本地 Gateway 暴露端口时必须默认绑定 `127.0.0.1` 并启用 token。
- SQLite、日志和配置文件需要区分用户数据目录与应用安装目录。
- ElectronBun 有潜力，但需验证 Bun 兼容性后再进入主线。

## 15. 当前建议

第一版按以下方向推进：

```text
Vue 3 + electron-vite + Element Plus + vue-element-plus-x
  -> Electron Main 内置 TypeScript Agent Runtime
  -> 先接入一个真实 Agent SDK
  -> 定义统一 Agent Adapter 与 AgentEvent
  -> 再逐步扩展多 Agent、本地 Gateway、工具系统和自动路由
```

这个路径可以最大化复用 TypeScript SDK 生态，同时保持最终交付物仍然是一个单一桌面应用。
