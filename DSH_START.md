---
instruction_revision: "2.1.0"
execution_phase: "deepseek_foundation"
executor: "deepseek_harness"
active_unit: "FND-002"
auto_advance: false
---

# 当前执行指令：DeepSeek Harness · FND-002 本地业务持久化最小闭环

你是 KnowledgeOS 当前功能的开发主管。用户已经验收第一部分并明确选择第二部分。本轮只实现 FND-002：让一条合成验证记录经真实 DSH Host 写入独立 SQLite 业务库、读取，并在 Host 真正停止和重启后继续读取同一条记录；同时完成事务、迁移、错误及连接释放验证。先定义测试，再逐步实现和实测，返修到本单元通过后停止。

这是唯一当前可执行提示词，已整体替换 FND-001 收尾指令；旧正文只存在于 Git 历史。结束旧任务的子智能体上下文，新任务包一律标 FND-002 / v2.1.0。不得同时执行旧指令，不调用 Codex，不自动开发 FND-003。

## 1. 固定基线与执行状态

| 项目 | 本轮约定 |
|---|---|
| 产品仓库 | `https://github.com/Changxin-YR/personal_konwledge-base.git` |
| 当前工作分支 | `dsh/knowledgeos-fnd-002`；从已验收第一部分继承，main 尚未合入实现 |
| 第一部分验收基线 | `ce3a00ccd7c8cc46eaae6e660144730109cf93a0`，FND-001 passed、R1–R4 CLOSED |
| 第一部分验收记录 | `docs/evidence/FND-001/ACCEPTANCE_REVIEW_20261116.md` |
| 官方上游 | `https://github.com/deepseek-ai/deepseek-harness.git` |
| 固定上游 SHA | `39163dd30f703a79079e2d2446545cff3c453738`，根包 `0.2.2-rc.3` |
| 工具链基线 | Node `>=24.9.0`，构建 pnpm `11.28.5`；记录实际运行版本，不自动跟随 latest |
| 初始状态 | `execution_state.active_unit=FND-002`、`unit_state=ready`；目录中 FND-002 仍 planned，表示已选未开发 |
| 并发与停止 | 一个活动单元、一个生产代码写者；`auto_advance=false`；Codex review locked |

执行前核对 `config/execution_state.json` 的版本、active_unit、执行器、上游 SHA 及本文件 SHA-256，并运行计划检查。`ready` 才开始并同步本单元为 in_progress、更新 state_reason 和真实测试进度；`in_progress` 从真实进度恢复；`blocked` 先核对具体阻塞并继续本单元可做部分；若已为 `passed / awaiting_user`，只交接不重复开发。不得单独重算哈希、改测试预期或改状态来掩盖指令冲突。

当前候选以此分支最新已核对的工作树为准；上述第一部分 SHA 只作继承依据，不授权 reset、覆盖后来提交或用户修改。FND-001 源码、产物、报告和失败/复测历史全部保留。

## 2. 必读材料与启动预检

按顺序读取：

1. 仓库 `AGENTS.md`、本文件、`config/execution_state.json`、`docs/status/PROGRESS.md`、`docs/status/BLOCKERS.md`。
2. 从 `config/work_units.json` 只提取 FND-002 和已通过的依赖 FND-001；读取第一部分验收记录、当前包 README 和真实启动说明。
3. 需求 F01/F42、`03_ARCHITECTURE.md` 的分层与业务存储、`04_DATA_AND_STATE_CONTRACTS.md` 的本轮边界和事务、`05_API_AND_AI_CONTRACTS.md` 的本轮接口和通用幂等、`11_AGENT_AND_PROMPT_PROTOCOL.md`；A07/A49 只识别本轮前置证据边界。
4. 固定 DSH 的 AGENTS、相关开发规范及下列真实入口：`packages/host/webserver/src/index.ts`、`packages/client/connection/src/api-request-trust.ts`、`rpc-host.ts`、`packages/storage/storage-sqlite/src/{index,schema}.ts`、`docs/user/develop/basic/config.md` 与 publish 配置覆盖规则。

核对 remote、当前分支、工作树和远端；正常 fetch/同步到 `dsh/knowledgeos-fnd-002`。遇到用户未提交修改先保留，用不覆盖的方式继续；不 reset --hard、不 force push、不自动合并 main。正常本单元开发、测试、返修、提交和推送已授权，不因常规实现细节反复请求确认。

先运行 `node scripts/verify-plan.mjs`、`node scripts/prepare-upstream.mjs --check`。优先复用已核验的固定源码、隔离构建和锁定依赖；源码确未准备时再按现有 prepare 流程补齐。不要无故重建整个上游。若需要 build:check，遵循先 build:artifacts 后 build:check。

### 2.1 本轮隔离运行环境

工程默认：新建专用 DSH_HOME `.cache/dsh-home-fnd002`、profile `knowledgeos-storage-test`，端口优先 3100；独立业务数据目录 `.cache/knowledgeos-fnd002-data/<run_id>/`，绝对路径由测试脚本解析后传给可信 Host 配置。业务数据目录与 DSH_HOME、Session/KV、源码缓存、构建产物分开。重启持久化测试必须保持同一 run_id 和同一路径，不能重启时另建目录。

这些是开发测试目录，不是正式发行版用户数据目录方案。端口被占用时选择空闲本机端口并记录，不杀未知进程。停止或重启前核实 PID、启动命令、profile、端口及进程归属；不停止承载开发会话的 DSH，不触碰默认 profile、用户真实数据库或其他仓库。

PowerShell 使用 `$dshTestHome`、`$knowledgeosRepo`、`$knowledgeosDataDir` 等专用变量，禁止给 `$HOME` / `$home` 赋值。首次初始化与继续启动分开；显式 profile 启动不再额外追加旧 `web` 位置参数，`--from-default-profile web` 只按固定 CLI 首次初始化使用。先核验上游源码及构建来源，再使用 release 元数据，不能伪造锁定 SHA。

## 3. 允许范围与架构落点

沿用已有 out-of-tree `packages/knowledgeos-panel/` 和分层模块化单体，仅增加实际需要的几类文件：

| 位置/层 | 本轮责任 |
|---|---|
| Host 传输入口与组合根 | 可信配置、DSH 路由、输入/响应映射、实例生命周期与依赖装配 |
| 应用用例与内层存储端口 | create/get 探针记录、输入约束、稳定错误与幂等行为；不导入 DSH、HTTP、React 或 SQLite |
| SQLite 适配层 | 磁盘连接、归属/版本检查、两张表、最小迁移、参数化 SQL、事务与释放 |
| 当前单元测试 | 真实 Host 请求、真实 SQLite 故障测试、独立候选验证与受影响回归 |

具体文件名由架构角色在编码前记录，但不创建空领域目录、通用仓储基类、独立微服务、ORM、配置中心或第二套前端。`node:sqlite` 只进入 SQLite 适配层；HTTP handler 不拼 SQL；应用用例不绕过端口直接访问文件。

保留 `/knowledgeos/status` 的既有只读运行诊断含义和面板行为。它表示 Host 状态，不能用它暗示数据库已可用。无需新增数据库管理页或六工作区；真实 HTTP 测试客户端即可完成本轮写读闭环。

本轮不实现 FND-003 账号、FND-004 对象授权、FND-005 产品模型调用、FND-006 jobs/outbox，也不开发资料导入、解析、RAG、真实知识实体、协作服务、备份恢复产品或 Windows 安装包。FND-002 探针不是知识条目，不伪造用户、所有者、空间或 service_id 来假装完成后续契约。

### 3.1 必须适配的两个既有边界

现有 `webServer.register({ resource })` 仅支持 GET/HEAD，POST 会被上游先拒绝。新写路由必须使用固定上游真实 `handler(req, res, peer?)` 注册并显式 `auth: 'required'`。按源码补齐当前 `src/cordis.d.ts` 的真实最小类型或使用可用公开类型，不能通过 `any`、虚构签名或假路由骗过编译。handler 自行处理方法、body 上限、JSON 校验、错误映射和完整响应生命周期。

现有 `scripts/fnd001/scope-check.mjs` 会禁止整包出现 SQLite/新依赖，它只适用于第一部分历史候选。本轮保留它及历史结果，新增 `scripts/fnd002/` 的准确范围检查，允许本轮适配器和必要配置依赖，继续拒绝未来功能与依赖倒置。不要隐藏 SQLite 实现、删旧检查或将旧禁 DB 规则误当本轮验收失败；第一部分的行为回归仍须执行。

## 4. 多智能体分工与执行顺序

先盘点 DSH 实际可用工具与并发槽位，最多四个活跃角色。角色名称是职责，不是可杜撰的 API。所有任务包写明 v2.1.0、FND-002、固定上游、分支/候选、允许路径、测试 ID 与停止条件，按 `11_AGENT_AND_PROMPT_PROTOCOL.md` 返回可核对结果。

| 角色 | 责任与写入范围 |
|---|---|
| 主管 | 锁定单元、整合契约/候选/证据/状态；不与实现者同时改生产代码 |
| 架构审查 | 先核查真实 DSH API、配置、数据目录和依赖方向，审查最小契约；默认只读生产代码 |
| 实现者 | 唯一生产代码写者，按当前功能小步实现并运行针对性检查 |
| 独立测试 | 在实现前依据目标建立断言，在冻结候选实跑；只写测试与证据，不暗改生产实现 |

顺序：预检与契约记录 → 先写九项测试预期 → 最小数据库/迁移与对应测试 → create/get 及幂等真实往返 → 重启/故障/生命周期测试 → 受影响回归 → 冻结候选、独立复核 → 缺陷定点返修/复测 → 提交并停止。

这几个步骤都属于同一个持久化功能，不是分派多个未来单元。实现者不能一次写完未来基础层再补测试。缺少独立角色的实际运行能力时可继续本单元实现和自测，但不能把自述替代独立验收后标 passed。

## 5. 本轮冻结的最小技术契约

以下是根据既定架构选择的本轮工程默认，不冒称用户另行确认的新功能。架构角色在 `docs/evidence/FND-002/architecture.md` 记录实际落点及固定源码依据；若真实 API 与约定不一致，先记录证据并作保持行为的最小适配。不得擅自换数据库、扩大业务范围、删除必测项；实质范围冲突要明确报告。

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

1. 新文件或真正空白库才可初始化。对已有库先进行只读归属/版本/账本预检，再执行任何修改性配置和迁移；未来版本、不同 application_id、已知 checksum 不符或非空未知 schema 均拒绝。空白要结合 application_id、user_version 和用户 schema 对象判断，不能仅见 user_version=0 就接管。
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

## 6. 九项必测义务

以下与 `config/work_units.json` 的 FND-002-T01 至 T09 一致。编码前独立测试者把它们写成可执行 test-plan，并标记真实 HTTP、真实 SQLite 受控故障和可选运行环境；不删减预期来迁就实现。所有必测都要在本轮冻结候选上取得真实结果。

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

**断言：**失败迁移不半提交；不兼容/归属不明库在修改性配置和迁移前被拒绝；不把 user_version=0 单独视为空库；不降级、改账本、删库或改路径造成功；原逻辑数据/schema/版本保留，错误可定位。

**证据：**fixture 来源与故障点；逻辑数据/schema/版本/账本前后比较；真实打开拒绝与写接口拒绝结果；恢复结果；不把 WAL 文件哈希变化直接当数据丢失。

### FND-002-T05：最小创建幂等、重试与并发重复请求

**前置：**真实 HTTP 接口，独立业务库；Idempotency-Key 与内容摘要契约已冻结。

1. 同键同 content 连续提交，Host 重启后再提交；比较记录和返回值。
2. 同键不同 content 提交，核对明确冲突且旧内容不变。
3. 并发发出两个同键同内容创建请求，核对结果及唯一记录计数。

**断言：**首次 201；同键同内容重放 200 且同 ID/created_at；同键不同内容 409 IDEMPOTENCY_CONFLICT；并发不会生成两条；幂等存在真实业务库，不靠进程内缓存或把请求键当身份。

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

**断言：**原只读链路不退化，错误不假装存储就绪；构建/类型/实际加载均有真实证据；未夹带账号、ACL、资料解析、RAG、jobs/outbox、安装包或未来模块；旧 FND-001 禁 DB 检查只属历史范围，不被篡改或误当本轮门槛。

**证据：**构建/检查命令及退出码；源码/产物/加载路径指纹；面板状态与失败恢复证据；新范围检查和依赖差异；未配置业务目录的兼容回归。

## 7. 候选、证据与复验要求

建立 `docs/evidence/FND-002/architecture.md`、`test-plan.md`、`candidate.md`、`REPORT.md`、`independent-verification.md`；运行证据归入 `runs/<candidate-or-run_id>/`。这些是设计/测试证据，不得成为第二份启动提示词。测试脚本放 `scripts/fnd002/` 或本包必要测试目录，注明确切启动方式。历史 FND-001 证据不得覆盖为本轮结果。

开发中每完成一个可验证动作立即运行对应测试，记录真实失败和定点修复。独立验收前冻结生产源码、迁移、测试脚本和实际加载产物：有提交写完整 commit；有未提交内容则另给逐文件 manifest/hash，不能只写 HEAD 掩盖脏工作树。测试者核对 profile 加载的 lib 与候选一致，期间不并发改生产代码。

修复使源码、迁移、构建产物或测试脚本变化后，重新冻结并复跑受影响项；只在说明未变依赖和适用原因后复用已有效证据。不要每次机械重建全上游、重复完整 FND-001 生命周期或运行不相关未来测试。T09 必须覆盖本轮受影响行为；发现实质生命周期变化再扩大相关回归。

每项结果记录测试 ID、PASS/FAIL/NOT_RUN/BLOCKED、候选、前置数据、命令/退出码或真实 UI/HTTP 操作、环境、实际值/期望值、证据路径、执行与独立复核角色。测试计划、空报告、Mock、静态页面或预置常量不能当 T01 真实端到端结果。受控故障明确标注，但必须作用于真实 SQLite。

最低门槛为固定真实 Node Web Host。Desktop Host 实际可用时补运行时探针，无法运行则单列 NOT_RUN；不要把 Node 成功改写成 Electron 已验证。Desktop/正式安装包/真实 GPT/未来账号功能不额外成为当前单元阻塞，也不能被计为已通过。

公开提交只包含合成测试内容、脱敏日志、必要截图/摘要和脚本；数据库及 WAL/SHM/journal、备份、Cookie、Token、私有路径和真实用户正文不上传。检查 .gitignore 和待提交文件，脱敏后保留可验证关联与计数，不能用脱敏删除失败事实。

本轮只形成 F01/F42 以及 A07/A49 的前置局部证据。A07 的完整解析恢复、A49 的 Windows 安装/升级/卸载场景仍由其最终负责单元验证，不修改为 PASS；没有需求因为基础 SQLite 可用就变成 verified。

## 8. 收口、提交与停止

只有本单元实现完成、T01–T09 实际通过、已发现当前缺陷关闭、独立复核完成且候选/证据一致，才将 `work_units.json` 的 FND-002 改为 passed、test_result_status 改为 PASS，补真实 evidence_paths/完成时间；execution_state 改为 awaiting_user 并更新 state_reason，active_unit 保持 FND-002，auto_advance 保持 false，Codex 保持 locked。同步 README、PROGRESS、BLOCKERS、当前报告，不并存“通过”和“待补测”的当前结论。

真实外部阻塞写明失败动作、错误、候选、影响测试、已尝试方案、最小解除条件及当前仍可做的内容。未尝试只是 NOT_CHECKED/NOT_RUN，不能编造 BLOCKED；必测没有完成不能以“非阻塞”名义 PASS。保留成果并停在当前单元，不用下一功能或未来 Codex 代替本轮修复。

运行 `node scripts/verify-plan.mjs` 与本轮范围检查，检查状态/哈希/测试引用一致，正常提交并推送 `dsh/knowledgeos-fnd-002`，回读远端确认提交。不要 force push、合并 main 或覆盖第一部分完成分支，不新增 CODEX_START/备用 PROMPT 文件。

最终用中文交接：本轮 PASS/FAIL/BLOCKED、实际改动与架构落点、提交链接、九项测试结果/证据、运行环境和真实数据库验证方式、缺陷与复测、准确可复制的隔离启动/复验命令、NOT_RUN 与剩余限制。然后停止，等待用户选择下一单元；不自行开启 FND-003。
