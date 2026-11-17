# FND-004 测试方案

## PASS 的本轮断言

1. `scripts/fnd004/run-all.mjs` 使用真实 `ProbeStorage` 和合成管理员、甲、乙记录，检查个人对象隔离、八类动作、项目成员与逐动作 grant、生效/到期/撤销边界、v3 迁移及重启。
2. `scripts/fnd004/independent-verification.mjs` 独立读取当前候选源文件，核对统一授权入口、动作集合、精确对象/项目/授权路由和构建产物存在。
3. `node scripts/verify-plan.mjs` 检查唯一当前提示词、FND-003 passed、FND-004 唯一 active_unit、哈希和工作单元一致性。
4. `pnpm --dir packages/knowledgeos-panel typecheck` 与 `pnpm --dir packages/knowledgeos-panel build` 检查类型和固定包构建。

## NOT_RUN / BLOCKED

- `NOT_RUN`：真实 DSH 浏览器中完整管理员/甲/乙登录后的对象 HTTP 矩阵；当前运行证据使用真实 SQLite 适配器和合成 actor。
- `NOT_RUN`：搜索索引、AI 摘要/答案、文件下载、邀请码兑换、完整缓存失效、完整项目审核。
- `NOT_RUN`：完整 A02、A34、A46；基础对象权限通过不等于这些完整场景通过。
- `BLOCKED`：若固定 DSH 不提供 Connection 单独安全卸载，记录上游实际限制，不能用 Host 整体停止替代。

命令：

```text
node scripts/verify-plan.mjs
pnpm --dir packages/knowledgeos-panel typecheck
pnpm --dir packages/knowledgeos-panel build
node scripts/fnd004/run-all.mjs --out docs/evidence/FND-004/runs/fnd004-local-20261117
node scripts/fnd004/independent-verification.mjs --candidate <candidate-sha>
```
