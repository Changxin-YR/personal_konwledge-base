---
instruction_revision: "2.1.1"
execution_phase: "deepseek_foundation"
executor: "deepseek_harness"
active_unit: "FND-002"
auto_advance: false
---

# 当前执行指令：DeepSeek Harness · FND-002 数据库保护修正与复测

你是 KnowledgeOS 当前功能的开发主管。第二部分已经提交主体实现和真实运行证据，本次复核又发现一个可复现的数据库归属保护缺陷。继续同一个 FND-002，保留已有源码、真实 Host 接入和历史证据，完成 R1/R2 的定点修正及复测后停止。不要从头开发，不进入 FND-003，不调用 Codex。

本文件 v2.1.1 已整体替换唯一入口中的 v2.1.0 正文。旧报告中的 PASS 是原候选在已覆盖用例上的提交结论，不能覆盖本次反例。当前已重新登记为 in_progress，表示收尾待执行；并不代表修复已经完成或新测试已通过。结束旧 revision 的派生任务，新的任务包统一标 FND-002 / v2.1.1。

## 1. 当前基线与真实结论

| 项目 | 本轮依据 |
|---|---|
| 仓库 | `https://github.com/Changxin-YR/personal_konwledge-base.git` |
| 继续工作分支 | `dsh/knowledgeos-fnd-002`；不改第一部分分支、不自动合并 main |
| 本次复核提交 | `cba39e4808fd41e6d7b076c3fbf080577c8b1114` |
| 原产品候选 | `1b99e392593ef0213f68f8dfb45f5d34a06eac1b` |
| 原九项证据 | `docs/evidence/FND-002/runs/1b99e39/`，保留其当时实际结果 |
| 本次复核记录 | `docs/evidence/FND-002/SUBMISSION_REVIEW_20261116.md` |
| 本次真实反例 | `docs/evidence/FND-002/reviews/cba39e4/root-prefix-result.json`，FAIL |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738`，根包 `0.2.2-rc.3` |
| 工具链 | Node >=24.9.0 API 基线，构建 pnpm 11.28.5；记录实际版本 |
| 前置单元 | FND-001 保持 passed，既有面板/status 与历史证据保留 |
| 当前状态 | FND-002 in_progress，R1/R2 OPEN；修复后的测试 NOT_RUN |

复核确认原候选 11 个关键文件 SHA-256 与提交一致，T01–T09 有 109 条实际断言，独立脚本有真实记录。这些证据继续说明已测行为。新反例显示：合法用户表 sqliteX_foreign_private 被错误过滤，非空库被标为本应用、升级为 v1 并新增两张表；因此当前单元整体不能 PASS。

只读/计划检查通过不等于归属保护通过。本次反例是在真实磁盘 SQLite 上运行提交的 lib/storage.js；不是新一轮完整 Windows DSH Host 测试，也没有操作用户数据库。

## 2. 读取、预检与隔离

先读 AGENTS、本文件、execution_state、PROGRESS、BLOCKERS、本次复核记录，再读当前 FND-002 工作单元及其 REPORT/candidate/independent-verification/test-plan。需求与架构仍按 F01/F42、03/04/05/11 读取；历史报告和证据不是另一份执行授权。

核对 remote、分支、远端和工作树，保留用户修改及后续提交，正常 fetch/同步；不 reset --hard、不 force push。核对 active_unit、revision、执行器、上游 SHA 和本文件 SHA-256 后运行 `node scripts/verify-plan.mjs`、`node scripts/prepare-upstream.mjs --check`、`node scripts/fnd002/scope-check.mjs`。

优先复用已核验的固定上游构建和隔离依赖，不无故重建整个上游、不改变版本锁。当前 in_progress 从已有成果恢复；blocked 只处理真实当前阻塞；若以后变为 passed / awaiting_user，只交接不重做。不能重算哈希、降低预期或改状态绕过检查。

沿用本轮专用 DSH_HOME `.cache/dsh-home-fnd002`、profile `knowledgeos-storage-test` 和本机端口 3100（占用时核实归属，必要时选择空闲端口并记录）。新测试用新 run_id 与独立合成数据目录；持久化重启在同一次测试内保持同一目录。操作进程前确认 PID、命令、profile、端口，不停止承载开发会话的 DSH。

PowerShell 使用专用变量，禁止给 $HOME/$home 赋值；启动说明从实际仓库目录解析，初始化与继续启动分开。数据库、WAL/SHM/journal、凭据和真实正文不提交；不要覆盖 `runs/1b99e39/` 或本次失败证据。

## 3. 仅修复两个收尾项

### R1：内部对象前缀识别与独立归属回归

已定位：`src/host/storage.ts` 的 `readDatabaseFacts()` 和 `#verify()` 都使用 `name NOT LIKE 'sqlite_%'`。LIKE 的下划线表示任意单字符，因此 sqliteX_* 也被漏掉。空白判定又依赖该错误对象集合，导致已有库被初始化。

按以下顺序推进：

1. 独立测试者先确认本次真实反例，写出“不接管、不修改”的断言。原复现脚本位于 reviews/cba39e4，元数据绑定旧候选；新回归另存可复用脚本并正确绑定新候选，不能拿旧硬编码 SHA 标新结果。
2. 同时修正预检与打开后的校验，只排除字面 `sqlite_` 前缀，例如正确使用 GLOB 或带 ESCAPE 的 LIKE。保留 table/view/index/trigger 的完整枚举；必要时将两处生产查询收敛到一个小 helper，避免再次漂移。不能只给 sqliteX_foreign_private 增加特判、改 fixture 名或放宽未知库规则。
3. 归属/版本/对象拒绝必须发生在切换 journal_mode、迁移和写入之前。保持原 v1 SQL、checksum、application_id、user_version、两表与 API 契约；修正判断逻辑不需要虚构 v2、删库重建或修改历史迁移。
4. 更新当前 test-plan 与新独立验证方法。旧 check-db/view-objects 也复制了错误 LIKE 查询；历史 runs 文件保留，不回写成修复版。新测试直接读取全部 sqlite_master 的 type/name/sql、PRAGMA 和哨兵数据，由独立判据识别字面前缀，不能只调用被测 readDatabaseFacts() 证明库为空。
5. 最小回归包含：未知库中 sqliteX_foreign_private 表及原记录；仅含 sqliteX_view 的未知库；已知 v1 库中新增 sqliteX_ 索引/触发器。它们应拒绝，原数据、schema、归属、版本、账本及 journal_mode 不变。新空白库和含真实 sqlite_autoindex_* 的正常 v1 库应继续可用，不能修成“全部拒绝”。
6. 在真实隔离 Host 上至少验证一个外来表 fixture：Host/status 正常可达，有效认证下业务读写返回 503 STORAGE_INCOMPATIBLE，库逻辑状态未改变。正常库再做真实写读/重启对照。故障夹具不暴露成 HTTP SQL/路径/force_fail 参数。

原记录在已复现反例中没有删除；问题是未经确认修改了外部库归属、版本、journal 和结构。不要夸大为已发生数据删除，也不能因原记录尚在而接受该行为。

### R2：修正本轮可复用证据检查

`scripts/fnd002/run-all.mjs` 有三处已确认的证据问题，应随新回归一起修正：

- T05 的并发断言按 key 过滤计数，但 actual 写了全表计数。保存一个过滤后的值，并用同一值完成断言和证据记录。
- T09 只检查依赖字符串包含包名、固定读取当前仓库目录，再判断哈希长度为 64。应从实际 profile 的安装/解析结果取得加载产物，将其 SHA-256 与事先冻结候选的指纹逐值比较；期望值不能来自同一个待检查文件现算现比。既有独立脚本的真实路径/重建方法可以复用，但必须核对当前来源。
- summary.started_at 从不存在的 results 字段读取，实际为 null。保存真实运行开始/结束时间，并与逐项时间保持合理顺序；补记不能伪造之前的时间。

用独立临时产物/manifest 副本制造一个哈希不一致，确认比较器失败并阻止候选通过；不修改正在运行的 profile 产物、不制造未知进程故障。这个负例只验证新证据门槛，不变成额外业务功能。

同步当前文档的状态和适用范围，清除“已通过”与“实现尚未开始”并存等当前结论；历史证据保留对应候选和时间。R2 中旧候选哈希已经由独立报告补足，不能据此说旧记录全是假的；本轮修正是让新的验收脚本能可靠执行同一要求。

## 4. 分工与修复顺序

所有角色只处理 FND-002 / v2.1.1，最多四个活跃角色，只有一个生产代码写者。主管锁定 R1/R2 与候选；架构角色确认最小修复且默认只读；实现者修改适配器和配套脚本；独立测试者先写判据，再对冻结候选实跑，不暗改产品实现。按 11 协议交付真实命令、退出码、文件指纹、实际结果与限制，不把口头同意当验收。

顺序：核对已有成果与失败证据 → 独立写前缀回归 → 最小修复 R1 → 立即运行真实 SQLite 反例与正常库对照 → 修正 R2 → 构建/类型/范围检查并冻结候选 → 真实 Host 与本单元九项测试 → 独立复核 → 定点返修/复测 → 提交停止。

数据库打开/归属路径影响本单元所有以业务库初始化为前提的测试，且主验收脚本也发生变化，因此在新候选上复跑既有 T01–T09，补 R1 的针对性断言和 R2 负例。复用原有小范围测试基础设施，不重做全上游测试或第一部分完整 5/10/60 秒生命周期矩阵；仅当具体代码变化产生新的影响时扩相关回归。

允许修改当前 SQLite 适配器、必要构建产物、本轮测试/计划、脱敏证据及状态文档；保留现有分层模块化单体、应用端口、真实 handler、可信 dataDir、认证/来源保护和旧面板。不得顺带实现账号/权限、其他业务表、RAG/jobs/outbox/模型、安装包或上游重构。常规本单元修复、测试、提交推送持续自主完成，无需重复请求确认。

## 5. 本轮保留的最小技术契约

以下契约沿用已实现的当前功能，只补齐 R1 的正确识别与 R2 的证据要求，不重新选型或新建一套实现。架构角色在 `docs/evidence/FND-002/architecture.md` 记录实际落点及固定源码依据；若真实 API 与约定不一致，先记录证据并作保持行为的最小适配。不得擅自换数据库、扩大业务范围、删除必测项；实质范围冲突要明确报告。

### 5.1 可信配置、运行时与连接

通过固定 Cordis 插件 Config 类型、同名 Schemastery schema 和 `apply(ctx, config)` 接收可信 `dataDir`；配置来自 `knowledgeos-host` row 的 config，不来自 HTTP 请求。配置 overlay 是整份 config 覆盖时，保留该 row 必需字段。新增真实 schema import 要正确声明依赖、锁定并验证 Host 运行，不能仅补 ambient 类型假装依赖存在。

`dataDir` 在配置结构上允许缺省以兼容第一部分旧 profile；缺省时保留原 status/面板，本轮持久化接口明确返回未配置/不可用。要启用本轮持久化必须明确传入本机绝对目录，数据库文件固定为该目录内 `knowledgeos.sqlite`。不从 cwd、用户 HOME、构建目录或前端参数猜默认路径；无效配置/打开失败不回退内存、JSON、DSH KV 或其他路径。

采用 `node:sqlite` 的 `DatabaseSync`，单个活动测试 Host 只持有一条受控写连接，所有本轮写入通过同一适配器。记录实际 Host 的 Node 与 SQLite 版本，别只报 package 声明。最低 API 兼容 Node >=24.9.0；`statement.close()` 是后续版本才有，不能无条件使用；也不能因为测试机较新就静默引入更高版本独有选项。

对可接受的库配置并回读：`journal_mode=WAL`、`foreign_keys=ON`、`synchronous=FULL`、忙等待 250 ms；这些配置在事务外执行。同步驱动不能靠包一层 Promise 变成非阻塞；事务只做短 SQL 操作，不含网络、模型、文件复制或异步等待。普通正常重启测试不能宣称已证明突然断电零丢失。

### 5.2 schema v1：仅两张应用表

| 表 | 最小字段与约束 |
|---|---|
| `schema_migrations` | `version INTEGER PRIMARY KEY`、`checksum TEXT NOT NULL`、`applied_at TEXT NOT NULL`；只记录已提交迁移 |
| `storage_probe_records` | `id TEXT PRIMARY KEY`、`idempotency_key TEXT NOT NULL UNIQUE`、`request_digest TEXT NOT NULL`、`content TEXT NOT NULL`、`created_at TEXT NOT NULL` |

使用固定应用归属标识 `PRAGMA application_id`（工程默认 `0x4B4F5331`，KOS1）和 `PRAGMA user_version=1`；不要使用 SQLite 内部维护的 `schema_version` 代替应用版本。ID 由服务端生成 UUID，时间为服务端 UTC ISO 8601。记录内容逐值保留，不 trim、不截断、不作 Unicode 归一化。迁移脚本的规范字节及 SHA-256 算法固定并记录；已执行迁移不可事后改正文/账本来消除校验失败。

这是基础设施合成验证记录，暂不添加正式产品的 owner/scope/service、revision、审计或 outbox 表。`04` 的正式业务事务与所有权契约仍有效，等相应功能激活后落实；本轮不会把这套探针认作已完成正式领域持久化或通用幂等平台。

### 5.3 归属预检、迁移与回滚

1. 新文件或真正空白库才可初始化。对已有库先进行只读归属/版本/账本预检，再执行任何修改性配置和迁移；未来版本、不同 application_id、已知 checksum 不符或非空未知 schema 均拒绝。空白要结合 application_id、user_version 和全部用户 schema 对象判断，不能仅见 user_version=0 就接管。内部对象只能按字面 sqlite_ 保留前缀排除；sqliteX_* 等合法表、视图、索引、触发器必须参与判断，不能用未转义下划线的 LIKE 模式过滤。
2. v1 DDL、应用标识/版本和迁移账本必须在同一个真实事务中提交。重复启动只校验，不清空、不重复迁移、不重新生成原记录。
3. BEGIN/COMMIT/ROLLBACK 都用实际驱动验证。中途失败回滚整个事务；COMMIT 抛错也不能假定事务已经结束。必要时检查真实事务状态，回滚失败或状态不明时停止写入并报告，不能返回成功。
4. 初始化/迁移失败后关闭部分打开的连接。本功能保持不可写，日志给出可定位原因；Host 仍可达时本轮接口返回明确不可用，status 的原语义不变。不得删除原库、自动降级、修改旧 checksum 或换空库绕过问题。
5. 迁移失败与未来版本使用隔离合成 fixture；通过同一真实运行器的测试入口注入，不发布虚构 v2 业务迁移，不给 HTTP 增加 SQL、force_fail、db_path 或迁移版本参数。比较逻辑数据、schema 和账本；不要要求运行中的 WAL 文件逐字节不变，也不要只复制仍在使用的主文件冒充可靠快照。

### 5.4 本项目新增 HTTP 契约

下列路径是 KnowledgeOS 本轮自定义接口，不是 DSH 现成业务 API。两个操作都走真实已认证 WebServer handler；不以进程内 `readResource()` 或直接调用函数冒充网络/鉴权验证。

| 操作 | 请求 | 成功行为 |
|---|---|---|
| `POST /knowledgeos/foundation/records` | `Content-Type: application/json`；`Idempotency-Key` 为规范 UUID 字符串；JSON 仅 `{ "content": "..." }` | 首次提交后 201；相同请求重放 200；返回同一持久记录 |
| `GET /knowledgeos/foundation/records/{id}` | UUID 路径参数；无写入 | 200 返回真实库中的记录；合法但不存在的 ID 为 404 |

输入约束：content 为非空字符串，UTF-8 字节数 1–4096；JSON 请求体最多 16 KiB，按实际读取字节限制，不只相信 Content-Length；请求正文按严格 UTF-8 解码；JSON 解析后的 content 必须是格式正确的 Unicode 字符串，拒绝孤立高/低代理项并返回 422 INPUT_INVALID，不得以替换字符修复后保存。拒绝未知字段、错误类型和非法编码。正文只含 content；客户端不能指定 id、created_at、所有者、目录、SQL、schema 或故障开关。SQL 全部参数化；文本中的 SQL 片段按数据保存。

幂等范围是本独立库内的 `storage_probe_records.idempotency_key`。请求摘要取 content 原值 UTF-8 字节的 SHA-256，不取带空格差异的 JSON 传输正文；摘要及内容一致才重放同 ID/created_at。同键不同内容返回 409，不覆盖原记录。键、摘要和记录在同一事务持久化，重启后仍有效，唯一约束处理并发重复。Idempotency-Key 不是用户身份，也不等于诊断 request_id。

成功正文统一为 `{ data: { id, content, created_at }, meta: { request_id, schema_version: 1 } }`；request_id 为服务端诊断 ID。不得返回业务库私有绝对路径、Cookie、Token、SQL、堆栈或环境变量。

| 情况 | HTTP / code | retryable |
|---|---|---|
| JSON 语法/编码错误 | 400 / INVALID_JSON | false |
| content、ID、幂等键或字段结构不合法 | 422 / INPUT_INVALID | false |
| body 过大 | 413 / PAYLOAD_TOO_LARGE | false |
| 非 JSON 媒体类型 | 415 / UNSUPPORTED_MEDIA_TYPE | false |
| 非约定方法 | 405 / METHOD_NOT_ALLOWED，并返回合适 Allow | false |
| 记录不存在 | 404 / NOT_FOUND | false |
| 同键不同内容 | 409 / IDEMPOTENCY_CONFLICT | false |
| 有限忙等待超时 | 503 / STORAGE_BUSY | true |
| 未配置、路径/连接不可用 | 503 / STORAGE_UNAVAILABLE | false；需先修复配置/环境 |
| 版本过新、归属不符或账本不匹配 | 503 / STORAGE_INCOMPATIBLE | false |
| 非预期内部故障 | 500 / INTERNAL_ERROR | false |

应用错误正文采用 `code, message, request_id, retryable, safe_details`，不把上游认证层 401/403/503 的已有响应强行改成同一格式。对外信息安全，内部日志保留可定位错误与测试关联；不得把 SQL 错误统一当参数错误、空结果或成功。

### 5.5 认证、来源保护和关闭

沿用固定 Web profile 的 Connection/authentication-token 和 `auth: 'required'`。上游先校验 Host/来源，再验证凭据：可信来源缺少/错误 Cookie 为 401；有效 Cookie 搭配外站 Origin、Origin:null 或 `sec-fetch-site: cross-site` 为 403；可信 Host、有效 Cookie 且无 Origin 的 CLI 可以通过。复用该保护，不另造 Cookie 解析、不设匿名、不加宽 trustedHosts、不要求合法 CLI 必须伪造 Origin。

本机 DSH owner 连接只为当前隔离开发使用，不代表 KnowledgeOS 注册登录/多人权限已经完成。不要开放远程监听或复用本轮接口向多人分发 owner 凭据。

释放时先关闭新操作入口、撤销路由并让已接收请求完成或得到明确拒绝，再关闭数据库一次；解析 body 之后进入用例前也检查关闭状态，不能使用已关闭句柄。清理要幂等，部分初始化失败也不泄漏连接；重新挂载打开同一文件。禁用、卸载、重新安装或退出均不得删除业务库。测试清理仅处理自己创建且已关闭的隔离目录。

## 6. 九项必测义务（原范围与定点补充）

测试 ID 不变，R1 归入 T04，R2 归入 T05/T09 和运行元数据。以下与当前 work_units.json 同步；旧覆盖结果仍留在原目录，新候选结果写入新目录。

### FND-002-T01：真实 Host 创建、读取与进程重启持久化

**前置：**固定 DSH 的隔离 Web profile 正常运行；有效认证；本轮独立磁盘业务库已就绪。

1. 通过真实 HTTP POST 创建带 run_id、中文、引号与换行的合成记录；GET 返回同一记录。
2. 核实测试 PID/profile/端口后正常停止并重新启动 Host，保持同一业务库路径；重新取得有效认证后 GET 原 ID。
3. 用独立 SQLite 只读连接核对业务库中的记录及计数，证明来源不是进程内 Map、启动夹具或固定返回值。

**断言：**首次提交成功后才回执；重启前后 ID、content、created_at 一致且只有一条记录；业务库与 DSH Session/KV 分离；没有删库、换路径或导入夹具伪造恢复。

**证据：**脱敏请求/响应；重启前后 PID、Host 实例标识与启动命令；独立 SQL 查询和记录计数；候选、库路径脱敏标识、命令与退出码。

### FND-002-T02：真实 SQLite 事务中途失败与回滚

**前置：**同一真实适配器和迁移代码，独立测试库内有已提交的基线记录。

1. 在同一个事务中先成功写入，再通过确定的约束失败触发后续步骤异常；不是只执行一条失败 INSERT。
2. 独立读取逻辑数据和事务状态，随后通过正常路径写入一条新记录。

**断言：**失败事务没有部分写入，原记录保留，异常没有被吞掉或返回成功；回滚后连接可用；回滚失败或状态不明时停止写入。故障仅在测试层注入，不暴露 HTTP SQL/force_fail/路径入口。

**证据：**失败点和真实 SQLite 错误；事务前后记录与事务状态；后续正常写入结果；明确的受控故障测试标记。

### FND-002-T03：首次初始化、重复启动与真实运行时设置

**前置：**新的隔离数据目录；实际 Host 使用的 Node 和 node:sqlite 可观测。

1. 由真实 Host 新建业务库并执行 v1，查询 application_id、user_version、两张表、迁移账本以及 WAL/foreign_keys/synchronous/busy_timeout 实际值。
2. 用相同连接配置的真实 SQLite 测试临时表验证外键生效，不为测试新增生产业务表。
3. 写入记录后重复启动，比较 schema、迁移校验值和记录数量。

**断言：**真实文件库；仅 schema_migrations 和 storage_probe_records 两张应用表；v1 仅提交一次；重复启动不清空、不重复迁移；WAL、外键与耐久/锁等待配置真实生效；报告实际 Node/SQLite 版本。

**证据：**实际 Host 驱动探针；PRAGMA 与 schema/迁移账本查询；外键拒绝断言；首次与重复启动对比。

### FND-002-T04：迁移失败、不兼容版本及数据库归属保护

**前置：**只含合成数据的独立 fixture；采用本轮真实迁移运行器；复制前连接已安全关闭或使用可靠快照。

1. 通过仅测试迁移计划在事务中途制造失败，比较表、版本、归属标识、迁移账本和原数据。
2. 分别准备本应用未来 user_version、已知迁移 checksum 不匹配、application_id 不匹配或非空未知 schema 的测试库。
3. 用实际 Host/适配器打开这些库，检查本轮写接口拒绝写入；保持 Host 可达对照；解除故障后按有效路径恢复。
4. R1 回归：以 sqliteX_foreign_private 表和合成哨兵记录构造未知非空库；另测仅 sqliteX_view 的库及合法 v1 库中新增 sqliteX_ 索引/触发器。测试直接读取全部 sqlite_master type/name/sql 和 PRAGMA，不用被测 helper 判断空白。
5. 正常新库及带真实 sqlite_autoindex_* 的原 v1 库作为接受对照；在真实已认证 Host 上挂载外来表 fixture，验证 status 可达、业务读写 STORAGE_INCOMPATIBLE 且逻辑数据/归属/版本/journal/schema 未改。

**断言：**失败迁移不半提交；不兼容/归属不明库在修改性配置和迁移前被拒绝；不把 user_version=0 单独视为空库；不降级、改账本、删库或改路径造成功；原逻辑数据/schema/版本保留，错误可定位。 只排除字面 sqlite_ 内部前缀，不能使用未转义下划线的 LIKE 模式漏掉 sqliteX_* 用户对象；拒绝发生在修改性配置前。

**证据：**fixture 来源与故障点；逻辑数据/schema/版本/账本前后比较；真实打开拒绝与写接口拒绝结果；恢复结果；不把 WAL 文件哈希变化直接当数据丢失；新增前缀反例的独立原始元数据、原记录及 Host 拒绝对照；旧候选 FAIL 与新候选实际复测分别保存。

### FND-002-T05：最小创建幂等、重试与并发重复请求

**前置：**真实 HTTP 接口，独立业务库；Idempotency-Key 与内容摘要契约已冻结。

1. 同键同 content 连续提交，Host 重启后再提交；比较记录和返回值。
2. 同键不同 content 提交，核对明确冲突且旧内容不变。
3. 并发发出两个同键同内容创建请求，核对结果及唯一记录计数。

**断言：**首次 201；同键同内容重放 200 且同 ID/created_at；同键不同内容 409 IDEMPOTENCY_CONFLICT；并发不会生成两条；幂等存在真实业务库，不靠进程内缓存或把请求键当身份。 证据 actual 与断言使用同一按幂等键过滤的记录计数，不记录全表计数冒充该键计数。

**证据：**请求与响应状态/记录 ID；重启后重放；冲突前后内容；并发结果与数据库唯一记录计数。

### FND-002-T06：打开失败、有限锁等待与恢复

**前置：**独立故障目录和真实磁盘库；忙等待默认 250 ms；使用独立辅助进程/连接持写锁。

1. 用可重复的无效目标（例如父路径被普通文件占用）触发打开失败，不依赖测试账号恰好无写权限。
2. 外部持锁时调用真实写接口，测量失败时间；先断言有限失败，再释放锁。
3. 恢复正确路径/解除锁后经正常路径写读，并核对已有数据。

**断言：**无路径/内存回退，无成功空结果；锁竞争返回 503 STORAGE_BUSY/retryable=true，受控环境在 2 s 内结束；不能期待同一事件循环定时器解除同步阻塞；故障清除后恢复，原数据保留。

**证据：**实际故障与安全错误响应；独立持锁辅助进程/连接记录；实际耗时与配置；释放锁后的恢复及原数据比较。

### FND-002-T07：数据库连接生命周期释放与重新打开

**前置：**本轮 profile 已读写持久记录；能观察适配器真实句柄关闭。

1. 按实际插件生命周期卸载/重载本功能实例，验证先停止接收新操作、撤销入口，再安全关闭连接。
2. 使用驱动状态或仅测试观测证明 close；对幂等清理和已关闭句柄不再使用作断言。
3. 重新挂载或重启同一隔离 profile，打开同一文件读取原记录并写入新记录。

**断言：**关闭真实发生，不以路由 404 代替 close 证据；无关闭后使用/遗留重试/重复注册；重新打开保留数据；插件释放/重装不会删除数据库。

**证据：**实际 disposer/句柄关闭观测；清理与重开记录；重开后原记录及正常写入；测试实例归属。

### FND-002-T08：真实本机认证、来源保护和输入边界

**前置：**真实 Host 在线；同轮有效认证请求能成功，服务端数据库计数可核对。

1. 可信来源下匿名/坏认证分别调用读和写；同时执行合法认证对照。
2. 携带有效 Cookie 测试外站 Origin、Origin:null、sec-fetch-site:cross-site；可信 Host、有效 Cookie、无 Origin 的 CLI 应可正常调用。
3. 验证无效 JSON、非 JSON Content-Type、空/错误类型/超限 content、孤立 Unicode 代理项、超限 body、未知字段、缺失或非法幂等键、非法方法及不存在 ID。
4. 通过真实接口保存含引号和 SQL 片段的合法文本，核对逐值一致及数据库结构未改变。

**断言：**沿用上游准入：可信来源缺/坏凭据 401，外站/null Origin/cross-site 为 403，数据库无写入；正确 CLI 不被误拒；错误按契约映射；GET 不写入；不接受 SQL、路径、版本、身份或故障开关，私有信息不泄露。

**证据：**真实 HTTP 状态/安全错误码；有效认证对照和前后记录计数；输入/来源边界结果；参数化文本保存结果；凭据脱敏。

### FND-002-T09：构建、当前范围与 FND-001 受影响行为回归

**前置：**冻结本轮源码、迁移、测试和实际加载产物；FND-001 历史证据保留。

1. 实际构建当前插件并运行相关类型/行为检查；核对 profile 真正加载的 bundle 与候选指纹一致。
2. 在当前候选验证原面板加载、真实 status 刷新、刷新中文案、真实失败/恢复；验证未配置 dataDir 的旧 profile 仍保留原只读状态功能。
3. 运行本轮范围检查：仅允许 SQLite 适配层/可信配置/最小用例与真实路由，以及必要依赖；检查应用内层没有反向导入。
4. 从实际 profile 解析加载产物，与事先冻结候选的 SHA-256 逐值比较；用独立临时副本制造哈希不一致，确认比较器拒绝；记录真实非空开始/结束时间。

**断言：**原只读链路不退化，错误不假装存储就绪；构建/类型/实际加载均有真实证据；未夹带账号、ACL、资料解析、RAG、jobs/outbox、安装包或未来模块；旧 FND-001 禁 DB 检查只属历史范围，不被篡改或误当本轮门槛。 仅判断哈希长度或仅计算工作目录自身哈希不能证明实际加载候选；测试摘要时间与逐项记录一致。

**证据：**构建/检查命令及退出码；源码/产物/加载路径指纹；面板状态与失败恢复证据；新范围检查和依赖差异；未配置业务目录的兼容回归。

## 7. 候选与证据

保留 `runs/d7a453d/`、`runs/1b99e39/` 与 `reviews/cba39e4/`。新结果写 `docs/evidence/FND-002/runs/<new-candidate-or-round>/`；更新 test-plan/candidate/REPORT/独立结论，明确 R1/R2 的发现、修复和真实复测，不把新用例改写成之前已经覆盖。

冻结完整源码、实际 lib、迁移及测试脚本；有未提交修改时给逐文件 manifest/hash，不能只写 HEAD。独立角色核对实际 profile 加载路径和冻结指纹，运行期间不并发修改产品。发生修复后重新冻结并复测受影响项；本轮门槛以新候选实际证据为准。

每项记录 PASS/FAIL/NOT_RUN/BLOCKED、前置合成数据、候选、实际命令/退出码、HTTP 或 UI 操作、期望与实际值、开始/结束时间、执行及复核角色、证据路径。真实 Host、真实 SQLite 受控故障与 Mock 分开；计划检查 PASS 不证明产品通过。

Node Web Host 仍为最低运行门槛。Desktop、安装包、真实 GPT 等未运行范围如实保留，不额外加为本次收尾阻塞，不用 Node 证据替代它们。F01/F42、A07/A49 仍只有基础子集；完整需求与场景不得提前 verified/PASS。

公开提交前脱敏 Cookie/Token/私有绝对路径和真实正文；只提交合成测试数据的文本证据，不提交数据库和旁文件。报告里的复验命令从实际仓库解析，使用新输出目录，不能覆盖已提交历史证据。

## 8. 收口与停止

R1/R2 均关闭、新候选 T01–T09 实际通过、新增前缀反例与正常库对照通过、实际加载指纹检查及负例有效、独立复核完成，才将 FND-002 恢复 passed、test_result_status=PASS、retest_status=PASS。补真实完成时间/evidence_paths，清空 open_review_items、记录 closed_review_items，将 execution_state 改 awaiting_user 并更新 state_reason。

同步 README、PROGRESS、BLOCKERS、REPORT、candidate、当前独立结论与审查项解决状态。本次 SUBMISSION_REVIEW 和 FAIL 原始结果保留历史事实，可追加关闭依据，不删除或改写成旧候选已通过。当前结论不能仍并存 OPEN/待补验和 PASS。

若出现真实外部阻塞，说明失败动作、候选、影响测试、已尝试方案与最小解除条件，保留成果并停在 FND-002；单纯待修缺陷为 in_progress，不伪装成环境 BLOCKED。未运行必测不算通过，不推给未来 Codex。

运行 `node scripts/verify-plan.mjs` 和当前范围检查，正常提交/推送同一 `dsh/knowledgeos-fnd-002` 分支并回读远端。禁止 force push、自动合并 main、覆盖第一部分分支或新增备用 START/PROMPT。

最终中文交接 R1/R2 结果、提交、九项测试和新反例证据、实际加载候选、复验命令、未运行范围与剩余限制，然后停止。active_unit 保持 FND-002，auto_advance=false，Codex locked，FND-003 继续未激活。
