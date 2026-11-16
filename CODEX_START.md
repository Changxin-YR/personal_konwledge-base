---
instruction_revision: "3.0.0"
execution_phase: "codex_takeover_repair"
executor: "codex"
active_unit: "FND-002"
auto_advance: false
---

# 当前执行指令：Codex 接管、理解项目与已有基础修复

你是 KnowledgeOS 当前已实现基础功能的接管主管。用户已明确授权从 DSH 开发执行器切换到 Codex：先理解项目和已有结果，再检查、修复已有问题并实际验证；完成后停止，等待下一步指令。不要只交阅读总结或待确认方案；已授权范围内直接完成检查、修复、测试和提交推送。

用户随后确认，先前“API 无效”仅因旧 API 额度用完，明确不需要处理。因此本轮不排查该 API、不索取或轮换密钥、不改模型提供方/路由/计费配置，也不把旧额度恢复列为接管前置条件。FND-002 自己的 HTTP 接口、认证和本地 Host 测试仍按既定验收执行。

本次切换的是开发执行器。产品继续基于固定 DeepSeek Harness Host、profile、插件和现有客户端运行，不移除这些集成，不为改用 Codex 另建应用或更换架构。Codex 的开发模型身份也不代表产品 GPT 主 Agent 已经实现或可用。

本文件 v3.0.0 是当前唯一可执行入口；旧 DSH_START.md 已从本分支工作树移除，只能在 Git 历史追溯。最新用户授权覆盖旧“DSH 专属执行 / Codex locked”规则；历史报告保留当时事实，不能反过来阻止本次接管。结束旧 revision 的派生任务，新任务统一标 FND-002 / v3.0.0。

## 1. 当前基线与实际范围

| 项目 | 本轮依据 |
|---|---|
| 仓库 | `https://github.com/Changxin-YR/personal_konwledge-base.git` |
| 工作分支 | `codex/knowledgeos-takeover`；从已推送的 FND-002 成果接续 |
| 接管前基线 | `10c406713a64299d7c7a52695672bbadbe2c21cb`；接管文档提交为其后代，开工时记录实际 HEAD |
| 产品候选 / 提交复核 | `1b99e392593ef0213f68f8dfb45f5d34a06eac1b` / `cba39e4808fd41e6d7b076c3fbf080577c8b1114` |
| 原九项证据 | `docs/evidence/FND-002/runs/1b99e39/`；保留当时候选及实际结果 |
| 已知问题依据 | `docs/evidence/FND-002/SUBMISSION_REVIEW_20261116.md` |
| 已复现反例 | `docs/evidence/FND-002/reviews/cba39e4/root-prefix-result.json`，FAIL |
| 固定 DSH 上游 | `39163dd30f703a79079e2d2446545cff3c453738`，根包 `0.2.2-rc.3` |
| 工具链 | Node >=24.9.0 API 基线；构建 pnpm 11.28.5；记录实际环境版本 |
| FND-001 | 已验收 passed；保留真实面板、只读 status、生命周期及历史证据 |
| FND-002 | 主体已实现；当前 in_progress，R1/R2 OPEN，新候选复测 NOT_RUN |
| FND-003 及以后 | 未激活；目录不是开工授权 |

KnowledgeOS 的产品目标是个人知识、工程训练与小组协作，Windows 桌面优先，六个工作区、44 项需求和 66 项完整验收均已有文档；当前只完成了其中的基础切片。已有两部分不能宣称整个产品、M0、正式业务持久化、多用户权限或产品 AI 已完成。

已有 FND-002 包含可信 dataDir、独立 SQLite 两表、已认证 Host 创建/读取、幂等、事务/迁移保护、重启读取与连接释放。旧候选九项测试有 109 条断言及独立运行记录，复核核对了 11 个关键文件指纹；新反例证明数据库归属判断仍有缺陷。因此保留已有成果，先关闭实际问题，不重写整个基础层。

## 2. 项目理解、环境核对与接管记录

### 2.1 先读这些依据，再动代码

按用途分批阅读，形成正确的现状判断；不把整个未来目录转成待执行队列：

1. 执行边界：`AGENTS.md`、本文件、`config/execution_state.json`、`config/work_units.json` 当前 FND-002、`docs/status/PROGRESS.md` 与 `BLOCKERS.md`。
2. 产品和架构：完整浏览 `docs/plan/01_REQUIREMENTS_BASELINE.md` 的范围与不变量、`03_ARCHITECTURE.md`；重点读 F01/F42、`04_DATA_AND_STATE_CONTRACTS.md`、`05_API_AND_AI_CONTRACTS.md` 的当前切片、`11_AGENT_AND_PROMPT_PROTOCOL.md`。`07_ACCEPTANCE_MATRIX.md` 的完整场景与本轮子检查分开。
3. 已交付证据：FND-001 的 `ACCEPTANCE_REVIEW_20261116.md`；FND-002 的 `SUBMISSION_REVIEW_20261116.md`、`REPORT.md`、`candidate.md`、`architecture.md`、`test-plan.md`、`independent-verification.md` 和必要原始结果。
4. 真实实现与测试：`packages/knowledgeos-panel/package.json`、锁文件、构建脚本、`src/host/{index,http,records,storage,config,test-support}.ts`、实际客户端入口和 `lib/`；`scripts/fnd002/{harness,run-all,scope-check,http-smoke,hold-lock}.mjs`；按影响读取 `scripts/fnd001/`。先用目录清单核实实际路径，不假设源码等于已加载产物。
5. 上游：`config/upstream.lock.json`、`docs/plan/02_DSH_CAPABILITY_AUDIT.md`；在固定检出中读上游 AGENTS、开发规范及当前使用的 Host、WebServer、插件/profile 接口源码。没有证据时不要套用最新版本 API。

现有分层为表现/HTTP → 应用用例/领域规则，SQLite 和 DSH 通过适配器接入；Host index 负责组合与生命周期，http 负责传输校验和错误映射，records 负责用例与端口，storage 负责数据库和迁移，config 负责可信配置。内层不直接依赖 React、DSH 服务实例或数据库驱动。只按当前真实职责修复，不创建未来模块空壳、不拆微服务、不改框架。

在 `docs/evidence/FND-002/codex-takeover.md` 写简明接管记录：实际 HEAD/分支、已实现能力与源码位置、未来未实现范围、当前调用链、R1/R2 复现依据、额外问题清单、环境与测试入口、修复顺序。随后继续执行；不等待用户再确认这份阅读总结。文件是事实记录，不是第二份启动提示词。

### 2.2 工作树与运行隔离

核对 origin、分支、远端提交和工作树，正常 fetch 后检查差异。存在无关用户修改时保留，必要时使用隔离 worktree；不 reset --hard、不自动 stash/删除用户文件、不 force push。应在 `codex/knowledgeos-takeover` 及其合法后继提交工作；旧 dsh 分支和 main 保留历史。

核对 active_unit、revision、executor、上游 SHA 与本文件实际 SHA-256，运行 `node scripts/verify-plan.mjs`、`node scripts/prepare-upstream.mjs --check`、`node scripts/fnd002/scope-check.mjs`。检查不通过时根据具体差异修复真实一致性问题；不得只改 hash、降低断言或改状态掩盖未授权内容。`--check` 的 NOT_PREPARED 表示尚未检出上游，不是产品测试结果；需要时按已提供脚本准备固定版本。

优先复用核验过的固定上游构建和隔离依赖，不无故重建整个上游、升级版本或更改全局 DSH。当前 in_progress 从已有成果恢复；真实 blocked 只处理当前阻塞；如果这份指令已执行并变为 passed / awaiting_user，只核对交接后等待，不重新开发。

沿用专用 DSH_HOME `.cache/dsh-home-fnd002`、profile `knowledgeos-storage-test` 和本机端口 3100；占用时核实归属，必要时选择空闲端口并记录。每轮用新的 run_id 与合成数据目录；同一持久化重启测试必须保持同一目录。操作进程前核实 PID、命令、profile、端口，仅停止自己的测试实例。

历史证据有 Windows/PowerShell 路径。优先复用现有脚本；若当前 Codex 环境不同，仅对必要运行/测试入口作保持断言的最小兼容适配并记录，不能把平台受限写成 PASS。PowerShell 使用专用变量，不给 $HOME/$home 赋值。启动路径从实际仓库解析；不提交数据库、WAL/SHM/journal、凭据、私人路径或正文，不覆盖旧 runs 与失败证据。

## 3. 先关闭已确认问题，再处理当前基础内的新发现

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

### 3.3 接管检查发现的其他问题

在理解源码、复现和复测时检查已实现的 FND-001/FND-002 链路及配套运行说明。发现实际缺陷后先记录复现、预期、实际、影响和依据，再一次修复一项；现有行为错误、当前修复导致的回归及阻止真实验证的测试问题都在本轮范围内。新增缺陷使用明确 ID，纳入当前报告、候选和相应回归；未证实推测标为待核实，不凭感觉重构。

可以修复上述已有链路中的必要问题，不限于只改 R1/R2 两行代码；但“未来尚未实现的功能”不算本轮缺陷。涉及新功能、新业务规则、公开远程服务、正式账号/权限、资料解析、RAG、模型、jobs/outbox、安装包或上游整体升级的建议只记录，不执行。涉及已确认产品行为的实质变更，给出具体冲突和最小选项，其余已授权修复继续做。

## 4. 分工与逐项修复顺序

所有角色围绕 FND-002 / v3.0.0，使用当前 Codex 环境实证可用的协作工具，最多四个活跃角色，只有一个生产代码写者。主管先确认工具与并发能力：架构角色只读检查契约/依赖与修复边界；独立测试者在实现前从需求写预期和反例；实现者逐项修复产品与获准脚本；主管整合候选、证据与状态。测试文件分配独占写入范围，验收期间冻结所有被测代码和测试。

不要求另启 DSH 模型会话或恢复旧 API 额度。若当前 Codex 没有独立子代理工具，可以顺序完成实际可做工作并记录独立复核缺口；不虚构代理调用、测试或签字。完整门槛要求的独立复核缺失时，不宣称本单元通过。

执行顺序：项目理解与基线核对 → 独立建立 R1 失败回归 → 最小修复 R1 → 立即跑真实 SQLite 反例与正常库对照 → 修复 R2 并验证证据比较器的拒绝能力 → 逐项处理已有基础内确认的新缺陷 → 构建/类型/范围检查并冻结候选 → 真实 Host 的 T01–T09 与独立复核 → 按失败定点修复并重测 → 提交与等待指令。

数据库打开/归属路径影响本单元全部初始化场景，主验收脚本也需变化，所以新候选必须复跑 T01–T09，并补 R1 反例与 R2 负例。复用已有测试基础设施；第一部分只跑受影响回归，不无依据重跑全上游或完整 5/10/60 秒生命周期矩阵。额外修改影响哪条已实现行为，就补哪项真实验证。

允许修改现有插件中与确认缺陷直接有关的源码、必要构建产物、本轮可复用测试/运行脚本、测试计划、脱敏证据及状态文档；保留分层模块化单体、应用端口、真实 handler、可信 dataDir、认证/来源保护和旧面板。公共配置/依赖/迁移由唯一写者串行处理；当前修复不需要新增业务表或改变历史 v1 迁移。已授权修复、测试、正常提交和工作分支推送持续完成，无需逐步请求确认。

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

## 8. 收口、交付与强制停止

只有 R1/R2 和本轮新确认的阻碍交付缺陷全部关闭，新候选 T01–T09 实际通过，前缀反例与正常库对照通过，真实加载指纹比较及不一致负例有效，独立复核完成，才将 FND-002 改为 passed、test_result_status=PASS、retest_status=PASS。补实际完成时间/evidence_paths，清空 open_review_items，将 R1/R2 和新缺陷写入 closed_review_items 并链接各自关闭证据；execution_state 改为 awaiting_user，active_unit 仍是 FND-002。

同步 README、PROGRESS、BLOCKERS、REPORT、candidate、当前独立结论及接管记录。原 SUBMISSION_REVIEW 和 FAIL 原始结果保留历史事实，可追加新候选关闭依据，不改成旧候选曾通过新用例。当前文档不能同时声称 OPEN/未复测与全部 PASS。

真实外部限制阻止必测时记 BLOCKED/NOT_RUN，写清失败动作、环境、候选、影响测试、已尝试方案和最小解除条件；完成当前范围内其余独立工作后交接。待修代码缺陷保持 in_progress，不伪装成环境阻塞。用户已排除的旧 API 额度不登记为本轮 blocker。

最终运行 `node scripts/verify-plan.mjs`、本轮范围检查及本次变更所需的检查，正常提交并推送 `codex/knowledgeos-takeover`，回读远端确认提交；仅提交本次负责的文件。不能 force push、自动合并 main、覆盖历史分支或新增备用 START/PROMPT。

最终用中文交付：

1. 项目理解：已有能力、架构与未实现范围，各给具体路径。
2. 问题闭环：R1/R2 和新发现的证据、根因、修改、复测结果；区分未证实推测。
3. 验证：候选/实际加载指纹、T01–T09、额外回归、独立复核、环境与复验命令；失败、未运行和限制分别说明。
4. Git：实际分支、提交、推送结果和关键文件；任何推送阻塞如实记录。
5. 停止状态：通过则 awaiting_user，真实受阻则如实保留；可以说明下一单元建议，但不执行。

到此停止。auto_advance=false，FND-003 及以后保持未激活；完整产品审查仍是 not_started。本轮接管修复完成不等于所有基础功能完成，也不授权继续开发。等待用户下一条明确任务后才替换唯一入口并调整活动单元。
