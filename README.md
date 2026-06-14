# AgentCodePilot

> 统一的 AI 编程 Agent 桌面应用 —— 在一个 App 里调度 Claude、Codex、Cursor 等多种 Agent。

AgentCodePilot 是一款面向编程场景的桌面 Agent 应用，交互形态参考 Cursor Agents、Codex Desktop、Claude Desktop。用户只需安装并启动一个应用，即可选择不同 Agent、绑定工作区、进行流式对话，并通过内置本地 API Gateway 对外暴露兼容 OpenAI / Anthropic 协议的接口。

## 特性

- **多 Agent 统一入口** — 在会话中切换 Claude Code、Codex、Cursor 及自定义 Agent，屏蔽不同 SDK 与协议差异
- **工作区感知** — 支持选择项目目录与多文件夹工作区，Agent 在指定 `cwd` 下运行
- **流式对话 UI** — 基于 Markstream 的 Markdown 渲染、Tool Call 展示与附件支持
- **本地 API Gateway** — 可选开启 OpenAI-compatible / Anthropic-compatible 本地 HTTP 服务
- **持久化存储** — SQLite 保存会话、消息与配置
- **国际化** — 内置中文界面（vue-i18n）
- **主题** — 支持浅色 / 深色 / 跟随系统

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron |
| 构建 | electron-vite |
| 渲染层 | Vue 3 + TypeScript |
| UI | Element Plus、vue-element-plus-x |
| 状态 | Pinia + Vue Router |
| Markdown | markstream-vue |
| 存储 | better-sqlite3 (SQLite) |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` 等 |

## 项目结构

```text
agent-desktop-app/
├── apps/
│   └── desktop/          # Electron 桌面应用
│       ├── src/
│       │   ├── main/     # 主进程：Agent Runtime、Gateway、SQLite
│       │   ├── preload/  # 安全 IPC 桥接
│       │   └── renderer/ # Vue 3 渲染进程 UI
│       └── electron-builder.yml
├── packages/             # 共享包（预留）
└── docs/                 # 技术方案与执行计划
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9
- macOS / Windows / Linux

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

启动后会打开 Electron 窗口，支持热更新。

### 构建

```bash
# 仅构建（不打包）
pnpm build

# macOS 安装包
pnpm build:mac

# Windows 安装包
pnpm -C apps/desktop build:win

# Linux 安装包
pnpm -C apps/desktop build:linux
```

### 其他命令

```bash
pnpm lint        # ESLint 检查
pnpm format      # Prettier 格式化
pnpm typecheck   # TypeScript 类型检查
```

## 架构概览

```text
Vue Renderer
  → Preload IPC
  → Electron Main
      → Agent Runtime（Claude / Mock 等 Adapter）
      → Local Gateway（OpenAI / Anthropic 兼容）
      → SQLite
```

Agent Runtime 通过统一 Adapter 接口接入不同 SDK；Gateway 将外部 HTTP 请求路由到已注册的 Agent，便于 IDE 插件或其他工具复用本地 Agent 能力。

更多设计细节见 [docs/desktop-agent-technical-plan.md](./docs/desktop-agent-technical-plan.md)。

## 路线图

- [x] 桌面 UI 与会话管理 MVP
- [x] Claude Agent SDK 接入
- [x] 本地 API Gateway
- [ ] Codex / Cursor SDK 接入
- [ ] MCP、Shell、Git 等工具能力
- [ ] Monaco Editor、终端集成
- [ ] 自动更新与签名发布

## 许可证

[MIT](./LICENSE) © sugar
