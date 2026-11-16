# FND-002 Codex 接管记录

记录时间：2026-11-16（Asia/Shanghai）

## 基线与工作树

- 仓库：`https://github.com/Changxin-YR/personal_konwledge-base.git`
- 分支：`codex/knowledgeos-takeover`
- 接管提交：`4562034c9b4da48ee7b0d1447f7ae7663908240f`
- 接管前基线：`10c406713a64299d7c7a52695672bbadbe2c21cb`
- 固定产品上游：`39163dd30f703a79079e2d2446545cff3c453738`
- `executor=codex`、`active_unit=FND-002`、`auto_advance=false`；旧 API 额度问题按用户指令排除。

进入接管分支时保留了工作树已有修改：R1 的 SQLite 对象前缀修复、R2 的验收脚本修复，以及新增的回归/加载产物检查脚本。工作树初始还包含 `lib/` 构建产物、`src/host/storage.ts`、`scripts/fnd002/run-all.mjs` 的未提交修改和 FND-002 复核资料；未执行 reset、删除或 force push。

## 已实现能力

- `packages/knowledgeos-panel/src/host/index.ts` 组合 Host 插件、可信 `dataDir` 配置、生命周期和真实路由。
- `src/host/http.ts` 负责认证后的 HTTP 方法、媒体类型、输入边界和错误映射。
- `src/host/records.ts` 负责应用用例、内容摘要、幂等和记录端口。
- `src/host/storage.ts` 是唯一 SQLite 适配器：独立文件、归属/版本预检、原子 v1 迁移、事务回滚、有限锁等待、重启读取和幂等关闭。
- `packages/knowledgeos-panel/lib/` 是 profile 实际加载的构建产物，必须与冻结候选指纹逐文件一致。
- FND-001 的只读状态面板、认证保护、失败/恢复和生命周期已有历史验收；FND-002 已有九项 T01–T09 验收基础。

## 当前架构与边界

调用链为表现/HTTP → 应用用例/领域规则 → SQLite 适配器；DSH Host、profile、认证和插件集成继续保留。领域/用例层不直接导入 React、DSH 服务实例或数据库驱动。当前仅验证本地持久化探针，不代表正式知识实体、账号/ACL、多用户协作、模型调用、资料解析/RAG、jobs/outbox、安装包或 FND-003+ 已实现。

## 已知问题与本轮修复顺序

1. **R1 根因**：旧 `readDatabaseFacts()` 与 `#verify()` 使用 `name NOT LIKE 'sqlite_%'`；`_` 是 LIKE 通配符，导致 `sqliteX_*` 用户表、视图、索引和触发器被漏掉，未知库可能在修改性配置和迁移前被错误接管。修复为完整读取 `sqlite_master` 后按字面 `startsWith('sqlite_')` 过滤，并在预检、打开后校验和构建产物中保持一致。
2. **R2 根因**：T05 证据曾记录全表计数而断言按幂等键计数；T09 只检查哈希长度并固定读取工作树；summary 的 `started_at` 取自不存在的结果字段。修复为按 key 的同一计数、profile 实际解析路径与冻结 manifest 逐 hash 比较、独立篡改副本负例，以及真实套件开始时间。
3. 历史 runs 和旧独立检查保留其候选事实；新回归使用独立 `sqlite_master` 元数据和字面前缀判据，不能把旧结果改写为本轮复测。

## 验证入口

- 静态：`node scripts/verify-plan.mjs`、`node scripts/prepare-upstream.mjs --check`、`node scripts/fnd002/scope-check.mjs`、插件 TypeScript 检查。
- R1：`node scripts/fnd002/regression-sqlite-prefix.mjs`（当前候选），并补真实 Host 外来库拒绝对照。
- R2：`node scripts/fnd002/check-loaded-artifacts.mjs` 的正常与篡改副本结果，以及 `scripts/fnd002/run-all.mjs` 的 T05/T09 证据。
- 完整候选：`node scripts/fnd002/run-all.mjs --out docs/evidence/FND-002/runs/<new-id> --run-id <new-id> --candidate <new-id>`。
- 独立复核：在新候选冻结后运行只读 SQLite、真实 Host/HTTP、FND-001 浏览器回归和脱敏检查；旧 `runs/1b99e39` 仅作历史证据。

本记录只描述接管时的事实和验证入口，不改变 FND-002 的唯一执行指令；完成当前单元后保持 `auto_advance=false` 并等待用户指令。
