# Cursor Agent（已停用，源码保留）

实现仍在本目录：`cursor-*.ts`。当前**未注册、未进依赖、且被 `tsconfig.node.json` exclude**，因此不参与编译。

## 恢复步骤

1. `apps/desktop/package.json` 的 `dependencies` 加回：
   ```json
   "@cursor/sdk": "^1.0.22"
   ```
2. `apps/desktop/tsconfig.node.json` — 删掉 `exclude` 里所有 `cursor-*.ts`
3. 取消注释：
   - `agent-registry-init.ts` 里的 Cursor 注册块
   - `model-catalog.ts` 里的 import / `case 'cursor'`
   - `gateway/router.ts` 里的 `{ pattern: 'cursor*', agentId: 'cursor' }`
4. （可选）恢复 UI：设置页 / `MODEL_SELECTOR_AGENTS` / AgentSelector / i18n 中的 Cursor 项
5. `pnpm install && pnpm typecheck`
6. （可选）根目录：`"verify:cursor-sdk": "node scripts/verify-cursor-sdk.mjs"`
