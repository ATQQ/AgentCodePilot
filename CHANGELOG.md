# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-28

### Added

- Cursor Agent 集成（@cursor/sdk）：Agent / Plan 模式、Tool Call 展示与状态追踪、Token 用量统计
- Codex Agent 集成（@openai/codex-sdk）：沙箱模式配置与 API Key 管理
- Agent 目录管理：外部配置指纹检测、模型发现与统一配置界面
- 会话状态追踪：对话进行中 / 完成状态标签，当前会话完成后「完成」标签 3 秒自动消失
- 内置浏览器增强：本地 HTML 文件加载与自动识别预览，对话中的链接可跳转浏览器
- 工作区文件操作：右键菜单新建文件夹、重命名文件与目录
- 对话纯文本自动链接化（LinkifiedPlainText）

### Changed

- 优化 Cursor / Codex Agent 的 Tool Call 生命周期管理与跨 Agent 状态追踪
- 更新侧栏会话状态标签配色
- 增强调试信息序列化

### Fixed

- 修复 chat store 中 `toolUseIdAliases` 初始化语法错误

### Known Limitations

- 安装包暂未做代码签名与 macOS 公证
- 自动更新（electron-updater）尚未接入，需手动下载新版本
- MCP 等能力仍在后续版本规划中

## [0.0.1] - 2026-06-27

### Added

- 多 Agent 统一入口：Claude Code、Mock Agent 切换，Agent 专属头像与 Claude 模型动态选择
- 工作区感知：项目目录选择、多文件夹工作区、文件树浏览、项目软删除与恢复
- 流式对话 UI：Markstream Markdown 渲染（含 KaTeX 公式与 Mermaid 图表）、Tool Call 展示与生命周期管理
- 审批管理：Agent 工具调用权限审批与 scope 控制
- Plan 模式：Composer 中 Plan 模式切换、Plan 文档管理与自动打开
- 附件支持：文件 / 图片 / URL 附件，持久化存储与应用内图片预览
- 本地 API Gateway：OpenAI-compatible / Anthropic-compatible HTTP 服务，支持 model 路由与 fallback
- SQLite 持久化：会话、消息、Agent、Provider 与项目配置
- IDE 工作台：Monaco Editor 文件预览与 Diff 查看、集成终端（xterm.js）、浏览器面板与链接自动提取
- Git 集成：仓库状态查看、Diff 对比与变更丢弃
- 会话管理：归档会话、Spotlight 式搜索（Cmd+G）、全局快捷键与用户消息折叠
- 内置中文界面（vue-i18n）与浅色 / 深色 / 跟随系统主题
- 运行时监督、日志与崩溃恢复
- macOS（dmg / zip，arm64 / x64）、Windows（msi / portable）、Linux（AppImage / deb / rpm，x64 / arm64）多平台安装包
- GitHub Actions CI（lint / typecheck / build）与 tag 触发的 Release 自动化

### Changed

- 优化 AppShell、AppSidebar 与 ExtensionPanel 布局样式
- 增强终端焦点管理、Shell 环境集成与可见性处理
- 简化 ChatMessageList，ChatView 直接渲染消息流

### Known Limitations

- 安装包暂未做代码签名与 macOS 公证
- 自动更新（electron-updater）尚未接入，需手动下载新版本
- Codex / Cursor SDK、MCP 等能力仍在后续版本规划中

[0.1.0]: https://github.com/ATQQ/AgentCodePilot/releases/tag/v0.1.0
[0.0.1]: https://github.com/ATQQ/AgentCodePilot/releases/tag/v0.0.1
