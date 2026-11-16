# FND-002 最终报告

更新：2026-11-16。Codex 接管候选 `codex-takeover-20261116-r2` 已完成本轮 FND-002 修复、真实验证和独立复核；状态为 `awaiting_user`。旧候选及旧失败记录保留在 Git 历史和原 evidence 目录。

## 项目理解

KnowledgeOS 当前是分层模块化单体：Host/HTTP → 应用用例/端口 → SQLite 适配器。`src/host/index.ts` 负责组合、可信配置和生命周期；`http.ts` 负责输入/错误映射；`records.ts` 负责 create/get、摘要和幂等；`storage.ts` 负责独立 `knowledgeos.sqlite`、v1 迁移、归属/版本预检、事务和关闭；`lib/` 是 profile 实际加载产物。DSH Host、profile、插件、认证保护和 FND-001 面板均保留。

当前实现覆盖本地持久化探针和真实认证 Host 路由，不代表正式知识实体、账号/ACL、多用户协作、模型/RAG、jobs/outbox、安装包或 FND-003+ 已实现。

## 问题与修复

**R1 根因**：`name NOT LIKE 'sqlite_%'` 把 `_` 当作 LIKE 通配符，漏掉 `sqliteX_*` 用户对象，可能把外来库当空白库接管并修改。`readSchemaObjects()` 现在完整读取 `sqlite_master`，只过滤字面 `sqlite_` 前缀；预检和打开后校验共用该判据，未知对象在 WAL/迁移/写入前拒绝。

**R2 根因**：T05 记录全表计数、T09 只判哈希长度且固定读取工作树、summary 开始时间为空。现在 T05 保存按 key 过滤的同一计数；T09 解析 profile 实际链接并与冻结 manifest 逐文件 SHA-256 比较，篡改副本明确失败；summary 使用真实套件开始时间，负例代码使用临时目录并清理。

## 验证结果

- 主验收：`run-all.mjs --run-id codex-takeover-20261116-r2`，T01–T09 **9/9 PASS**；summary `started_at`、`finished_at` 均非空。
- R1 独立回归：当前候选 A–F **6/6 PASS**；旧冻结 baseline 明确复现 A–D 缺陷。真实 Host 对 `sqliteX_foreign_private` 返回 `503 STORAGE_INCOMPATIBLE`，status 仍可达，库保持不变。
- 独立只读 SQLite：**73/73 PASS**。
- 独立真实 Host/HTTP/生命周期：**59/59 PASS**，含双进程并发、认证/来源边界、close/reopen 和旧 profile。
- 独立对象回归：**11/11 PASS**。
- `verify-plan`、`prepare-upstream --check`、`scope-check`、TypeScript、构建、profile 实际加载指纹、篡改负例和 FND-001 浏览器回归：均 PASS。
- 原证据脱敏扫描PASS覆盖token/Cookie/数据库文件。后续复核发现3处私有路径残留，本次发布修订已替换为占位符；断言、时间、业务值和候选hash保持。详见ACCEPTANCE_REVIEW_20261116.md。

证据根：`docs/evidence/FND-002/runs/codex-takeover-20261116-r2/`；候选指纹见 `candidate.md`；接管理解记录见 `codex-takeover.md`。

## 剩余限制

Desktop/Electron、Windows 安装、突然断电零丢失、OS 级 fd 泄漏、Host 级迁移故障注入和回滚自身失败故障构造未运行或不能由本轮证明；不阻塞本轮 Node Web Host 单元收口。FND-003 及后续功能保持未激活。

## Git

- 分支：`codex/knowledgeos-takeover`
- 接管提交：`4562034c9b4da48ee7b0d1447f7ae7663908240f`
- 最终修复提交：`a03c9e3312707bd146e29953c2cf8153e498dd40`
- 推送：已推送并确认 `ssh-origin/codex/knowledgeos-takeover` 更新成功

## 复验

```powershell
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
node scripts/fnd002/scope-check.mjs
cd packages/knowledgeos-panel; node node_modules/typescript/bin/tsc -p tsconfig.json; cd ../..
node scripts/fnd002/regression-sqlite-prefix.mjs --out docs/evidence/FND-002/runs/<new>/r1-regression.json
node scripts/fnd002/run-all.mjs --out docs/evidence/FND-002/runs/<new> --run-id <new> --candidate <new>
```

本轮完成后停止，等待下一步指令；不自动激活 FND-003。
