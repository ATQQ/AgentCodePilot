# v1.0.0 发布验证清单

发版前按顺序执行。详细步骤见 [step9-14-verification.md](./step9-14-verification.md)。

## 自动化检查

```bash
pnpm install
pnpm check          # typecheck + lint + format:check + build
```

## 本地打包冒烟

```bash
pnpm build:unpack   # 快速验证产物目录
pnpm build:mac      # 或目标平台 build:win / build:linux
```

安装打包产物并确认应用能正常启动。

## 功能冒烟（约 15 分钟）

- [ ] 应用启动，窗口与侧边栏正常渲染
- [ ] 选择工作区目录，文件树可浏览
- [ ] Claude Code Agent 发送消息，流式回复正常
- [ ] 切换到 Mock Agent，收到 mock 回复
- [ ] Tool Call 卡片在需要工具调用时正常展示
- [ ] 本地 API Gateway 开启后，`curl` 可访问（见 step9-14 Step 11）
- [ ] 重启应用后会话与配置保留（SQLite 持久化）
- [ ] 浅色 / 深色 / 跟随系统主题切换正常

## 发版后验证

- [ ] GitHub Release 页面三平台 artifact 已上传
- [ ] 从 Release 下载安装包并完成安装启动
- [ ] Release Notes 中已说明未签名安装方式（macOS / Windows）

## 已知限制（首版）

- 安装包未做代码签名 / 公证，macOS 需右键「打开」或系统设置中允许
- Windows 可能触发 SmartScreen 警告
- 自动更新尚未启用，用户需手动下载新版本
