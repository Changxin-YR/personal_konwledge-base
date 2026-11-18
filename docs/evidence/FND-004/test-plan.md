# FND-004 3.2.2 测试方案与结果

本轮把旧候选的合成 actor 和源码包含检查替换为固定 DSH Host 上的真实 HTTP。每次业务请求都使用服务端从真实登录 Cookie 解析出的 actor；管理员、甲、乙使用三个独立 Cookie 上下文。固定上游为 `39163dd30f703a79079e2d2446545cff3c453738`，专用 profile 为 `knowledgeos-identity-test`，Host 仅绑定 loopback。

## 已执行命令

```text
node scripts/verify-plan.mjs
packages/knowledgeos-panel/node_modules/.bin/tsc.cmd -p packages/knowledgeos-panel/tsconfig.json --noEmit
node packages/knowledgeos-panel/build.mjs
node scripts/fnd004/run-all.mjs --out docs/evidence/FND-004/runs/v322-candidate --candidate WORKTREE
node scripts/fnd004/independent-verification.mjs --candidate WORKTREE --out docs/evidence/FND-004/independent/v322-candidate
node scripts/fnd004/affected-regression.mjs --out docs/evidence/FND-004/runs/v322-affected-regression --port 3123
```

pnpm wrapper 在本机尝试自动重装时因 registry EACCES 无法下载依赖；随后使用同一包内现有运行时直接执行 `node node_modules/typescript/bin/tsc -p tsconfig.json` 和 `node build.mjs`，两者退出码均为 `0`。其余命令退出码也均为 `0`；最终复验批次为 2026-11-18，T01–T07、独立复核和受影响回归均已重新执行。`run-all.mjs` 的 T01–T07、独立复核和受影响回归均保存逐项 JSON 与 Host 日志；构建产物哈希见 `candidate.md`。

## T01–T07 实际断言

1. **T01 PASS**：真实管理员、甲、乙登录；个人对象直接 URL、列表、猜测 ID 和身份字段替换均按当前 Cookie 判权，管理员标签不能读取他人私人正文。
2. **T02 PASS**：八类动作真实 HTTP 矩阵；项目成员无 grant 默认拒绝；`edit` grant 不能推导 `delete` 或 `manage_share`。
3. **T03 PASS**：非成员和非法/跨 service 项目标识不能创建项目对象；成员资格不自动开放读取或学习记录；逐动作 grant 后才可用。
4. **T04 PASS**：未来 `valid_from` 拒绝；对象 stale `expected_revision` 返回 `409 REVISION_CONFLICT`；`grant_id` 撤权真实生效，撤权竞态一胜一负，之后 GET/list/action 均拒绝；重新授权恢复 GET，SQL 保留旧撤权行且只有一条有效行。
5. **T05 PASS**：v4 迁移注入失败后回滚至 v3；已有 v3 库升级到 v4 并保留 v1/v2/v3 checksum；事务中途约束失败无部分写入；伪造 schema 在修改前拒绝且数据库事实不变；移除伪造对象后正常恢复。
6. **T06 PASS**：业务 Cookie 对 DSH status、RPC、Shell、文件、插件、Session 附件和非白名单入口均为 401/403/404；本机 owner status 保持 200；专用 profile 与 owner Host 分开留证。
7. **T07 PASS**：候选构建产物存在，HTTP 测试库为 v4；类型检查、构建、独立复核和 FND-001～003 受影响回归均绑定本候选。

## 受影响回归

`scripts/fnd004/affected-regression.mjs` 实际覆盖 FND-001 status 往返、FND-002 记录创建/重启/SQLite v4 累积 schema/事务回滚、FND-003 bootstrap/register/login/me/偏好版本冲突/logout，结果为 `PASS`。旧 `scripts/fnd002/run-all.mjs` 的历史 T01 仍硬编码 v1-only schema，因此其旧检查在累计 v4 数据库上记为 `FAIL（历史检查器与当前累计 schema 契约不兼容）`，不作为本候选 PASS 证据，也没有用它放行下一单元；失败原始 JSON 保留在 `runs/fnd002-regression-20261118/`。

## 保留的未覆盖范围

- `NOT_RUN`：搜索索引、AI 摘要/答案、文件下载、邀请码兑换、完整缓存失效和完整项目审核。
- `NOT_RUN`：完整 A02、A34、A46；本轮只验证其基础对象权限子集。
- `BLOCKED`：Connection 独立停用/恢复能力没有在上游专用 profile 中形成可安全卸载的最小装配，本轮不把 Host 整体停止冒称为 Connection 级通过。
