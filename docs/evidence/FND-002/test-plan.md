# FND-002 独立测试与验收计划

> **v2.1.1 修订：** 原计划的 sqlite_master/LIKE 判据存在共同盲区，现已改为完整原始元数据与字面前缀分类，并补充下方 R1/R2 收尾用例。当前修复后测试尚未运行；原 v2.1.0 执行结果保留在对应 runs。实际测试脚本仍须由 DSH 按此计划修正。

| 项 | 值 |
|---|---|
| `unit_id` | FND-002（本地业务持久化最小闭环） |
| 角色 | 独立测试与验收（非实现者；默认只读产品代码，本轮只写本文件） |
| 指令 | `DSH_START.md` v2.1.1，`instruction_revision` 2.1.1，`active_unit` FND-002 |
| 分支 / 计划基线 | `dsh/knowledgeos-fnd-002` / `a938fd4db016cd2869a74e5a235265ecef6e6a9d`（base `ce3a00c`） |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`，Node `>=24.9.0`） |
| 编写时间 | 2026-11-16（Asia/Shanghai） |
| 计划状态 | **READY** —— 编码前建立的可观察预期，不冒充运行结果 |
| 运行状态 | **T01–T09 全部 NOT_RUN（本计划阶段 0 项执行、0 条证据）** |
| 唯一写入 | 本文件；未修改产品源码、测试代码、profile 或桌面 DSH |

> 本文件是计划，不是结果。所有 PASS/FAIL 只能在冻结候选上由独立角色实际执行后产生；执行前一律 `NOT_RUN`。实现者自测、夹具、静态页面、预置常量、实现者总结均不能替代独立验收。未执行或证据不足的项写 `NOT_RUN`/`FAIL`，不得用“应通过”填空。

---

## 1. 依据与固定事实

### 1.1 依据

- `DSH_START.md` §5（最小技术契约：5.1 配置/运行时/连接、5.2 schema v1、5.3 归属预检/迁移/回滚、5.4 HTTP 契约、5.5 认证与关闭）、§6（T01–T09）、§7（候选、证据、复验）。
- `config/work_units.json` FND-002 `test_obligations`、`not_in_scope`、`acceptance_evidence_scope`。
- `docs/plan/04_DATA_AND_STATE_CONTRACTS.md` §0、§1、§2.2（当前仅探针切片；正式业务契约仍有效但不授权提前建表）。
- `docs/plan/05_API_AND_AI_CONTRACTS.md` §0、§2.1–§2.3（响应/幂等/错误正文）、§7（多智能体结构化结果：字段、证据、`NOT_RUN` 与 `BLOCKED` 分开）。
- `docs/plan/11_AGENT_AND_PROMPT_PROTOCOL.md` §5（统一结果格式）、§6（候选冻结与独立验收）、§8（FND-002 角色应用）。
- `docs/evidence/FND-002/architecture.md`（实际落点：`src/host/*`、`scripts/fnd002/`、`lib/storage.js`/`lib/test-support.js` 仅测试导入、错误映射、关闭日志 `knowledgeos-storage: closed`、`MIGRATION_V1_CHECKSUM`）。
- `config/execution_state.json`（`unit_state=ready`、`auto_advance=false`）、`config/upstream.lock.json`。

### 1.2 固定事实（执行时逐项核对，不得替换）

| 项 | 固定值 / 要求 |
|---|---|
| 仓库 | `C:\Users\27363\Desktop\personal base\personal_konwledge-base` |
| 固定源码运行时 | `.cache\build\dsh-39163dd`（已存在；不得用 `.cache\runtime-rc3` 或桌面 ASAR 顶替） |
| 独立 `DSH_HOME` | `.cache\dsh-home-fnd002`（计划阶段尚未创建；执行时创建，不得指向 `%USERPROFILE%\.dsh`） |
| 测试 profile | `knowledgeos-storage-test`（只用于测试） |
| 测试端口 | 优先 `3100`；被占用则选空闲本机端口并记录，不杀未知进程 |
| 业务数据目录 | `.cache\knowledgeos-fnd002-data\<run_id>\`（绝对路径，由测试脚本解析后经可信 Host 配置传入；`<run_id>` 全 ASCII，如 `fnd002-20261116T070000Z-a1`） |
| 数据库文件 | `<dataDir>\knowledgeos.sqlite`（不得落在 DSH_HOME/Session/KV/源码/构建目录） |
| 桌面 DSH 保护 | 启动前记录 `127.0.0.1:62739` 监听 PID/进程起始时间；全程不停止、不重启、不向其 profile 安装插件 |
| 数据性质 | 仅合成数据（`run_id` + 中文/引号/换行/emoji/SQL 片段）；禁止真实用户正文、真实库、凭据 |
| 原始证据目录 | `.cache\fnd002-runs\<run_id>\`（被 `.gitignore` 覆盖；含 cookies/token/DB/WAL/日志） |
| 脱敏证据目录 | `docs\evidence\FND-002\runs\<run_id>\`（只提交脱敏 JSON/文本/截图/哈希） |
| 故障夹具目录 | `.cache\fnd002-fixtures\<run_id>\`（只含合成数据；提交 DDL/清单/哈希，不提交 DB 二进制） |

### 1.3 本计划不做什么

1. 不修改 `packages/knowledgeos-panel/` 的产品代码、迁移或测试；不修改 profile 之外的任何配置；不操作桌面 DSH。
2. 不预写运行结果、截图、日志或“通过”报告；本文件不含任何已执行结论。
3. 不用内存 Map、JSON 文件、模拟 HTTP 服务器、硬编码常量、启动夹具替代真实 Host/真实 HTTP/真实 SQLite。
4. 不把本单元通过扩大为 F01/F42 或 A07/A49 完整验收，也不进入 FND-003（账号、ACL、RAG、jobs/outbox、安装包等）。
5. 不把 Node Web Host 结果写成 Desktop/Electron 已验证；Desktop 探针不可用即单列 `NOT_RUN`。
6. 不把 WAL/SHM 文件哈希变化当作数据丢失，也不在 Host 运行中复制主文件冒充一致快照。

---

## 2. 环境与前置

### 2.1 预检 P0（任一关键项不满足即阻断对应测试，不得换环境冒充）

| ID | 检查 | 命令/操作 | 通过标准 |
|---|---|---|---|
| P0-1 | 工具链 | `node --version`；`pnpm --version`（固定 pnpm 路径） | Node ≥ 24.9.0；记录实际 Node/SQLite 版本（`node -e "const{DatabaseSync}=require('node:sqlite');console.log(process.version, new DatabaseSync(':memory:').prepare('select sqlite_version() v').get().v)"`） |
| P0-2 | 固定源码 | `git -C .cache\build\dsh-39163dd rev-parse HEAD`（若为工作树）；`node --import tsx/esm apps/cli/src/bin.ts -V` | 指向 `39163dd…`；版本 `0.2.2-rc.3`；否则 BLOCKED |
| P0-3 | 构建指纹 | `Get-FileHash` 对 `apps/cli/src/bin.ts`、`package.json`、候选 `lib/*.js` | 写入候选环境清单 |
| P0-4 | 候选冻结 | `git rev-parse HEAD`；`git status --porcelain`；`git rev-parse HEAD^{tree}`；逐文件 SHA-256 | 有提交写完整 commit；有未提交/未跟踪内容必须给逐文件 manifest 与哈希，不能只写 HEAD；实现者自测产物也在清单内 |
| P0-5 | profile 隔离 | `$env:DSH_HOME` 实际值；`Test-Path $dshTestHome` | 位于仓库 `.cache\`；不指向桌面/默认 profile |
| P0-6 | 端口 | `Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue` | 无监听；被占用则记录原占用 PID 并改用空闲端口，不杀进程 |
| P0-7 | 桌面保护基线 | `Get-NetTCPConnection -LocalPort 62739 -State Listen`；`Get-Process -Id <PID>` | 记录 PID/启动时间；测试结束回读仍相同 |
| P0-8 | 认证材料 | 从 Host stdout 提取带 token 的入口 URL（仅写 `.local` 文件） | 能换取有效 Cookie；token/Cookie 不进入提交证据 |
| P0-9 | 浏览器能力（T09 UI 子项） | Playwright/Edge/Chrome 可用性探测 | 不可用则 T09 的 UI 子项 `BLOCKED`，其余构建/范围断言仍执行 |
| P0-10 | 桌面 Host 运行时（可选） | 若桌面 DSH 可安全只读探测则记录版本/驱动 | 不可用则 Desktop 项单列 `NOT_RUN`；不得用 Node 结果顶替 |

### 2.2 一次性环境准备（预期命令；实际参数以固定 CLI `--help` 为准并记录）

```powershell
$knowledgeosRepo = 'C:\Users\27363\Desktop\personal base\personal_konwledge-base'
$build           = Join-Path $knowledgeosRepo '.cache\build\dsh-39163dd'
$dshTestHome     = Join-Path $knowledgeosRepo '.cache\dsh-home-fnd002'
$runId           = 'fnd002-20261116T070000Z-a1'
$knowledgeosDataDir = Join-Path $knowledgeosRepo ".cache\knowledgeos-fnd002-data\$runId"
$raw             = Join-Path $knowledgeosRepo ".cache\fnd002-runs\$runId"
$evidence        = Join-Path $knowledgeosRepo "docs\evidence\FND-002\runs\$runId"
$env:DSH_HOME    = $dshTestHome
```

1. 创建 `$raw`、`$evidence`、`$knowledgeosDataDir`（仅测试自有目录）。
2. 首次初始化隔离 profile（只在首次使用；后续启动不再加 `--from-default-profile`）：

```powershell
Push-Location $build
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --from-default-profile web --dump-config *> "$raw\host\profile-init.txt"
Pop-Location
```

3. 安装冻结候选插件：`node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-storage-test add "<候选包路径>"`，日志入 `$raw\host\plugin-add.log`，并记录 profile 实际安装路径/版本。
4. 注入可信 `dataDir`：只改**测试 profile** 的 `knowledgeos-host` row config，写入 `$knowledgeosDataDir` 的绝对路径；整份覆盖时保留该 row 必需字段。保存修改前后 diff（测试 profile 位于 `.cache`，不提交），并用 `--dump-config`（脱敏）与 Host 启动日志确认实际生效。**不得**从 cwd、HOME、构建目录或 HTTP 参数推导路径。
5. 启动测试 Host（注意：显式 profile 启动不追加旧 `web` 位置参数）：

```powershell
$proc = Start-Process node -ArgumentList "--import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --port 3100 --no-open" `
  -WorkingDirectory $build -RedirectStandardOutput "$raw\host\stdout.log" -RedirectStandardError "$raw\host\stderr.log" -PassThru
$proc.Id | Set-Content "$raw\host\pid.txt"
```

6. 就绪与归属：轮询 `curl.exe -sS -o NUL -w "%{http_code}" "$base/"`（非 `000` 即已监听）；用 `Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)"` 记录 `CommandLine/CreationDate`，证明来自 `$build` 且 profile/端口正确。
7. 认证：用入口 URL 换 Cookie 至 `$raw\http\cookies.local.txt`；后续请求统一 `-b` 该文件；停止前核实 PID/命令行/profile/端口确属本测试，再用 `Stop-Process` 正常停止并确认端口释放。

### 2.3 运行约定

- POST/GET 使用 `curl.exe`；含中文/换行/SQL 片段的正文一律由 Node 生成 UTF-8 无 BOM 文件后用 `--data-binary "@file"`，不用 PowerShell 管道/`--data` 内联，避免编码污染。
- 时间：`created_at` 必须是服务端 UTC ISO 8601；独立解析并比较，不比较本地化显示。
- 并发：使用两个独立 PowerShell 进程或 `curl --parallel`，记录各自开始/结束时间与 PID。
- 独立 SQLite 只读：`new DatabaseSync(path, { readOnly: true })`（若该版本不支持，则先停 Host 再复制已关闭快照，并注明“已关闭快照”）；只读连接不写、不 checkpoint。
- 重启：保持同一 `run_id`、同一 `dataDir`、同一库路径；不得删库、换路径、导入夹具或重建目录。

---

## 3. 证据等级与真实/受控故障边界

### 3.1 等级定义

| 等级 | 定义 | 可用于 |
|---|---|---|
| `real_http` | 真实 Host 进程 + 真实 loopback HTTP + 上游认证 + 候选 handler | 所有 HTTP 断言 |
| `real_sqlite` | 真实磁盘库文件 + 真实 `node:sqlite` 驱动/适配器 + 真实事务 | 全部 DB 断言 |
| `controlled_fault` | 测试进程通过 `lib/storage.js`/`lib/test-support.js` 或独立 SQLite 连接注入；作用于真实库文件 | 仅 T02/T04/T06 的故障半段 |
| `observation` | 只读观测：curl、SQL 查询、PRAGMA、日志、哈希、截图 | 辅助证据，不单独构成行为通过 |
| `ui_real` | 真实浏览器 → 真实测试 Host 页面 | T09 面板回归 |

### 3.2 受控故障标记与硬规则（T02/T04/T06）

- 每个故障运行必须有唯一 `fault_id`（`FND002-FAULT-T02`、`-T04A`…`-T04E`、`-T06A`、`-T06B`），并同时标注在三处：测试脚本文件名/日志首行、运行记录 JSON 的 `evidence_kind="controlled_fault"` 与 `fault_id`、证据目录名。
- 注入只能位于测试进程边界：直接导入 `lib/storage.js` / `lib/test-support.js`（不注册路由），或独立辅助进程/连接持锁。**HTTP 不得存在** SQL、`force_fail`、`db_path`、迁移版本、故障开关、身份/路径覆盖入口；测试须负向验证这些输入不改变行为。
- 故障必须作用于真实 SQLite 文件，不得改为内存库、JSON 或“预期失败”桩。
- 故障清除后必须回到真实成功路径（写入 + 读取 + 独立查询），否则该测试不得记 PASS。
- 受控故障证据只证明“该故障下的行为”，不能证明正常路径或突然断电；正常路径断言必须另有 `real_http`/`real_sqlite` 证据。
- 不得为注入故障修改产品源码/迁移/profile 产品字段；测试 profile 的 dataDir/禁用行变更须记录 diff。
- 任何 DB/WAL/SHM、Cookie、Token、私有绝对路径、真实正文不得进入提交证据；脱敏必须保留可核对计数与关联 ID。

---

## 4. 九项必测（T01–T09）

> 每项格式：目标 / 前置 / 步骤 / 客观断言 / 失败判据 / 证据 / 不能证明什么 / 真实性与故障标注。所有项当前 `NOT_RUN`。

### FND-002-T01 真实 Host 创建、读取与进程重启持久化

- **目标**：证明记录来自配置的磁盘库而非进程内 Map/夹具/固定返回值，且正常重启后同一记录仍可读。
- **前置**：P0 全过；全新 `dataDir`；有效 Cookie；Host 由 `$build` 启动。
- **步骤**
  1. 生成正文文件：`run_id=<runId>` + 中文 + 英文双引号 + 反斜杠 + 真实换行 + emoji，UTF-8 字节数 ≤4096；计算 `sha256(content 原值 UTF-8)`。
  2. `POST /knowledgeos/foundation/records`，`Idempotency-Key: <小写 UUIDv4>`；记录状态/头/正文；随后 `GET /knowledgeos/foundation/records/{id}`。
  3. 停 Host 前记录 PID/命令行/端口；正常 `Stop-Process`，确认端口释放、日志出现关闭标记；重启同一 profile、同一 `dataDir`，记录新 PID 与新 token。
  4. 重新认证后 `GET` 原 `id`；再独立只读 SQLite 查询该 `id` 与总计数。
  5. 对比重启前后库文件路径（脱敏）、表集合、记录值；确认 `dataDir` 外无同名库。
- **客观断言**
  - T01-A1 首次 POST 为 `201`，且响应 `data.id` 为 UUID、`data.content` 与输入 UTF-8 字节逐一相等、`data.created_at` 可解析为带 `Z` 的 UTC 时间。
  - T01-A2 GET 为 `200`，`id/content/created_at` 与 POST 完全相同；GET 不新增记录。
  - T01-A3 独立只读查询：目标行存在且 `content` 字节一致、`request_digest` 等于步骤 1 重算值、总计数恰为 1。
  - T01-A4 重启后 PID 必须变化；再取 `id` 仍 `200` 且三字段不变；独立计数仍为 1。
  - T01-A5 数据库文件位于 `$knowledgeosDataDir\knowledgeos.sqlite`；DSH_HOME 的 Session/KV 中不存在该记录正文。
  - T01-A6 两次启动日志/配置显示同一库路径；第二次启动没有重新执行 v1 迁移、没有重建表。
- **失败判据**：首次非 201；GET/POST 值不一致；内容被 trim/归一化/替换；DB 0 或 ≥2 行；库不在配置目录；重启丢数据/换路径/删库/导入夹具；PID 未变却声称重启；用进程内缓存或固定返回值伪装。
- **证据**：脱敏请求/响应与头（`request_id` 保留、Cookie/token 去掉）；前后 PID/命令行/实例标识；独立 SQL 查询与计数；库路径脱敏标识；命令与退出码；`created_at` 与 digest。标注 `real_http` + `real_sqlite` + `observation`。
- **不能证明**：突然断电/崩溃零丢失；Desktop/Electron 运行时；多客户端并发；正式知识实体语义；认证安全全貌（见 T08）。

### FND-002-T02 真实 SQLite 事务中途失败与回滚

- **目标**：同一事务先成功写、再因确定约束失败，整体回滚、无部分写入、异常不被吞、连接仍可用。
- **前置**：T01 已在该候选通过；独立 `tx` 子目录库内有 1 条已提交基线记录；候选导出仅测试事务入口。
- **步骤**
  1. 停 Host，记录基线：行集合、计数、账本、`user_version`、`application_id`。
  2. 测试进程导入 `lib/storage.js` + `lib/test-support.js`，打开同一库：`BEGIN IMMEDIATE` → 插入新记录 B1 → 插入与基线相同 `idempotency_key` 的记录（唯一约束失败）→ 捕获真实错误 → `ROLLBACK`。
  3. 记录真实错误码/消息（内部证据）与事务状态（若驱动暴露 `isTransaction` 则记录；否则记录“能力不可用”，不得假装已断言）。
  4. 关闭测试连接；重启 Host；经真实 HTTP 正常写入一条新记录并读取。
  5. 独立只读查询：B1 不存在、基线仍在、新记录存在、计数正确。
- **客观断言**
  - T02-A1 失败事务后 B1 不存在；基线行与计数不变；账本/版本/归属不变。
  - T02-A2 捕获到真实 SQLite 约束错误（如 `SQLITE_CONSTRAINT_UNIQUE` / `UNIQUE constraint failed`），测试入口未吞异常或返回成功。
  - T02-A3 回滚后同一适配器/重开连接可执行正常写入；无“database is not open”等后遗症。
  - T02-A4 HTTP 侧无任何请求可触发该故障；POST 带 `force_fail`/SQL/路径/版本字段为 `422` 且不写入（见 T08）。
  - T02-A5 故障标记三处齐全，且故障段之后完成真实成功路径。
- **失败判据**：B1 部分写入；异常被吞/返回 2xx；回滚失败或状态不明仍继续写；连接不可用；HTTP 可注入该故障；用单条失败 INSERT 代替“先成功后失败”的事务。
- **证据**：失败 SQL 与真实错误、事务前后行集合/计数、事务状态能力记录、后续正常写入、`FND002-FAULT-T02` 标记。标注 `controlled_fault` + `real_sqlite`。
- **不能证明**：COMMIT 瞬间崩溃、断电、磁盘满、WAL 回放、异步/跨进程事务；不证明迁移事务（属 T04）。

### FND-002-T03 首次初始化、重复启动与真实运行时设置

- **目标**：真实文件库、v1 原子迁移、仅两张应用表、连接配置真实生效、重复启动不重置。
- **前置**：全新空 `dataDir`（不存在或空目录）；Host 由固定 Node 启动。
- **步骤**
  1. 启动 Host 并 POST 1 条记录（证明初始化后可写）。
  2. 独立只读连接查询：`PRAGMA application_id`、`PRAGMA user_version`、`sqlite_master` 全量 `type/name/sql`（记录原始对象，再按字面 `sqlite_` 前缀分类，不能先用 LIKE 过滤）、两表 `pragma table_info` 与 DDL、`schema_migrations` 全行、`storage_probe_records` 计数。
  3. 记录 Host 实际 Node/SQLite 版本（启动日志或仅测试探针），以及打开诊断中的 `journal_mode/foreign_keys/synchronous/busy_timeout`（若实现提供；见 §9 待确认项）。
  4. 测试进程用**同一连接配置函数**打开同一库，回读四项 PRAGMA，并与导出 `MIGRATION_V1_CHECKSUM` 对照；从冻结候选的规范 v1 SQL 字节独立重算 SHA-256（获取方式见 §9）。
  5. 外键生效：在同一适配器连接创建两张 TEMP 表（父/子带 FK），插入后删除父行，断言真实 `SQLITE_CONSTRAINT_FOREIGNKEY`；事务回滚并 `DROP`，不新增生产表。
  6. 停止并重复启动同一 `dataDir`；比较 schema/账本/记录/版本，期间不清空、不重建。
- **客观断言**
  - T03-A1 真实非空文件 `<dataDir>\knowledgeos.sqlite`；`application_id=1263489841`（`0x4B4F5331`）；`user_version=1`。
  - T03-A2 用户表集合恰为 `{schema_migrations, storage_probe_records}`；字段/PK/`UNIQUE`/`NOT NULL` 与 §5.2 一致。
  - T03-A3 `schema_migrations` 恰 1 行且 `version=1`；`checksum` 为 64 位小写十六进制，等于规范 SQL 的 SHA-256 与导出常量；`applied_at` 为 UTC ISO 8601。
  - T03-A4 Host 连接实际值：`journal_mode=wal`、`foreign_keys=1`、`synchronous=2`、`busy_timeout=250`；独立连接可复核 `journal_mode=wal`；不得把独立连接的其他 PRAGMA 冒充 Host 连接实际值。
  - T03-A5 外键拒绝真实发生（错误码/消息为 SQLite 约束错误），临时表不落生产 schema。
  - T03-A6 第二次启动后：版本/归属/账本（含 `applied_at`）不变、记录计数不变、DDL 文本一致；无重复迁移或重置。
  - T03-A7 记录实际 Node/SQLite 版本，不引用 `package.json` 声明值。
- **失败判据**：多/少应用表；版本或归属不符；账本 0/2 行或 checksum 不符；PRAGMA 未生效或仅有独立连接证据却宣称 Host 生效；重复启动重复迁移/清空；无真实版本证据；为测试新增生产表。
- **证据**：PRAGMA 与 schema/账本导出的 JSON（标明连接类型：Host 诊断/适配器同配置/独立只读）、外键错误、首次与第二次启动对比、版本、校验和重算。标注 `real_sqlite` + `observation`。
- **不能证明**：所有 SQLite 构建/平台；升级到未来版本；Desktop 驱动；长期运行性能；断电耐久。

### FND-002-T04 迁移失败、不兼容版本及数据库归属保护

- **目标**：迁移失败不半提交；未来版本/坏 checksum/错归属/未知非空库在修改前被拒；不降级、不改账本、不删库、不换路径。
- **前置**：T03 已通过；仅合成数据 fixture；复制前连接已关闭或用可靠快照；真实迁移运行器。
- **步骤与断言（逐 fixture）**
  - **T04A 迁移中途失败**：真实迁移运行器执行测试迁移计划（第一段成功、第二段确定失败），在事务内触发。断言：`sqlite_master` 无部分表；`user_version`/`application_id` 保持原值（新库为 0/0）；账本为空；无基线数据丢失；错误真实抛出；连接关闭或可安全重开；Host 随后启动仍可达但写接口 `503 STORAGE_UNAVAILABLE` 且日志原因可定位；解除故障后正常初始化 + 写入成功。
  - **T04B 未来版本**：合成库 `user_version=2` + 合法 v1 schema/账本/1 条记录。断言：打开/写接口 `503 STORAGE_INCOMPATIBLE`、`retryable=false`；`user_version` 仍 2；账本 checksum/记录不变；`/knowledgeos/status` 仍 200；日志可定位“版本过新”。
  - **T04C checksum 不符**：把账本 `checksum` 改为另一 64 位十六进制。断言：拒绝（`503 STORAGE_INCOMPATIBLE`）；不自动改写 checksum、不删行；原数据/schema/版本不变。
  - **T04D 归属不符**：`application_id` 改为 0 或 `0x12345678`，其余为合法 v1。断言：拒绝；标识不被改写；记录保留。
  - **T04E 未知非空 schema**：`user_version=0`、`application_id=0`，但存在用户表 `foreign_tbl` 及数据。断言：拒绝接管（不得仅凭 `user_version=0` 判空）；`foreign_tbl` 与数据保留；错误明确不可用。
  - **T04F 真正空白**：0 字节文件，以及 `application_id=0`/`user_version=0`/无用户表的空库。断言：允许初始化且仅产生两张应用表 + v1 账本。
  - **T04G 恢复与对照**：每个拒绝场景 Host 可达、数据库文件不被删除/移动；解除故障或换回有效库后按正常路径写读成功，原数据仍在。
- **失败判据**：半提交 schema；自动“修复”checksum/版本；把未知非空库当空库接管；删库/换空库/改路径造成功；不兼容时写成功；仅返回 500 或吞错；用运行中 WAL 文件哈希变化断言数据丢失。
- **证据**：fixture 来源与创建 SQL、故障点、逻辑数据/schema/版本/账本前后对比、真实打开与写接口响应、Host 可达对照、恢复结果、`FND002-FAULT-T04*` 标记。标注 `controlled_fault`（T04A）+ `real_sqlite`。
- **不能证明**：真实世界所有损坏形态、并发外部写、未来迁移语义、磁盘故障。

### FND-002-T05 最小创建幂等、重试与并发重复请求

- **目标**：幂等由真实库唯一约束与摘要保证，跨重启有效，冲突明确，并发不产生两条。
- **前置**：T01/T03 已通过；独立库；键/摘要契约冻结。
- **步骤**
  1. 键 K1（小写 UUID）+ 内容 C1：POST → 201；同键同内容再 POST → 200；记录两次 `id/created_at`。
  2. 正常重启 Host（同库路径），重新认证；同键同内容再 POST → 期望 200 且同 `id/created_at`。
  3. 同键 K1 + 内容 C2（仅空白/大小写不同也算不同）→ 期望 409；查询旧记录仍为 C1、计数不变。
  4. 新键 K2 + 原内容 C1 → 期望 201，新 `id`（证明幂等按键而非内容；可选但建议）。
  5. 并发：新键 K3 + C3，两个独立进程同时 POST；记录各自状态/耗时。
  6. 独立查询：所有键/记录计数、`request_digest` 与内容 SHA-256 对照。
- **客观断言**
  - T05-A1 首次 201；重放 200，同 `id`/`created_at`，内容不变，计数不增。
  - T05-A2 重启后重放仍 200 同值；证据表明来自库持久化而非进程缓存。
  - T05-A3 同键不同内容 409 `IDEMPOTENCY_CONFLICT`、`retryable=false`；旧行内容/摘要不变；不产生第二行。
  - T05-A4 并发同键同内容：最终恰 1 行；响应状态组合为 `{201,200}`（一个首次成功、一个重放），不得两个 201（契约要求重放 200）；两响应 `id/created_at` 相同。
  - T05-A5 不同键同内容产生两条不同 `id`（键不是内容摘要）；键不是身份：不得据此推断/授权用户。
- **失败判据**：2 行同键；重放新 ID/时间；重启后重放变成新记录；409 缺失或覆盖旧内容；并发双 201/双行；接受非规范 UUID；用内存缓存充当幂等。
- **证据**：请求/响应序列、每次计数、重启 PID、digest 重算、并发时间线与退出码。标注 `real_http` + `real_sqlite`。
- **不能证明**：跨 Host/多进程同时写、崩溃窗口恰好一次、未来业务接口幂等；不证明用户身份。

### FND-002-T06 打开失败、有限锁等待与恢复

- **目标**：无效路径打开失败无回退；外部写锁下 503 STORAGE_BUSY/`retryable=true` 且有界（受控环境 <2s）；清障后恢复且原数据保留。
- **前置**：T03 通过；忙等待配置 250ms；可启动独立辅助进程/连接持锁。
- **步骤**
  - **T06A 打开失败**：创建普通文件 `$raw\faults\blocked-parent`，配置 `dataDir=$raw\faults\blocked-parent\data`（父路径为文件）。启动 Host。断言：写/读均 `503 STORAGE_UNAVAILABLE`、`retryable=false`；`/knowledgeos/status` 仍 200；无成功空结果；cwd/HOME/build 下无回退库文件出现；日志给可定位原因（响应不泄露绝对路径）。随后改回有效 `dataDir` 重启 → 写读正常，原库数据不变。
  - **T06B 外部写锁**：独立 Node 辅助进程（记录 PID/命令行）打开同一库，`busy_timeout=0`，`BEGIN IMMEDIATE` 持写锁并保持；第二独立连接写应 `SQLITE_BUSY`（证明锁真实存在）。此时 Host 收到新键 POST，`Stopwatch` 计时。断言：状态 `503 STORAGE_BUSY`、`retryable=true`、错误正文 5 字段；耗时 `250ms ≤ t < 2000ms`（下界容差 ≥150ms，证明真的等待而非立即失败）。
  - **T06C 释放与恢复**：辅助进程 `ROLLBACK` + 关闭，再次用**同一键**POST → `201`；独立查询计数仅 +1；锁期间无部分记录；解除后 GET 正常。清除 T06A 故障后再次写读成功。
- **客观断言**
  - T06-A1 打开失败为 503 STORAGE_UNAVAILABLE（非 500/201/内存回退），Host 仍可达，status 语义不变。
  - T06-A2 锁竞争有限失败：503 STORAGE_BUSY、retryable=true、实测 <2s 且确实等待过；不得用同一事件循环定时器解自己造成的同步阻塞。
  - T06-A3 锁释放后成功写入且恰好一条；已有基线记录不变；故障记录不残留。
  - T06-A4 故障全程有 `FND002-FAULT-T06A/T06B` 标记；恢复段为真实成功路径。
- **失败判据**：返回 201/200/500；不受控等待或 >2s；回退到内存/JSON/其他路径；锁由测试内定时器在 Host 内解除；释放后数据丢失或重复；错误响应泄露路径/SQL。
- **证据**：故障目录构造、辅助进程 PID/锁 SQL、计时、响应、前后计数、恢复、标记。标注 `controlled_fault`（锁/路径故障）+ `real_http`。
- **不能证明**：杀毒/网络盘/文件系统异常、断电、多写者长时间争用、跨机器锁。

### FND-002-T07 数据库连接生命周期释放与重新打开

- **目标**：真实关闭连接（非 404 代替）、无关闭后使用、重开保留数据、卸载/重装不删库。
- **前置**：T01/T03 通过；已有读写记录；可观察 disposer/句柄或关闭日志。
- **步骤**
  1. 通过测试 profile 的 `knowledgeos-host` 行禁用（或支持的热卸载）触发真实插件卸载/重载；若只能进程退出，则正常停止 Host，并记录“进程退出触发 dispose”的实际路径。
  2. 采集：撤销路由的时序、`knowledgeos-storage: closed` 日志（或 test-support 句柄状态 `isOpen=false`/`closed`）、close 次数、是否有关闭后 SQL 使用/重试/重复注册。
  3. 重新启用/重启同一 profile，打开同一库；GET 原记录；写新记录。
  4. 禁用/卸载前后对库文件做存在性与数据检查（不得删除）。
- **客观断言**
  - T07-A1 关闭真实发生：有驱动器句柄状态或 `knowledgeos-storage: closed` 唯一日志；不以“路由 404”作为 close 证据。
  - T07-A2 顺序正确：先停止接收/撤销入口，再 close；close 恰一次；无关闭后使用错误、无遗留重试、无重复注册。
  - T07-A3 重开后原记录可读、新写入成功；库文件未被删除/移动；重装/重启用同一文件。
- **失败判据**：仅 404；无 close 证据；close 0/2 次；关闭后仍接单或使用已关闭句柄；重开丢数据；禁用/卸载删除库。
- **证据**：profile 行 diff、Host 日志时序、句柄状态探针、路由前后行为、重开后查询。标注 `real_http` + `observation`。
- **不能证明**：OS 级 fd 泄漏（上游其他代码）、崩溃中断 dispose、真实安装包卸载。

### FND-002-T08 真实本机认证、来源保护和输入边界

- **目标**：沿用上游准入（401/403），CLI 不被误拒；错误按契约映射；严格 UTF-8/字段/大小限制；SQL 文本按数据保存；无私有信息泄露。
- **前置**：Host 在线；合法认证对照可用；DB 计数可核对。
- **步骤与断言**
  - **认证/来源**（先记录 DB 计数，结束后再查）：
    - 无 Cookie POST/GET → `401`；伪造/坏 Cookie → `401`；两者 DB 计数不变。
    - 有效 Cookie + 可信 Host + 无 `Origin`（CLI）→ 写 201/读 200（不得被误拒）。
    - 有效 Cookie + `Origin: http://evil.example` → `403`；`Origin: null` → `403`；`Sec-Fetch-Site: cross-site` → `403`；GET 同断言；DB 不变。
  - **输入边界**（有效认证）：
    - `Content-Type: text/plain` → `415 UNSUPPORTED_MEDIA_TYPE`；缺 `Content-Type` 期望 `415`（见 §9 待确认）。
    - 非法 JSON（如 `{`、尾逗号）→ `400 INVALID_JSON`；正文含非法 UTF-8 字节（如 `0xC3 0x28`）→ `400 INVALID_JSON`（编码错误，区别于 422）。
    - `content` 缺失/`null`/数字/对象/数组/空串 → `422 INPUT_INVALID`。
    - `content` UTF-8 恰 4096 字节 → 201；4097 字节 → 422（含 4 字节 emoji 边界）；1 字节 → 201。
    - 孤立高/低代理项（JSON `\ud800` / `\udc00`）→ `422 INPUT_INVALID`；不得以 U+FFFD 修复保存；DB 无该记录。
    - 未知字段（`id`、`owner`、`extra`、`created_at`、`schema_version` 等）→ `422`；DB 不写。
    - `Idempotency-Key` 缺失/非小写规范 UUID（无连字符、长度错、非十六进制、花括号、URN、大写）→ `422`；不写。
    - 正文实际 >16384 字节 → `413 PAYLOAD_TOO_LARGE`，重点覆盖“声明 `Content-Length` 与实际不符/分块发送”仍按实际读取字节拒绝；恰好 16384 字节且字段非法 → 422（边界）。
    - 方法：`PUT/DELETE/PATCH` 集合 → `405` 且 `Allow` 含 `POST`；`POST` 详情路径 → `405` 且 `Allow` 含 `GET`；`GET` 集合 → 405。
    - `GET` 合法但不存在 UUID → `404 NOT_FOUND`；非法 UUID → `422`；`GET` 不创建/不更新记录。
  - **注入与泄露**：保存 `"x'); DROP TABLE storage_probe_records; --\n\" OR 1=1 --"` 等文本 → 201；独立查询内容逐字节一致、两表仍在、DDL 未变、计数 +1。尝试 `?sql=`/`?force_fail=1`/`?db_path=`/`?version=2`/body 注入字段 → 无故障触发、无写入、无 500，行为不变（拒绝或忽略均须记录实际值，见 §9）。扫描所有响应：不得含 `C:\`、`.cache`、`SQLITE_`、`node:sqlite`、堆栈、Cookie/token、环境变量；错误正文恰 5 字段；成功正文恰 5 字段。
- **失败判据**：认证负例 2xx；401/403 时写入；合法 CLI 被拒；错误码/状态错配；替换字符保存；超限接受；未知字段接受；SQL 被执行或 schema 改变；GET 写入；泄露路径/堆栈/凭据；GET 404 与 503 混淆。
- **证据**：逐用例原始状态/头/正文（脱敏）、DB 计数前后、字节级内容对照（hex）、泄露扫描结果、`request_id`。标注 `real_http` + `real_sqlite`（计数）+ `observation`。
- **不能证明**：多人账号/ACL（FND-003+）、TLS/远程攻击、桌面浏览器完整 CSRF、正式产品 API。

### FND-002-T09 构建、当前范围与 FND-001 受影响行为回归

- **目标**：构建/类型/实际加载一致；原只读面板与 status 不退化；无 dataDir 旧 profile 保持原语义且不假装存储就绪；范围与依赖无越界。
- **前置**：候选冻结（源码/迁移/测试/产物哈希）；FND-001 历史证据只读保留。
- **步骤**
  1. 构建与检查（在 `packages\knowledgeos-panel` 内，实际脚本以候选 `package.json` 为准并记录）：`pnpm build`、`pnpm typecheck`；根目录 `node scripts/verify-plan.mjs`；候选新增 `node scripts/fnd002/scope-check.mjs`。
  2. 实际加载指纹：定位测试 profile 实际安装的插件 `lib/index.js`、`lib/storage.js`、`lib/test-support.js`，计算 SHA-256，与候选构建产物逐文件比对，必须一致；记录 profile 版本/路径。
  3. 面板回归（真实浏览器，可用则执行）：加载页面 → 面板出现；`/knowledgeos/status` 真实刷新；刷新中文案；停止测试 Host → 真实失败态；重启 → 恢复；截图 + DOM 文本 + console/network 记录。
  4. 无 dataDir 旧 profile 兼容：移除测试 profile 的 `dataDir`（保留其余字段）→ 启动；面板/status 200 且语义与 FND-001 一致；POST/GET 均 `503 STORAGE_UNAVAILABLE`、`retryable=false`；DSH_HOME/cwd/build 下不产生 `knowledgeos.sqlite`；status 不得暗示存储就绪。
  5. 范围检查：只允许本轮 SQLite 适配层/可信配置/最小用例/真实路由与必要依赖；应用内层不得反向导入 `node:sqlite`/DSH/React；无 FND-003+ 模块、账号、ACL、RAG、jobs/outbox、备份、安装包；`package.json`/锁文件差异逐项说明；产品包内无 fixture/DB/Cookie。
  6. FND-001 回归：原 `/knowledgeos/status` 契约与面板行为；旧禁 DB 检查只作历史对照，不当作本轮门槛，也不修改其历史结论。
- **客观断言**
  - T09-A1 构建/类型/范围/verify-plan 命令退出码均为 0；失败日志原样保留。
  - T09-A2 实际加载的三个 `lib` 文件哈希与候选产物一致；不存在“构建成功但 profile 加载旧产物”。
  - T09-A3 面板真实加载/刷新/失败/恢复均有真实 Host 证据，非静态页面/固定 JSON。
  - T09-A4 无 dataDir：status/面板不退化；写读 503 STORAGE_UNAVAILABLE；无任何回退库文件；未把“未配置”显示为“就绪”。
  - T09-A5 范围检查通过：无越界模块/依赖/反向导入；无产品包内测试夹具。
- **失败判据**：构建/类型失败；加载产物与候选不一致；面板假状态；无 dataDir 时创建库或返回成功；status 语义改变；越界功能/依赖；用 FND-001 旧禁 DB 检查误杀本轮或篡改其历史证据。
- **证据**：命令/退出码、哈希清单、profile 加载路径、截图/DOM/console、status 前后、范围报告、依赖 diff。标注 `real_http` + `ui_real` + `observation`。
- **不能证明**：Electron/Desktop 实际打包运行（不可用则 `NOT_RUN`）、Windows 安装/升级/卸载、生产性能与长期稳定性。

---

## 5. API 契约断言矩阵

> 成功正文固定 5 字段：`data.id`、`data.content`、`data.created_at`、`meta.request_id`、`meta.schema_version`；错误正文固定 5 字段：`code`、`message`、`request_id`、`retryable`、`safe_details`。二者合计 10 个字段名，但**任何单个响应只含其中一组**（“10 字段响应”按并集理解，见 §9）。字段集合必须精确，无额外字段。

| # | 场景 | 期望状态 / code | retryable | DB 效果 |
|---|---|---|---|---|
| A1 | 首次创建 | 201 | — | +1 行，账本不变 |
| A2 | 同键同内容重放 | 200（同 id/created_at） | — | 0 行 |
| A3 | 同键不同内容 | 409 / IDEMPOTENCY_CONFLICT | false | 0 行，旧值不变 |
| A4 | GET 存在 | 200 | — | 0 写入 |
| A5 | GET 合法不存在 UUID | 404 / NOT_FOUND | false | 0 写入 |
| A6 | GET 非法 UUID | 422 / INPUT_INVALID | false | 0 写入 |
| A7 | 非法 JSON | 400 / INVALID_JSON | false | 0 写入 |
| A8 | 非法 UTF-8 字节 | 400 / INVALID_JSON | false | 0 写入 |
| A9 | 非 JSON Content-Type / 缺失 | 415 / UNSUPPORTED_MEDIA_TYPE | false | 0 写入 |
| A10 | 正文 >16384 字节（含分块/伪 Content-Length） | 413 / PAYLOAD_TOO_LARGE | false | 0 写入 |
| A11 | content 空/类型错/缺失/未知字段 | 422 / INPUT_INVALID | false | 0 写入 |
| A12 | content >4096 字节 / 孤立代理项 / 非规范 UUID 键 | 422 / INPUT_INVALID | false | 0 写入 |
| A13 | 非法方法 | 405 / METHOD_NOT_ALLOWED + `Allow` | false | 0 写入 |
| A14 | 外部写锁 | 503 / STORAGE_BUSY | **true** | 0 行 |
| A15 | 未配置 dataDir / 打开失败 | 503 / STORAGE_UNAVAILABLE | false | 0 行 |
| A16 | 未来版本 / 坏 checksum / 错归属 / 未知非空库 | 503 / STORAGE_INCOMPATIBLE | false | 0 行 |
| A17 | 非预期内部故障（若能安全构造） | 500 / INTERNAL_ERROR | false | 0 行 |

- 所有响应必须带 `request_id`（服务端诊断 ID），且不得等于 `Idempotency-Key`。
- `created_at`：UTC、ISO 8601、带 `Z`，可解析且不晚于观测时间。
- 认证层 401/403/503 保留上游格式，不强行套用本项目错误正文；但状态码与“DB 未写入”仍须断言。
- GET 不写；任何错误响应后计数不变；错误不泄露 SQL/路径/堆栈/Cookie/Token/环境变量。

---

## 6. 数据库断言矩阵

| # | 断言 | 方法 | 期望 |
|---|---|---|---|
| D1 | 归属标识 | `PRAGMA application_id` | `1263489841`（`0x4B4F5331`） |
| D2 | 应用版本 | `PRAGMA user_version` | `1` |
| D3 | 完整 schema 对象及用户对象分类 | `SELECT type, name, sql FROM sqlite_master ORDER BY type, name`；保存原始结果后独立识别字面 `sqlite_` 内部前缀 | 用户对象恰为 `schema_migrations`、`storage_probe_records` 两表；真实自动索引允许，其他用户表/视图/索引/触发器均须识别 |
| D4 | 迁移账本 | `SELECT version, checksum, applied_at FROM schema_migrations` | 恰 1 行；version=1；checksum=64 小写 hex=SHA-256(规范 v1 SQL)=导出常量；applied_at UTC |
| D5 | 字段/约束 | `pragma table_info` + DDL | 两表字段与 PK/UNIQUE/NOT NULL 与 §5.2 完全一致 |
| D6 | 连接配置 | Host 打开诊断（实际连接） | `journal_mode=wal`、`foreign_keys=1`、`synchronous=2`、`busy_timeout=250` |
| D7 | WAL 持久性 | 独立只读连接 `PRAGMA journal_mode` | `wal`（不比较 WAL 文件字节哈希） |
| D8 | 外键生效 | 同配置连接 TEMP 父/子表删父 | 真实 `SQLITE_CONSTRAINT_FOREIGNKEY`；临时表不残留 |
| D9 | 重启一致性 | 重启前后查询 | 版本/归属/账本/DDL/记录值不变；无重复迁移 |
| D10 | 事务回滚 | 先成功后约束失败 + ROLLBACK | 无部分写入；基线保留；连接可用（T02） |
| D11 | 不兼容拒绝 | 4 类 fixture + 真实打开 | 503 STORAGE_INCOMPATIBLE；不写/不改/不删 |
| D12 | 迁移失败不半提交 | 测试迁移中途失败 | 无部分表/账本；版本归属原值；数据保留（T04A） |
| D13 | 关闭证据 | 句柄状态/关闭日志 | 恰一次 close；先撤入口；无关闭后使用（T07） |
| D14 | 重开保留 | 重开/重启后查询 | 原记录在，新写入成功 |

说明：D6 必须来自 Host 实际连接或其打开诊断；独立只读连接只能证明 D1–D5/D7 与数据，不得冒充 D6。若候选无法提供 Host 连接 PRAGMA 的可核对证据，D6 记 `FAIL`（证据不足），不得以“代码里写了”代替实际值。

---

## 7. 失败与边界专表

| 场景 | 操作 | 期望 | 不得出现 |
|---|---|---|---|
| 打开失败 | `dataDir` 的父路径为普通文件；真实启动 Host | 503 STORAGE_UNAVAILABLE、retryable=false；status 200；无回退库 | 500/201/200；cwd/HOME/build 生成库；崩溃 |
| 外部写锁 250ms | 独立辅助进程 `BEGIN IMMEDIATE` 持锁；Host POST | 503 STORAGE_BUSY、retryable=true；250ms≤t<2s | 无界等待；201；内存回退；Host 内定时器自解 |
| 并发同键 | 两独立进程同键同内容同时 POST | 恰 1 行；一个 201 + 一个 200；同 id/created_at | 双 201/双行/不同 id |
| 重启后幂等 | 同库路径重启，同键同内容/不同内容 | 200 同值；409 且旧值不变 | 新记录；丢键；覆盖旧内容 |
| 旧 profile 无 dataDir | 移除 config `dataDir` 后启动 | status/面板保持 FND-001 语义；写读 503 STORAGE_UNAVAILABLE false；无库文件 | status 显示存储就绪；创建库；200/201 |
| 不兼容库 | 4 类 fixture 真实打开 | 503 STORAGE_INCOMPATIBLE；Host 可达；原库不变 | 删库/改 checksum/降级/换路径/部分写 |

---

## 8. 结果记录格式与判定规则

### 8.1 每项记录字段（缺一不可）

| 字段 | 要求 |
|---|---|
| `test_id` | `FND-002-T01`…`T09`（含子用例，如 `T08-A9`） |
| `conclusion` | 仅 `PASS` / `FAIL` / `NOT_RUN` / `BLOCKED` |
| `candidate` | 冻结提交或逐文件 manifest 哈希；不得只写分支名 |
| `environment` | 实际 Node/SQLite 版本、端口、profile、`dataDir` 脱敏标识、run_id |
| `commands_or_actions` | 真实命令/UI 操作、开始/结束时间、退出码 |
| `expected` / `actual` | 逐项值；HTTP 状态/错误码、DB 计数/PRAGMA 实际值、字节对比结果 |
| `evidence_path` | `docs/evidence/FND-002/runs/<run_id>/…`；原始机密件引用 `.cache/…`（不提交） |
| `evidence_kind` | `real_http` / `real_sqlite` / `controlled_fault` / `observation` / `ui_real` |
| `executor_role` | `independent-test`（实现者不得填此） |
| `reviewer_role` | 独立复核角色；不得由实现者本人复核通过 |
| `limitations` | 不能证明什么、未覆盖子项 |

### 8.2 判定规则

1. `PASS` 必须在冻结候选上由独立测试角色实跑，且断言全部满足、证据可复核；实现者自测只能标 `SELF-TEST`，不能替换 `PASS`。
2. `FAIL` 必须给出可复现步骤、预期/实际、最小影响范围；不得删断言或改测试数据绕过。
3. `BLOCKED` 仅用于真实外部条件（无 Desktop、无浏览器、端口/权限、真实上游缺失），须写明失败动作、错误、已尝试方案、最小解除条件；未尝试一律 `NOT_RUN`。
4. `NOT_RUN` 是默认值；本计划阶段 T01–T09 全部 `NOT_RUN`，不得因“设计完整”改判。
5. 一个子断言失败不得用其他子断言通过抵消；T04 的 5 类 fixture 必须逐类记录。
6. 候选变化（源码/迁移/构建产物/测试脚本）使旧结论失效；修复后重跑受影响项并更新候选哈希。
7. 测试计划、空报告、Mock、静态页面、预置常量、实现者总结都不是 T01 端到端结果，也不能作为本单元 PASS 依据。
8. Desktop 未运行即写 `NOT_RUN`；不得把 Node Web Host 成功改写成 Electron 已验证。

---

## 9. 需主管确认的模糊点

1. **“10 字段响应”**：本计划按“成功 5 字段 + 错误 5 字段的并集、单响应只出现一组”理解；请确认是否另有 10 字段单一对象要求。
2. **Host 连接 PRAGMA 证据方式**：`journal_mode/foreign_keys/synchronous/busy_timeout` 属连接级；需确认候选是否提供仅测试/日志的打开诊断（不含绝对路径）作为 D6 证据；否则该子项只能 `FAIL`（证据不足），不得用独立连接代替。
3. **迁移 checksum 独立重算**：需确认测试可获得的“规范 v1 SQL 字节”来源（建议 `lib/storage.js`/`test-support.js` 导出规范 SQL 或固定文件）；只有 `MIGRATION_V1_CHECKSUM` 常量时，独立重算受限。
4. **T07 关闭证据**：是否要求 `test-support` 暴露只读句柄状态（`isOpen/closed`）；仅日志 `knowledgeos-storage: closed` 是否足以作为 close 证据。
5. **缺失 `Content-Type`**：期望 `415` 还是 `400`；本计划暂按 `415`。
6. **未知查询参数**（`?sql=`/`?force_fail=`/`?db_path=`/`?version=`）：期望拒绝（422/400）还是安全忽略；本计划只断言“无写入、无故障触发、无 500”，不预设状态码。
7. **并发同键状态组合**：是否严格要求一个 201 + 一个 200；本计划按契约判“恰 1 行 + 至多一个 201”，若出现双 201 记 `FAIL`。
8. **Desktop Host 探针**：当前只承诺 Node Web Host；Desktop 探针不可用时单列 `NOT_RUN`，请确认不构成阻塞。

---

## 10. 计划完成声明

- 本文件完成 T01–T09 的目标、前置、可执行步骤、客观断言、失败判据、证据要求与“不能证明什么”，并明确区分真实 HTTP/真实 SQLite 与受控故障。
- v2.1.1 修复后测试尚未运行，当前新候选 T01–T09 均为 `NOT_RUN`；旧候选原测试记录及本次反例 FAIL 分别保留，不能覆盖或计为新候选通过。
- 唯一写入为本文件；未修改产品代码、测试、profile 或桌面 DSH。
- 下一步由主管冻结候选（提交或逐文件 manifest），独立测试角色再按本计划实跑并回填结果。

## v2.1.1 定点补充

R1 归入 T04：测试直接读取完整 sqlite_master type/name/sql、application_id、user_version、journal_mode、迁移账本和哨兵数据，不能复用产品 readDatabaseFacts 作为唯一判据。覆盖 sqliteX_foreign_private 外来表、仅 sqliteX_view 的库、合法 v1 库中新增 sqliteX_ 索引/触发器；应在修改前拒绝且逻辑状态保留。正常空白库与含真实 sqlite_autoindex_* 的合法库须继续可用。至少一个外来表 fixture 经真实已认证 Host 验证 STORAGE_INCOMPATIBLE，同时 status 可达且库未改。

R2 归入 T05/T09：actual 与断言使用同一个按幂等键过滤计数；实际 profile 加载文件的 SHA-256 与事先冻结候选逐值比较，并在独立临时副本上验证哈希不一致必然拒绝；运行开始/结束时间真实且非空。不要把哈希长度检查或工作目录自比较当加载一致性。

独立角色先核对判据再执行，原 runs 文件不修改，新结果写入新候选目录。当前完整执行规范以唯一 DSH_START.md v2.1.1 与 work_units.json 为准，修复后的通过不能预先填写。
