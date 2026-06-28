# Step 9-14 验证指南

本文档用于验证 MVP 执行计划 Step 9 ~ Step 14 的实现。

## 前置条件

```bash
pnpm install
pnpm dev
```

确保应用正常启动并打开桌面窗口。

---

## Step 9: 多 Agent Adapter 框架

### 验证 1：Agent 列表来自 Registry

打开 DevTools Console（Cmd+Option+I），执行：

```js
await window.agentAPI.agents.list()
```

预期返回：

```json
[
  { "id": "claude-code", "name": "Claude Code", "enabled": true },
  { "id": "mock", "name": "Mock Agent", "enabled": true }
]
```

### 验证 2：切换 Agent 会话

1. 在 Composer 的 Agent 下拉中切换到 **Mock Agent**
2. 发送任意消息
3. 应收到 mock 回复（固定的 Markdown 格式分析结果）
4. 切换回 **Claude Code**，发送消息
5. 应走真实 Claude Agent SDK，返回真实回复

### 验证 3：Provider 配置 IPC

```js
// 保存一个 provider 配置
await window.agentAPI.providers.save({
  id: 'test-provider',
  name: 'Test',
  type: 'openai',
  config: { apiKey: 'sk-test' }
})

// 列出配置
await window.agentAPI.providers.list()
// 应包含刚保存的 test-provider

// 删除
await window.agentAPI.providers.delete('test-provider')
```

---

## Step 10: 基础工具系统

### 验证 1：Tool Call Card 显示

1. 选择 **Claude Code** Agent
2. 发送需要工具调用的指令：
   ```
   读取当前目录下的 package.json 文件内容
   ```
3. 在 assistant 消息顶部应看到 **ToolCallCard** 组件
4. Card 显示：工具名（如"读取文件"）、文件路径、状态图标（旋转→完成）

### 验证 2：多工具调用

发送：
```
列出当前目录的文件，然后读取 README.md
```

应看到多个 ToolCallCard 依次出现。

---

## Step 11-12: 本地 API Gateway（OpenAI + Anthropic 双协议）

### 验证 1：启动 Gateway

在 DevTools Console 执行：

```js
const status = await window.agentAPI.gateway.start()
console.log(status)
// { running: true, host: '127.0.0.1', port: 3456, token: 'agp-...' }
```

记录返回的 `token` 值。

### 验证 2：模型列表

```bash
curl http://127.0.0.1:3456/v1/models \
  -H "Authorization: Bearer <token>"
```

预期返回包含已注册 Agent 的模型列表。

### 验证 3：无 Token 被拒绝

```bash
curl http://127.0.0.1:3456/v1/models
```

预期返回 HTTP 401：

```json
{ "error": { "message": "Invalid or missing authentication token", "type": "authentication_error" } }
```

### 验证 4：OpenAI-compatible（非 streaming）

```bash
curl http://127.0.0.1:3456/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-code",
    "messages": [{"role": "user", "content": "回复 hello world，不要做其他事"}],
    "stream": false
  }'
```

预期返回 OpenAI 格式的 JSON 响应。

### 验证 5：OpenAI-compatible（streaming）

```bash
curl http://127.0.0.1:3456/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-code",
    "messages": [{"role": "user", "content": "回复 hello world，不要做其他事"}],
    "stream": true
  }'
```

预期返回 SSE 格式的 `data: {...}` 流，最后以 `data: [DONE]` 结束。

### 验证 6：Anthropic-compatible（非 streaming）

```bash
curl http://127.0.0.1:3456/v1/messages \
  -H "x-api-key: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-code",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "回复 hello world，不要做其他事"}],
    "stream": false
  }'
```

预期返回 Anthropic 格式的 JSON（含 `type: "message"`, `content: [{type: "text", ...}]`）。

### 验证 7：Anthropic-compatible（streaming）

```bash
curl http://127.0.0.1:3456/v1/messages \
  -H "x-api-key: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-code",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "回复 hello world，不要做其他事"}],
    "stream": true
  }'
```

预期返回 Anthropic SSE 格式（`event: message_start`, `event: content_block_delta`, `event: message_stop`）。

### 验证 8：停止 Gateway

```js
await window.agentAPI.gateway.stop()
```

再执行 curl 应连接失败（Connection refused）。

### 验证 9：退出 App 释放端口

1. 启动 Gateway
2. 退出 App
3. `curl http://127.0.0.1:3456/v1/models` 应连接失败

---

## Step 13: 自动路由与 Fallback

### 验证 1：模型名路由

Gateway 启动后：

```bash
# 路由到 Mock Agent（秒回固定内容）
curl http://127.0.0.1:3456/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mock",
    "messages": [{"role": "user", "content": "test"}],
    "stream": false
  }'
```

Mock Agent 返回固定的 Markdown 分析结果，响应几乎瞬间完成。

```bash
# 路由到 Claude Code（真实 SDK）
curl http://127.0.0.1:3456/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-code",
    "messages": [{"role": "user", "content": "说 hi"}],
    "stream": false
  }'
```

### 验证 2：未知模型走 Fallback

```bash
curl http://127.0.0.1:3456/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "unknown-model-xyz",
    "messages": [{"role": "user", "content": "test"}],
    "stream": false
  }'
```

应走 fallback 链（claude-code → mock），不会报错。

---

## Step 14: 工程化与生产化准备

### 验证 1：日志文件

```bash
ls ~/.agent-desktop-app-dev/logs/
cat ~/.agent-desktop-app-dev/logs/app-$(date +%Y-%m-%d).log
```

预期看到：

```
[2026-...] [INFO] [App] Starting AgentCodePilot v0.1.0
```

### 验证 2：Supervisor 重试

在 Console 观察发送消息时的日志：

```bash
tail -f ~/.agent-desktop-app-dev/logs/app-$(date +%Y-%m-%d).log
```

发送消息后应看到：

```
[INFO] [Supervisor] Starting run: agent=claude-code, conv=conv-...
```

### 验证 3：崩溃恢复

1. 发送消息过程中断网（关闭 Wi-Fi）
2. 应在 UI 看到错误提示，而非 App 崩溃或无响应
3. App 仍可正常使用（恢复网络后可继续发消息）

### 验证 4：构建打包

```bash
pnpm build
# typecheck + vite build 全部通过

pnpm build:mac
# 生成 .dmg 安装包（可选验证）
```

---

## 快速一键验证路径

最简验证路径（约 2 分钟）：

```bash
# 1. 启动应用
pnpm dev

# 2. 在 DevTools Console
status = await window.agentAPI.gateway.start()
# 记录 token

# 3. 另开终端，验证 Gateway
export TOKEN="<粘贴token>"
curl -s http://127.0.0.1:3456/v1/models -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://127.0.0.1:3456/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"mock","messages":[{"role":"user","content":"test"}],"stream":false}' | jq .

# 4. 验证日志
cat ~/.agent-desktop-app-dev/logs/app-$(date +%Y-%m-%d).log

# 5. 在应用中切换 Agent、发消息、观察 ToolCallCard
```

---

## Step 15: Codex Agent Adapter

### 验证 1：Registry 注册

```js
await window.agentAPI.agents.list()
// 应包含 { id: 'codex', name: 'Codex', enabled: true }
```

### 验证 2：模型目录

```js
await window.agentAPI.agents.listModels('codex', true)
// 优先读取 ~/.codex/config.toml 的 model_provider.base_url + auth.json
// 并请求 {base_url}/models；失败时回退到 config.toml 中的 model
```

### 验证 3：App 内对话

1. 在设置 → Agent 配置 → Codex 中填写 API Key（或设置 `OPENAI_API_KEY`）
2. Composer 选择 **Codex**，发送「列出当前目录有哪些文件」
3. 若本地 `codex` CLI 已可用，**无需在 App 内填写 API Key**（会自动读取 `~/.codex/config.toml` 与 `auth.json`）
4. 应收到真实 Codex 回复（非 Mock）
4. 同会话追问「刚才列出了什么」——多轮上下文应正常
5. 点击 Stop 不应崩溃

### 验证 4：会话恢复

1. 完成一轮 Codex 对话后重启 App
2. 打开同一会话继续提问
3. `agent_session_id` 应恢复 Codex thread

---

## Step 16: Cursor Agent Adapter

### 验证 1：Registry 注册

```js
await window.agentAPI.agents.list()
// 应包含 { id: 'cursor', name: 'Cursor', enabled: true }
// 若 Node < 22.13，cursor 不会出现
```

### 验证 2：模型目录

```js
await window.agentAPI.agents.listModels('cursor', true)
// 配置 CURSOR_API_KEY 后应返回 composer-2.5 等模型
```

### 验证 3：App 内流式对话

1. 设置 → Agent 配置 → Cursor 填写 API Key（或设置 `CURSOR_API_KEY`，或已在终端 `agent login`）
2. Composer 选择 **Cursor**，模型选 `composer-2.5`
3. 发送「这个仓库是做什么的？」——应看到流式 assistant 文本（优先走本机 `agent` CLI，日志分类 `[CursorCli]`）
4. 追问「重点看 apps/desktop」——上下文应保留（CLI session UUID 写入 `agent_session_id`）
5. Stop 按钮应正常中止

### 验证 4：工具调用（可选）

发送「读取 package.json 内容」，应出现 ToolCallCard。

### 验证 6：重启后工具调用与停止状态

1. 用 Cursor 发送「列出当前目录文件」（或任意会触发 Read/Bash 的指令）
2. ToolCallCard 应显示 **开始时间** 与 **耗时**
3. 完全退出 App 并重启，打开同一会话 — 工具卡片与时间信息仍在
4. 另开一轮对话，流式生成中点击 **Stop** — 应显示「已手动停止」徽章
5. 重启 App 后该条 assistant 消息仍保留停止徽章

> 工具调用写入 `messages.tool_calls`（JSON）；停止状态写入 `messages.stopped`。

### 验证 5：设置页

- Codex / Cursor 标签页可配置 API Key、沙箱/模式
- 切换 Agent 后模型下拉列表应刷新

