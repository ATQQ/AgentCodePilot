# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-06-21

### Added

- 多 Agent 统一入口，支持 Claude Code 与 Mock Agent 切换
- 工作区感知：项目目录选择、多文件夹工作区、文件树浏览
- 流式对话 UI：Markstream Markdown 渲染、Tool Call 展示、附件支持
- 本地 API Gateway：OpenAI-compatible / Anthropic-compatible HTTP 服务
- SQLite 持久化：会话、消息、Agent 与 Provider 配置
- 内置中文界面（vue-i18n）与浅色 / 深色 / 跟随系统主题
- Monaco Editor 文件预览与 Diff 查看
- 集成终端（xterm.js）与 Plan 文档管理
- 浏览器面板与链接自动提取
- GitHub Actions CI（lint / typecheck / build）与 tag 触发的多平台 Release 构建

### Known Limitations

- 安装包暂未做代码签名与 macOS 公证
- 自动更新（electron-updater）尚未接入，需手动下载新版本
- Codex / Cursor SDK、MCP 等能力仍在后续版本规划中

[0.0.1]: https://github.com/ATQQ/AgentCodePilot/releases/tag/v0.0.1
