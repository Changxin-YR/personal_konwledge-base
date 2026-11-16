# FND-002 架构与契约审查（只读）

| 项 | 值 |
|---|---|
| 单元 / 指令 | FND-002 / `DSH_START.md` v2.1.0 §3–§6 |
| 分支 | `dsh/knowledgeos-fnd-002` |
| 产品候选 | `d7a453d6dfbdaee4c495b5d920086608fb9c8e1f`（`feat(fnd002): add SQLite-backed persistence probe over authenticated Host routes`） |
| 审查时 HEAD | `8df9d70d7804c1ed4eb62b4f651438366301bca0`，与候选仅差 `docs/evidence/FND-002/candidate.md`（62 行文档） |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738`（实际核对 `.cache/build/dsh-39163dd/packages/host/webserver/src/index.ts`） |
| 工作树 | 干净（`git status --porcelain` 为空）；审查期间未改产品、脚本、配置或状态 |
| 审查性质 | 静态只读审查 + 本范围检查实跑（`scripts/fnd002/scope-check.mjs` → `PASS`，exit 0）；未运行 T01–T09 |
| 结论 | **有条件建议冻结（Conditional GO）**：主路径契约落点正确，无阻断性缺陷；冻结前需主管就 P2 作“修正或书面解释”决定，并把 P3/P4 记为已知边界。详见 §6 |

> 本文件只记录代码/契约事实与风险，不是测试结果。`test-plan.md` 当前全部 `NOT_RUN`；任何 PASS 只能由独立测试在冻结候选上实跑产生。

## 1. 结论表

| # | 审查项 | 结论 | 主要依据 | 风险编号 |
|---|---|---|---|---|
| 1 | Config：真实 schema、`apply(ctx,config)`、`dataDir` 仅可信配置、绝对路径、缺省 status 可用而持久化 503、无默认路径猜测 | **符合（主路径）** | `config.ts:12-37`、`index.ts:47,80-104`、`storage.ts:27,150` | P1 |
| 2 | HTTP：真实 handler、auth required、方法/媒体类型/UUID/16KiB/严格 UTF-8/1–4096/代理项/未知字段、GET 404/422、错误映射、无 SQL/路径/故障开关入参 | **符合** | `index.ts:116-128`、`http.ts:109-198,216-283`、`storage.ts:17-19`、上游 `webserver/src/index.ts:113,117-125,128-143` | P6 |
| 3 | 应用/端口边界：`records.ts` 不导入 DSH/HTTP/React/SQLite；HTTP 不拼 SQL；SQLite 只在 `storage.ts` | **符合** | `records.ts:1-35`、`http.ts:8-11`、`storage.ts:9-14`、scope-check `PASS` | P5 |
| 4 | 存储：归属/版本、两表、DDL+账本+版本同事务、只读预检、WAL/外键/FULL/250ms、参数化、幂等/唯一、COMMIT/ROLLBACK、关闭幂等且不删库 | **主路径符合；预检与回滚边界有缺口** | `storage.ts:17-27,30-45,103-117,153-296,303-346,396-413` | P2, P3 |
| 5 | 生命周期：closing→撤路由→等在途→close→日志；关闭后不使用；重开同文件 | **静态符合；异步 disposer 的 await 语义未证实** | `index.ts:89-114,129-138`、`storage.ts:396-413` | P7 |
| 6 | 范围：无账号/ACL/知识实体/RAG/jobs/outbox/模型/安装包；FND-001 状态/面板未改；新旧范围检查关系正确 | **符合** | `scripts/fnd002/scope-check.mjs:22-83`（实跑 PASS）、候选 diff 路径、`scripts/fnd001/scope-check.mjs` 存在且未被候选改动 | P4 |

## 2. 逐项依据

### 2.1 Config

- 真实 Schemastery schema：`config.ts:21-23` 以 `Schema.object({ dataDir: Schema.string() })` 声明，属性默认可选，与 `interface Config { dataDir?: string }`（`config.ts:12-18`）一致；`Config` 为具名导出（`index.ts:19`），符合固定上游函数插件 `name/inject/Config/apply` 约定。
- `apply(ctx, config = {})`：`index.ts:47`；`dataDir` 经 `resolveDataDir(config)`（`index.ts:80`）来自插件 row 的可信 config，HTTP 层不接收路径（`http.ts:182-185` 仅允许 `content`）。
- 绝对路径与空串拒绝：`config.ts:31-37`（`isAbsolute`、空串抛错、缺省返回 `undefined`）。
- 缺省时 status 可用、持久化 503：`index.ts:64-78` 先注册 FND-001 status（`auth:'required'`）；`index.ts:81-87` 无 `dataDir` 时不构造 `ProbeStorage`；`index.ts:91-104` 的 service 对 `storage === undefined` 抛 `STORAGE_UNAVAILABLE`，经 `http.ts:100-102` 映射为 503。
- 无默认路径猜测：全包仅在 `storage.ts:150` 以 `join(dataDir, DATABASE_FILENAME)` 组合文件名，未见 cwd/HOME/build 推导；T09 旧 profile 回归在 `run-all.mjs:532-537` 覆盖“不建库 + status 200 + 503”。
- 依赖真实性：`package.json:57` 精确声明 `@deepseek-ai/schemastery: 3.19.0`；候选新增 `packages/knowledgeos-panel/package-lock.json`（提交内），本地 `node_modules` 实际版本核对为 `3.19.0`；非 ambient 假类型。

### 2.2 HTTP

- 真实 handler、非 `resource`：`index.ts:117-128` 两条路由均使用 `handler`；上游 `WebRoute.handler` 真实签名 `(req,res,peer?) => void | Promise<void>`（`webserver/src/index.ts:117-125`），`resource` 才仅答 GET/HEAD（同文件 `128-143`），与 `cordis.d.ts:7-31` 的最小声明一致。
- `auth: 'required'`：`index.ts:120,126`（上游默认也是 required，见 `webserver/src/index.ts:123-124`）。
- 方法：POST 非 POST → 405 + `Allow: POST`（`http.ts:219-221,91`）；GET 非 GET → 405 + `Allow: GET`（`http.ts:252-254`）。`prefix` 语义为“`p` 与 `p/<anything>`”（上游 `:113`），故 `POST /records/{id}` 落到 read handler 得 405，GET 集合落到 exact create handler 得 405。
- 媒体类型：`http.ts:145-156`，仅 `application/json`，charset 若出现必须 `utf-8`，缺失/其他 → 415。
- 幂等键 UUID：`http.ts:18,158-164`，规范小写 UUID。
- 16 KiB 与实际字节：`http.ts:14,109-143,224`，按流式实际读取累加，超限即 413 并 `resume()` 排空；不信 `Content-Length`。
- 严格 UTF-8：`http.ts:169`，`TextDecoder('utf-8',{fatal:true})`，失败 → 400 `INVALID_JSON`。
- content 1–4096 字节 / 非空 / 代理项 / 未知字段：`http.ts:182-197`（唯一键 `content`、`isWellFormed()`、`Buffer.byteLength` 1–4096）。
- GET 路径与 404/422：`http.ts:255-265`；仅 `${basePath}/<单段>`，非 UUID → 422，合法不存在 → 404；GET 只读 `service.get`。
- 成功/错误正文：`http.ts:68-92,230-233,266-269`，成功 `data{id,content,created_at}+meta{request_id,schema_version:1}`，错误 `code,message,request_id,retryable,safe_details`。
- 映射：`http.ts:94-106`；`STORAGE_BUSY`→503/retryable=true，`STORAGE_INCOMPATIBLE`→503，`STORAGE_CLOSED/UNAVAILABLE`→503/retryable=false，其他→500。`GET` 的 `STORAGE_UNAVAILABLE` 同样 503（`run-all.mjs:255` 断言读/写）。
- 无 SQL/路径/故障开关入参：`http.ts:182-185` 只接受单一 `content` 字段；`scope-check.mjs:39-44` 对 `http.ts/config.ts/index.ts` 扫描 `force_fail|db_path|migration_override|migration_version` 并 PASS。

### 2.3 应用/端口边界

- `records.ts:8` 仅 `import { createHash } from 'node:crypto'`；定义端口 `ProbeStorePort`（`:24-35`）与用例 `createProbeRecord/getProbeRecord`（`:93-111`），不导入 DSH/HTTP/React/SQLite/fs/path。
- `http.ts:8-11` 仅依赖 `node:crypto`、`node:http` 类型与 `records.ts`；无 SQL 文本（scope-check `:37` 扫描 `SELECT|INSERT|BEGIN` 通过）。
- `storage.ts:12` 是唯一 `node:sqlite` 导入（scope-check `:22-27`）；SQL 仅在此文件（`:30-42,283-285,326-328,356-358`）。
- 组合根 `index.ts:11-17` 装配 config/storage/records/http，方向为 Host → 应用/适配器，无反向依赖。
- 观察（非缺陷）：应用用例 `records.ts` 物理上位于 `src/host/`，与“Host 入口/组合根”同目录；`architecture.md §2` 已说明，导入方向仍正确。

### 2.4 存储

- `application_id` / `user_version`：`storage.ts:17-19` 常量，`:240-241` 在迁移事务内写入；`0x4B4F5331`=1263489841，`user_version=1`。
- 两表：`:30-42` 仅 `schema_migrations` 与 `storage_probe_records`（`STRICT` 为额外类型约束）；字段/PK/UNIQUE/NOT NULL 与 §5.2 一致；scope-check `:47-51` 实跑通过。
- 同事务：`BEGIN IMMEDIATE` → DDL → 账本 INSERT → `PRAGMA application_id/user_version` → `COMMIT`（`:233-243`）；`journal_mode=WAL` 在事务外的 `#configure`（`:209-215`）。
- 只读预检：`readDatabaseFacts` 以 `readOnly: true` 打开（`:103-117`）；`#precheck` 在写连接与迁移之前（`:153-161,182-196`）：application_id 不符 `:185`、未来版本 `:188`、非 1 版本 `:191`、表集合 `:200`、账本恰 1 行且 checksum 匹配 `:204`。
- 连接配置与回读：`:209-215` 设 `journal_mode=WAL`（并校验返回 `wal`）、`foreign_keys=ON`、`synchronous=FULL`、`busy_timeout=250`；`:217-231` 回读；`:167-171` 日志输出实际 Node/SQLite 版本与四项配置（供 T03/D6）。
- 参数化：所有值均 `prepare(...).run/get`（`:283-285,326-328,356-358`），无用户值拼入 SQL；文本中的 SQL 片段按数据保存。
- 幂等与唯一：`createOrReplay` 在同一 `BEGIN IMMEDIATE` 内按键查询、摘要/内容比对、插入（`:303-331`）；唯一约束见 DDL `:37`；并发重复由唯一冲突回退查询处理（`:334-343`）。
- COMMIT/ROLLBACK：迁移 `:242-249`、业务 `:329-344`、`#rollback` `:263-272`；`close()` 幂等且不删除文件（`:396-413`）。
- 缺口：见 P2（空白判定只用用户表）、P3（回滚失败状态未向上传播、BEGIN 失败被 `#migrate` 回滚路径误分类）。

### 2.5 生命周期

- 释放顺序：`closing = true` → `disposeCreate()`/`disposeRead()` → 有界等待在途（`Promise.allSettled` 与 5 s 竞速）→ `storage?.close()`（`index.ts:129-138`）；关闭日志在 `storage.ts:408`（仅 `db.close()` 成功后）。
- 关闭后不使用：service 每次入口检查 `closing`（`index.ts:93,101`）→ `STORAGE_CLOSED` → `http.ts:100-102` 映射 503；`close()` 先置 `#state='closed'`、清 `#db`（`storage.ts:399-404`），之后 `#ensureReady` 抛 `STORAGE_CLOSED`（`:274-279`）。
- 在途请求：`wrap` 把 handler Promise 计入 `inFlight`（`index.ts:107-114`）；已进入同步 SQL 的请求在事件循环上不可被打断，关闭不会造成句柄复用；仍在读 body 的请求随后会得到 `STORAGE_CLOSED` 的明确 503。
- 重开同文件：构造器重开 `<dataDir>/knowledgeos.sqlite`，无删除/移动；T07 计划用 profile 行禁用/恢复 + 关闭/重开日志验证（`run-all.mjs:398-431`）。
- 未证实：`ctx.effect` 返回 `Promise<void>` disposer 时，真实 Cordis 是否等待该 Promise（目前仅来自 `cordis.d.ts:48` 的 ambient 声明；未在允许的上游文件中核对 vendor Cordis 实现）。若上游不 await，5 s 在途等待与 close 可能晚于插件卸载返回；需 T07 真实卸载证据，不能以静态声明代替。

### 2.6 范围

- 新范围检查：`scope-check.mjs:22-37`（SQLite 仅在 `storage.ts`、records 禁平台导入、HTTP 禁 SQL/fs）、`:39-44`（禁客户端故障/路径开关）、`:47-55`（仅两表 + 仅 FND-001 status 与 FND-002 两条 records 路由）、`:57-66`（运行时依赖仅 schemastery，禁未来依赖）、`:68-83`（禁未来功能模块名、客户端不得知道 storage/API）。本审查实跑：`result: PASS`，exit 0。
- 与旧检查关系：`scripts/fnd001/scope-check.mjs` 仍存在，且候选 diff（`ce3a00c..d7a453`）未修改任何 `scripts/fnd001` 或 `docs/evidence/FND-001` 路径；新检查头部（`scope-check.mjs:3-8`）明确旧规则“整包禁 SQLite”仅为历史、本检查允许适配器。与 `DSH_START.md` §3.1 一致，不存在“旧检查被删/被误当本轮门槛”。
- FND-001 状态/面板：候选未改 `src/host/status.ts`、`src/client/*`；仅 `src/host/index.ts` 因新增组合根逻辑变化（diff stat：1 file，+88/−14），status 路由本身仍在 `index.ts:64-78`，语义/路径/`auth` 未变。
- 未来功能：候选文件清单与依赖中无账号/ACL/知识实体/RAG/jobs/outbox/模型/安装包；`architecture.md §8` 与 `run-all.mjs` 的 T09 范围断言一致。

## 3. 风险与未证实项

| 编号 | 级别 | 问题 | 依据 | 建议 |
|---|---|---|---|---|
| P1 | 中 | 配置了空串或非绝对 `dataDir` 时，`resolveDataDir` 在 `apply` 中抛错（`config.ts:33-35` 经 `index.ts:80`），Cordis 插件加载失败，status 与 records 路由都不会注册；契约期望“路径不可用 → 503 STORAGE_UNAVAILABLE，Host 仍可达、status 原语义不变”（§5.3.4/§5.4）。当前只测试了“缺省 dataDir”的兼容，未测试“非法 dataDir”。 | `config.ts:31-37`、`index.ts:80-87`、`run-all.mjs:532-537` | 主管二选一：(a) 非法路径也降级为 `unavailable`（记日志、status 保留、写读 503），与契约完全一致；(b) 明确采用上游“misconfiguration fails loud at load”，并在 evidence 中写明非法配置不属于“未配置”兼容承诺。冻结前需有结论。 |
| P2 | 中 | “空白库”判定只查询 `type='table'` 的用户表（`storage.ts:108`），`#assertKnownSchema` 也只比较表集合（`:199-202`）。若库 `application_id=0、user_version=0、无表但有用户视图/触发器/索引`，会被判为空白并执行 v1 迁移，与 §5.3.1“空白要结合 application_id、user_version 和用户 schema 对象判断”“非空未知 schema 拒绝”的字面要求不符。现有 T04 fixture 只造了外部表（`run-all.mjs:109-112`），未覆盖该形态。 | `storage.ts:103-117,182-207`、`run-all.mjs:100-129` | 建议冻结前做最小修正：预检查询改为覆盖所有非 `sqlite_%` 的 `sqlite_master` 对象（至少 `table/view/trigger`），并加一个“仅外来视图”的 fixture。若主管书面接受“仅以用户表判定空白”的解释，可保留现状但必须记入已知限制，不能宣称已覆盖“未知非空 schema”。 |
| P3 | 中低 | 事务失败边界不如契约严格：<br>a) `#rollback` 失败只把 `#state` 置 `unavailable` 并记日志（`storage.ts:263-272`），不向调用方传播；`createOrReplay` 的 catch 仍继续执行唯一冲突回退查询（`:332-343`），在“COMMIT 抛错但事务实际仍打开/回滚失败”的极端组合下，理论上可返回 `replayed` 成功，而 §5.3.3 要求“回滚失败或状态不明时停止写入并报告，不能返回成功”。<br>b) `#migrate` 在 `BEGIN IMMEDIATE` 本身失败时也会进入 catch 并调用 `ROLLBACK`（`:235-249`），把 BUSY 误报为 `STORAGE_INCOMPATIBLE`（`#open` catch `:174-176`）。<br>c) T02 只验证“语句级约束失败 + 成功回滚”（`run-all.mjs:222-230`），没有验证 COMMIT/ROLLBACK 本身失败，与 §5.3.3“BEGIN/COMMIT/ROLLBACK 都用实际驱动验证”有差距。 | `storage.ts:233-250,263-272,332-345`、`run-all.mjs:212-248` | 冻结前最低限度：在 catch 中先判断 `#state !== 'ready'` 则直接抛 `STORAGE_UNAVAILABLE`（不返回成功）；`#migrate` 只在 `BEGIN` 成功后才允许 `ROLLBACK`。若本轮不修，则把“COMMIT/ROLLBACK 失败未实测、极端状态未覆盖”明确写入 `test-plan`/`REPORT` 的不能证明项。 |
| P4 | 低 | 生产适配器类暴露仅测试入口：`ProbeStorage` 的 `testOnlyTransactionFailure`（`storage.ts:365-394`）与构造参数 `migrationOverride`（`:62-68`）位于生产 `storage.ts`，并通过 `package.json` 的 `./storage` 导出；HTTP 不可达（scope-check 已确认），但“仅测试注入”只靠命名约束。另 `testOnlyTransactionFailure` 在第二次 INSERT 未失败时不会 COMMIT/ROLLBACK，会遗留事务（`:380-393`）。 | `storage.ts:365-394`、`package.json:15-17`、`architecture.md §7` | 保持 HTTP 不可达前提下可接受；建议把该方法移入 `test-support.ts` 包装，或至少在 JSDoc/证据中声明“仅测试进程导入、生产 composition 不调用”。不构成冻结阻断。 |
| P5 | 低 | 细节不一致：`BUSY_TIMEOUT_MS` 导出但未使用，`#configure` 直接写死 `250`（`storage.ts:25,214`）；`#verify` 读取了 application_id 但 `#assertKnownSchema` 未再校验（`:252-261`）；`testOnlyTransactionFailure` 的 `failingId` 只用于计数查询、第二次插入实际用 `firstId`（`:383-392`）。 | 同左 | 清理项，不阻断；修正会改变候选哈希，建议随 P2/P3 一并处理后重新冻结。 |
| P6 | 低 | HTTP 边界剩余未覆盖细节：JSON 重复键（如两个 `content`）按 `JSON.parse` 后者覆盖，不返回 422；HEAD 请求落到 read handler 得 405（契约只约定了 GET/POST，未要求 HEAD）；`charset` 带引号（`charset="utf-8"`）会被 415。 | `http.ts:145-156,166-198,249-254` | 均不违反已冻结契约字面；建议测试计划不要扩展断言到这些点，或主管明确接受。 |
| P7 | 未证实 | 真实 Cordis 对异步 disposer 的等待语义未从允许的上游源码核实；本审查只能确认 `cordis.d.ts` 的自定义声明。关闭时序的最终证据必须来自 T07 的真实插件卸载/重载，而不是静态代码。 | `cordis.d.ts:44-49`、`index.ts:129-138` | 冻结前无需改代码；T07 必须保留“close 恰好一次、路由先消失、重开可读”的真实证据。 |
| P8 | 未证实 | 本审查未运行 T01–T09，也未核对运行证据；`test-plan.md` 仍全为 `NOT_RUN`，`architecture.md` 声称的运行环境（Node 24.22.0/SQLite 3.53.4）未在本轮独立复核。包内提交了 `lib/*.js` 与 `package-lock.json`，构建产物与源码一致性的最终判据仍是 T09 的哈希/加载路径证据。 | `test-plan.md:12-15`、`architecture.md:5` | 由独立测试按计划实跑后回填；架构审查不能代替。 |

## 4. 与 `architecture.md` / `test-plan.md` 的一致性核对

- `architecture.md §1` 引用的上游行号与本次实际读取一致：`WebRoute.handler` 在 `webserver/src/index.ts:117-125`，`prefix` 语义在 `:113`，`resource` 仅 GET/HEAD 在 `:128-143`。文档未虚构 handler 签名。
- `architecture.md §3` 的存储契约与代码一致，唯一需修订处是“非空未知 schema 拒绝”的证据表述：实际只检查用户表集合，未覆盖视图/触发器（P2）。
- `architecture.md §6` 的释放顺序与 `index.ts:129-138` 一致；“回滚失败/状态不明则标记不可写并返回 503/500，绝不返回成功”在极端组合下需要 P3 的修正或限定说明。
- `test-plan.md §9` 的 9 个待确认点中：第 2 点（Host 连接 PRAGMA 证据）已由启动日志 `storage.ts:167-171` 回答；第 3 点（规范 SQL 独立重算）已由 `MIGRATION_V1_SQL`/`MIGRATION_V1_CHECKSUM` 导出回答（`storage.ts:30-45`）；第 5 点（缺 Content-Type）代码按 415 实现；第 1 点按“单响应只含一组 5 字段”实现。第 4/6/7/8 点仍属主管/独立测试确认范围，不影响本次架构结论。

## 5. 本次审查的命令与限制

- 只读核对：`git rev-parse`、`git status --porcelain`、`git diff --name-only/--stat`、`git log`、`Test-Path`、`node scripts/fnd002/scope-check.mjs`（PASS，exit 0）。
- 未运行：`verify-plan`、typecheck/build、`run-all.mjs`、FND-001 回归、面板浏览器回归；这些属于实现者/独立测试证据范围。
- 未读取：允许清单外的运行证据、`candidate.md`、`test-support.ts`、`harness.mjs`、上游 Cordis vendor 源码；相关结论已标注“未证实”。
- 唯一写入：本文件。未修改产品源码、脚本、配置、状态或 Git 索引。

## 6. 冻结建议

**有条件建议冻结（Conditional GO）**：

1. **冻结前必须决定 P2**：这是 §5.3.1 的明确字面要求（“用户 schema 对象”而非仅表）。优先做最小修正（预检覆盖 `table/view/trigger` + 一个仅视图 fixture），修正后候选哈希变化，需重新冻结；若主管选择按“用户表”解释，则必须在 `architecture.md`/`REPORT` 中写明该解释与未覆盖形态，不能宣称已验证“未知非空 schema”全部形态。
2. **P3 至少在冻结记录中限定**：当前实现能阻止“语句级失败后继续成功写入”，但 COMMIT/ROLLBACK 自身失败未被实测，且回滚失败后的成功返回路径理论上未闭合。要么在 catch 中加 `#state` 判断（小改动），要么把该组合列为已知未覆盖边界。
3. **P1/P4/P5/P6 不阻断冻结**：P1 需主管确认“非法配置 fail-fast”还是“降级 503”；P4/P5 记录为清理项；P6 记录为契约外行为。
4. 冻结后由独立测试按 `test-plan.md` 实跑 T01–T09；`architecture.md` 与 `test-plan.md` 的 PASS 回填必须引用真实候选、命令、退出码和证据路径。本审查不构成任何测试 PASS。

## 复核后处置（主管记录）

- P2（未知 VIEW/触发器）：已修复。空白/归属预检现在检查全部非 sqlite_% schema 对象并精确要求两张表；新增 unknown-view fixture，独立专项 11/11 PASS。
- P3（回滚失败仍可能返回成功）：已修复。#rollback 返回结果，迁移与 create 路径在回滚失败时 fail-closed；事务探针始终结束事务。
- P1（空/相对 dataDir）：保留 fail-loud。缺省是受支持模式；显式空/相对路径是配置错误，在 Loader 拒绝，不注册半可用实例。打开/迁移/归属失败仍保持 Host 可达并返回 503。
- P4（测试钩子）：保留在 storage.ts/lib/storage.js 并由测试直接导入；index.ts 不引用，HTTP 未知字段 422，无路由可达。
- P5（常量/failingId）：BUSY_TIMEOUT_MS 已用于连接配置；ailingId 仅用于探针计数查询；#verify 已校验 application_id/user_version/账本/对象集合。
- D5 口径：迁移/归属/账本不匹配统一 503 STORAGE_INCOMPATIBLE；路径/打开失败为 503 STORAGE_UNAVAILABLE。
