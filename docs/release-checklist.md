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

- [x] 应用启动，窗口与侧边栏正常渲染
- [x] 选择工作区目录，文件树可浏览
- [x] Claude Code Agent 发送消息，流式回复正常
- [x] 切换到 Mock Agent，收到 mock 回复
- [x] Tool Call 卡片在需要工具调用时正常展示
- [] 本地 API Gateway 开启后，`curl` 可访问（见 step9-14 Step 11）
- [x] 重启应用后会话与配置保留（SQLite 持久化）
- [x] 浅色 / 深色 / 跟随系统主题切换正常

## 发版后验证

- [ ] GitHub Release 页面三平台 artifact 已上传
- [ ] 从 Release 下载安装包并完成安装启动
- [ ] Release Notes 中已说明未签名安装方式（macOS / Windows）

## 已知限制（首版）

- 安装包未做代码签名 / 公证
- Windows 可能触发 SmartScreen 警告
- 自动更新尚未启用，用户需手动下载新版本

### macOS 未签名安装

首次安装后若无法打开，按下面顺序尝试：

1. **右键「打开」**（不要双击），在弹窗中确认打开；或到「系统设置 → 隐私与安全性」中允许该应用。
2. 若提示 **「已损坏，无法打开」**（常见于从浏览器下载的 `.dmg` / `.zip`），在终端执行一次（清除隔离属性）：

```bash
xattr -cr /Applications/AgentCodePilot.app
```

执行后再次打开应用。若安装路径不同，把路径换成实际 `.app` 位置。

### Release Notes 模板（macOS 段落，可直接粘贴）

    ### macOS Note

    Because the app is currently unsigned, macOS may block or warn on first launch.

    1. Right-click the app and choose **Open**, then confirm in the dialog.
    2. If you see **"AgentCodePilot is damaged and can't be opened"**, run once in Terminal (adjust the path if needed):

           xattr -cr /Applications/AgentCodePilot.app

    Then open the app again.

### Release Notes 模板（Windows 段落，可直接粘贴）

    ### Windows Note

    Windows SmartScreen may warn that the publisher is unknown. Click **More info** → **Run anyway** to proceed.
