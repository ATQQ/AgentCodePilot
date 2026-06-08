# 桌面编程 Agent MVP 执行计划

本文档用于指导第一版 MVP 的逐步实现。每一步都应独立完成、独立验证；只有当前步骤的验收标准通过后，再进入下一步。

## 执行原则

- 一次只推进一个步骤，避免同时修改过多模块。
- 每一步都要有可运行、可观察、可回退的结果。
- 先用 mock 打通 UI 与 IPC，再接入真实 Agent SDK。
- 先完成单 Agent 闭环，再扩展多 Agent。
- 先保证桌面 App 内部可用，再开放本地 API Gateway。
- 每一步完成后提交一次清晰 commit，方便定位问题和回滚。

## 本机验证约定

桌面 App 的真实构建、启动和交互验证以用户本机为准。实现方完成每一步代码变更并提交后，用户将代码拉取到自己的 Mac Arm 机器上执行安装、启动和构建验证，并反馈结果是否符合预期以及是否需要进一步修改；确认通过后再进入下一步。

后续项目初始化后，若第一版确认使用 `pnpm`，Mac Arm 本机验证命令可按以下模板执行：

```bash
pnpm install
pnpm dev
pnpm build
```

如需验证 macOS 打包产物，可在打包脚本就绪后执行：

```bash
pnpm build:mac
```

每一步的验证反馈建议包含：

- 当前机器信息：macOS 版本、芯片类型、Node.js 版本、包管理器版本。
- 执行的命令。
- 是否成功启动桌面窗口。
- 控制台或终端是否有错误。
- 页面交互是否符合当前步骤预期。
- 如不符合预期，附上错误日志、截图或复现步骤。

## Step 0：项目初始化确认

目标：

- 确认仓库准备好进入 electron-vite + Vue 3 MVP 初始化。
- 明确包管理器和基础工程约定。

实施内容：

- 确认使用 `pnpm`、`npm`、`yarn` 或 `bun` 中的哪一个作为第一版包管理器。
- 确认 Node.js 版本要求。
- 确认应用名称、窗口标题和基础目录结构。
- 确认第一版只做 Electron，不引入 Tauri 或 ElectronBun。

建议产出：

```text
package.json
electron.vite.config.ts
tsconfig.json
src/main/
src/preload/
src/renderer/
```

验证方式：

- 能安装依赖。
- 能启动 electron-vite dev server。
- 能打开空白 Electron 窗口。
- `git status` 中只包含预期初始化文件。

进入下一步条件：

- 桌面窗口可以稳定打开。
- renderer、main、preload 三端 TypeScript 编译无明显错误。

## Step 1：基础桌面壳与路由

目标：

- 搭建 App 基础骨架，不接入真实 Agent。

实施内容：

- 初始化 Vue 3 应用入口。
- 接入 Vue Router。
- 创建基础页面：
  - `HomeView.vue`
  - `ChatView.vue`
  - `SettingsView.vue`
- 创建基础布局：
  - `AppShell.vue`
  - `AppSidebar.vue`
  - `TopBar.vue`
- 配置默认路由 `/` 指向首页。

验证方式：

- 启动应用后默认进入首页。
- 可以在首页、聊天页、设置页之间切换。
- 刷新或热更新后页面不崩溃。
- DevTools 无关键运行时错误。

进入下一步条件：

- 路由、布局和窗口基础生命周期稳定。

## Step 2：接入 Element Plus 与 vue-element-plus-x

目标：

- 建立第一版 UI 组件体系。

实施内容：

- 安装并接入 Element Plus。
- 安装并接入 vue-element-plus-x。
- 配置全局样式。
- 建立设计变量：
  - 侧栏宽度。
  - 背景色。
  - 输入框尺寸。
  - 字体大小。
- 创建基础 UI 组件：
  - `SidebarNavSection.vue`
  - `HomeEmptyState.vue`
  - `PromptComposer.vue`
  - `AgentSelector.vue`
  - `ModelSelector.vue`
  - `WorkspaceSelector.vue`

验证方式：

- Element Plus 组件可正常渲染。
- vue-element-plus-x 的基础对话或输入组件可正常渲染。
- UI 在 Electron 窗口缩放时不明显错位。
- 无样式全局污染导致的布局异常。

进入下一步条件：

- 首页基础视觉结构可用。
- 组件库和自有组件边界清晰。

## Step 3：实现首页布局

目标：

- 按 Cursor Agent 和 Codex Desktop 的参考完成第一版首页。

实施内容：

- 左侧侧栏包含：
  - New Agent。
  - Conversations。
  - Search。
  - Skills。
  - Automations。
  - Projects。
  - Settings。
- 主区域包含：
  - 欢迎标题，例如“我们该做什么？”。
  - 中央 Prompt Composer。
  - Agent / Model / Mode 选择。
  - Workspace 选择。
- 空状态下不展示复杂工具面板。
- 代码预览、终端、diff 暂不进入首页主路径。

验证方式：

- 无会话时展示清晰空状态。
- Composer 可以输入多行文本。
- Agent、Model、Workspace 下拉可以打开和选择 mock 数据。
- 窗口宽度变化时侧栏和主区域布局仍可用。

进入下一步条件：

- 首页已经可以作为后续任务入口。
- 视觉层不阻塞后续 IPC 和 Runtime 接入。

## Step 4：定义 Renderer 状态模型

目标：

- 在 UI 层建立稳定的数据结构，先使用 mock 数据。

实施内容：

- 接入 Pinia。
- 创建 stores：
  - `agent.store.ts`
  - `chat.store.ts`
  - `workspace.store.ts`
  - `settings.store.ts`
- 定义基础类型：
  - `AgentConfig`
  - `Conversation`
  - `Message`
  - `Workspace`
  - `ModelConfig`
- 使用 mock 数据驱动首页和会话列表。

验证方式：

- 切换 Agent 后 UI 状态正确更新。
- 新建 mock 会话后出现在会话列表。
- 输入框提交后可以生成一条本地 user message。
- 页面切换时状态不丢失。

进入下一步条件：

- UI 不依赖真实后端即可完成基本交互。
- 数据结构可以支撑后续 IPC 接入。

## Step 5：建立 Preload IPC API

目标：

- 建立 Renderer 到 Main 的安全通信边界。

实施内容：

- 在 preload 中通过 `contextBridge` 暴露 `window.agentAPI`。
- 第一版 API：

```ts
window.agentAPI.agents.list()
window.agentAPI.chat.createConversation()
window.agentAPI.chat.sendMessage(payload)
window.agentAPI.chat.stop(conversationId)
window.agentAPI.settings.get()
window.agentAPI.settings.update(payload)
```

- Renderer 只能通过 preload 调用 Main，不直接访问 Node.js API。
- 为 `window.agentAPI` 增加 TypeScript 声明。

验证方式：

- Renderer 可以调用 `agents.list()` 获取 mock Agent。
- Renderer 可以调用 `chat.sendMessage()` 获取 mock 回复。
- 禁用 Node integration 后 Renderer 仍可正常工作。
- DevTools 中不能直接访问 `require`、`fs` 等 Node API。

进入下一步条件：

- IPC 边界稳定。
- UI 可以通过 IPC 获取 mock 数据。

## Step 6：实现 Mock Agent Runtime

目标：

- 在不接入真实 SDK 的情况下打通完整聊天链路。

实施内容：

- 在 Main 或 Runtime 目录中定义：
  - `CodingAgent`
  - `AgentRunInput`
  - `AgentEvent`
  - `MockAgentAdapter`
- `MockAgentAdapter` 支持流式返回：
  - `message.started`
  - `message.delta`
  - `message.completed`
- Main IPC 将 Runtime 事件转发给 Renderer。
- UI 使用统一事件更新消息内容。

验证方式：

- 从首页输入任务后进入或创建会话。
- mock assistant 消息可以逐字或分块显示。
- stop 按钮可以中断 mock streaming。
- 多次发送消息不会串流到错误会话。

进入下一步条件：

- Chat UI、IPC、Runtime 事件流完整可用。
- 后续替换为真实 SDK 时不需要重写 UI。

## Step 7：接入第一个真实 Agent SDK

目标：

- 完成第一个真实 Agent 闭环。

建议优先级：

1. Claude Agent SDK。
2. Codex SDK。
3. Cursor SDK。
4. Open Agent SDK。

实施内容：

- 新增第一个真实 Adapter，例如 `ClaudeAgentAdapter`。
- 将 SDK 原生输入转换为内部 `AgentRunInput`。
- 将 SDK 原生输出转换为内部 `AgentEvent`。
- 支持 API Key 配置。
- 支持 streaming。
- 支持错误映射。
- 暂时不实现复杂 tool call，先完成纯文本对话。

验证方式：

- 配置 API Key 后可以发起真实请求。
- UI 可以展示真实流式回复。
- API Key 缺失时有明确错误提示。
- 网络错误或鉴权错误能显示在 UI 中。
- stop/cancel 不会导致应用崩溃。

进入下一步条件：

- 至少一个真实 Agent SDK 可稳定完成多轮对话。

## Step 8：会话与配置持久化

目标：

- 支持重启后恢复会话和基础配置。

实施内容：

- 引入 SQLite。
- 建立基础表：
  - `conversations`
  - `messages`
  - `agent_configs`
  - `provider_configs`
  - `settings`
- 保存：
  - 会话标题。
  - 消息内容。
  - 选中的 Agent。
  - 选中的模型。
  - Provider 配置。
- 明确数据库文件位于用户数据目录，不放在安装目录。

验证方式：

- 创建会话后重启 App，历史会话仍存在。
- 消息内容可恢复。
- 默认 Agent 和默认模型可恢复。
- 删除或损坏数据库时有可理解的降级行为。

进入下一步条件：

- 基础数据持久化可靠。
- 不影响现有聊天链路。

## Step 9：多 Agent Adapter 框架

目标：

- 在已有单 Agent 成功的基础上扩展到多 Agent。

实施内容：

- 新增 Adapter registry：

```ts
AgentRegistry.register('claude', new ClaudeAgentAdapter())
AgentRegistry.register('codex', new CodexAgentAdapter())
AgentRegistry.register('cursor', new CursorAgentAdapter())
AgentRegistry.register('open-agent', new OpenAgentAdapter())
AgentRegistry.register('custom', new CustomAgentAdapter())
```

- 会话创建时绑定 `agentId`。
- AgentSelector 展示真实配置。
- 不同 Agent 共用同一套 UI 和事件模型。
- 对暂未接入成功的 SDK 保留 disabled 状态和说明。

验证方式：

- 不同会话可以绑定不同 Agent。
- 切换 Agent 不影响已有会话历史。
- 未配置 API Key 的 Agent 不允许直接运行，并给出提示。
- 已接入的 Agent 可以正常 streaming。

进入下一步条件：

- 多 Agent 选择和会话绑定逻辑稳定。

## Step 10：基础工具系统

目标：

- 为编程场景引入受控工具能力。

实施内容：

- 定义统一 Tool 接口：

```ts
interface AgentTool {
  name: string
  description: string
  execute(input: unknown, context: ToolContext): Promise<ToolResult>
}
```

- 第一批工具：
  - `file.read`
  - `file.write`
  - `file.patch`
  - `shell.exec`
  - `git.status`
  - `git.diff`
- 增加权限确认弹窗。
- UI 展示 tool call card。

验证方式：

- Agent 或 mock Agent 可以触发工具调用。
- 文件读取限制在 workspace 内。
- 文件写入需要确认。
- Shell 执行需要确认。
- 工具结果可以回传并展示。

进入下一步条件：

- 工具调用链路可控。
- 权限边界不绕过 Renderer / Main 的安全模型。

## Step 11：本地 API Gateway MVP

目标：

- 让桌面 App 可以可选暴露本地 OpenAI-compatible API。

实施内容：

- 在 App 内嵌启动 HTTP server。
- 默认关闭 Gateway，用户在设置中开启。
- 默认绑定 `127.0.0.1`。
- 默认端口 `3456`。
- 自动生成本地 token。
- 第一版只实现：

```text
POST /v1/chat/completions
```

- 将 OpenAI-compatible 请求转换为内部 `UnifiedChatRequest`。
- 路由到当前默认 Agent 或指定模型。

验证方式：

- 关闭 Gateway 时端口不监听。
- 开启 Gateway 后可用 curl 调用。
- 无 token 请求被拒绝。
- 有 token 请求可获得 streaming 或非 streaming 回复。
- 退出 App 后端口释放。

进入下一步条件：

- Gateway 不影响桌面内部聊天。
- 本地端口、安全和生命周期可控。

## Step 12：Anthropic-compatible Gateway 与协议适配

目标：

- 扩展 Gateway，支持 Anthropic-compatible API。

实施内容：

- 新增：

```text
POST /v1/messages
```

- 实现：
  - OpenAI request -> UnifiedChatRequest。
  - Anthropic request -> UnifiedChatRequest。
  - UnifiedChatResponse -> OpenAI response。
  - UnifiedChatResponse -> Anthropic response。
- 统一 streaming chunk。
- 对 tool call 做最小可用映射。

验证方式：

- OpenAI-compatible 客户端可调用 `/v1/chat/completions`。
- Anthropic-compatible 客户端可调用 `/v1/messages`。
- system prompt、messages、max tokens、temperature 能正确映射。
- streaming 格式符合目标协议的基本预期。

进入下一步条件：

- 双协议 Gateway 基础可用。
- 协议转换有单元测试或可重复验证脚本。

## Step 13：自动路由与 fallback

目标：

- 实现基础模型路由和失败兜底。

实施内容：

- 定义 routing rules。
- 支持按模型名路由：
  - `claude-*` -> Anthropic / Claude Agent。
  - `gpt-*` -> OpenAI / Codex。
  - `cursor-*` -> Cursor。
  - `custom-*` -> Custom endpoint。
- 支持 fallback 列表。
- 在设置页展示路由规则。

验证方式：

- 指定不同 model 能进入不同 Adapter。
- 主路由失败后可以进入 fallback。
- fallback 发生时 UI 或日志中有可见记录。
- 路由循环和未知模型有明确错误。

进入下一步条件：

- 本地 Gateway 可根据规则自动选择目标。

## Step 14：工程化与生产化准备

目标：

- 提高稳定性、可调试性和可发布性。

实施内容：

- 将 Agent Runtime 从 Main Process 拆为内嵌 child process。
- 增加 Runtime supervisor。
- 增加日志目录和日志查看入口。
- 增加崩溃恢复。
- 增加打包配置。
- 增加基础 CI。
- 评估 ElectronBun POC 是否值得进入后续路线。

验证方式：

- Runtime 崩溃后 App 不崩溃。
- Runtime 可自动重启或提示用户重启。
- 打包后应用可启动。
- 用户数据目录、日志目录和数据库路径正确。

进入下一步条件：

- MVP 具备继续迭代到 Beta 的工程基础。

## 推荐执行顺序

```text
Step 0  项目初始化确认
Step 1  基础桌面壳与路由
Step 2  UI 组件体系
Step 3  首页布局
Step 4  Renderer 状态模型
Step 5  Preload IPC API
Step 6  Mock Agent Runtime
Step 7  第一个真实 Agent SDK
Step 8  会话与配置持久化
Step 9  多 Agent Adapter
Step 10 基础工具系统
Step 11 本地 OpenAI-compatible Gateway
Step 12 Anthropic-compatible Gateway 与协议适配
Step 13 自动路由与 fallback
Step 14 工程化与生产化准备
```

## 每一步的通用验收清单

每一步完成后都应检查：

- 应用能正常启动。
- 控制台无关键错误。
- 当前步骤的主要交互可重复验证。
- 新增代码有清晰边界。
- 不引入与当前步骤无关的大规模重构。
- 文档或注释更新到足以支撑下一步开发。
- 提交信息清晰描述本步骤变更。

## 暂停点

建议在以下步骤后主动暂停确认：

- Step 3：首页布局完成后，确认视觉和交互方向。
- Step 6：Mock Runtime 完成后，确认 UI / IPC / streaming 架构。
- Step 7：第一个真实 SDK 接入后，确认 SDK 选型和事件模型。
- Step 10：工具系统完成后，确认权限策略。
- Step 12：双协议 Gateway 完成后，确认外部 API 兼容性。

这些暂停点适合作为阶段性评审点，确认没有方向性问题后再进入下一阶段。
