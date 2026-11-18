# FND-005 最终独立复核报告

2026-11-18，Asia/Shanghai。候选 **FND-005-d0ec209b8161e14e**。复核依据为独立测试契约、CODEX_START 3.3.0 的 T01–T09 和用户冻结指令。独立角色已经亲自运行全部约定套件及追加检查；本报告不是实施者自测结果的转述。

**可通过的技术范围：PASS；FND-005 总体验收：BLOCKED。** 新候选共 82 个具名检查组全部 PASS，9 个运行套件退出码均为 0，未发现本次执行范围内的新产品缺陷。真实 GPT 调用 **0 次**；T01/T02 及 T08 的真实模型闭环仍 BLOCKED，不能设置单元 passed/awaiting_user，不能将受控模型或当前开发助手当作应用提供方。没有修改产品、冻结测试脚本、状态表、Git 分支或 main，也没有提交/推送。

## 1. 冻结身份与执行环境

- HEAD/base：`4282b9231a4ac38b0eb87145c337b811aec033e4`；分支 `codex/knowledgeos-fnd-005`，FND005 修改仍在工作树。远端 HEAD 未在独立角色核验，未进行网络 Git 操作。
- 冻结时间 `2026-11-18T09:08:19.115Z`。清单副本 `candidate-original.json`，SHA-256 `573d3c3941ee11f97fb2e3d5439816eb993a0fdf52055300bac7734ccde270c6`。
- `candidate-before.json`、`candidate-after.json`：50 项 candidate_files + 13 项 runtime_files 共 **63 项**在运行前后全部一致；重算候选 ID 一致。每个命令还独立检查运行前后文件哈希，均没有漂移。
- 固定上游 HEAD `39163dd30f703a79079e2d2446545cff3c453738`，已跟踪源码无本地修改；运行目录 **14,524 份源码逐哈希一致，0 缺失、0 差异**。不以目录名或注入的客户端 commit 标签代替来源证据。
- 实际 profile 中加载插件的 `lib/index.js` SHA-256 为 `5c48af614b4d53a06a15e3abdb5126494677e731341137d5b9c7b9d11b4c16cc`；直接服务检查加载 `test-support.js` SHA-256 为 `7848b7abf7062c7299cb0c9cd190c34c1599cfbcdae14dd55651e8d452cea071`。
- Node `v24.22.0`，Windows；独立合成账号、Host home、profile、SQLite 数据目录和浏览器 Cookie 上下文。主集成端口 3141，追加 HTTP 3142，ACL 3143，追加 UI 3144，原配置/UI/屏障使用已释放的 3133/3134/3135。
- 运行套件及静态命令时间约为 **09:14:23–09:17:42 UTC（北京时间 17:14:23–17:17:42）**，精确时间/脚本 SHA/退出码见 `command-*.json`。原始 stdout/stderr 仅保存字节数和哈希；原始 Host 日志、Cookie、凭据、数据库不进入证据目录。

## 2. 亲自执行的命令与结果

以下均从仓库根执行，`E` 仅为本表的路径缩写 `docs/evidence/FND-005/independent`，实际命令没有该变量。`run-suite.mjs` 启动相同 Node 命令并记录候选/脚本哈希、时间、退出码；`checks` 是具名检查组数，不是将每个内部 assert 另计一次。

| 实际 Node 参数 | 退出码 | 检查组 | 证据类别与结果 |
|---|---:|---:|---|
| `scripts/fnd005/run-all.mjs --port 3141 --out E/integration` | 0 | 14 | PASS；受控模型，真实 DSH 原生执行、业务登录、HTTP、SQLite |
| `scripts/fnd005/storage-checks.mjs E/storage` | 0 | 6 | PASS；真实 SQLite，故障注入/生命周期设置为夹具 |
| `scripts/fnd005/barrier-checks.mjs E/barriers` | 0 | 5 | PASS；真实 native pre/post 策略及 HTTP/SQLite，模型与排序屏障受控 |
| `scripts/fnd005/browser-checks.mjs E/ui` | 0 | 8 | PASS；真实 Chrome、页面、HTTP、SQLite，模型为夹具 |
| `scripts/fnd005/configuration-checks.mjs E/configuration` | 0 | 21 | PASS；6 个 HTTP 配置场景、13 个直接分类断言、2 个实际 pi-ai 适配器零网络场景 |
| `scripts/fnd005/acl-regression.mjs --port 3143 --out E/acl --candidate FND-005-d0ec209b8161e14e` | 0 | 7 | PASS；真实 HTTP/SQLite 的 FND004 受影响回归，累计 schema v5 |
| `E/additional-checks.mjs` | 0 | 11 | PASS；独立设计的真实 HTTP/native/SQLite 检查，模型/屏障/生命周期设置明确受控 |
| `E/ui-additional.mjs` | 0 | 4 | PASS；独立真实浏览器竞态、实际业务 HTTP 与 SQL，传输延迟受控 |
| `E/service-additional.mjs` | 0 | 6 | PASS；直接服务端口及终态 stream 错误夹具，**不声称真实 native/HTTP/提供方执行** |

合计 **82 PASS、0 FAIL**。每组实际事实见相应 `summary.json`；总表 `summary.json` 将其与候选、命令、时间和证据类别关联。

附加静态检查均退出 0：`node .cache/panel-builder/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json`（noEmit）、`node scripts/verify-plan.mjs`、`node scripts/test-verify-plan.mjs`。计划门禁的合成“完成”夹具只存在临时副本，不代表真实项目完成。

固定上游 artifacts 8 gates/check 2 gates 是主线程实际构建记录（`../build-and-gates.json`），本角色只读核对其来源并独立比对固定源码/运行文件，没有重跑会改写冻结 artifacts 的上游构建；不能将该部分标成独立执行的构建。产品 noEmit 类型检查和实际 Host 加载/重启则由本角色运行。

## 3. R1–R5 和旧 U02 的修复复核

| 问题 | 本候选独立实际结果 | 判定 |
|---|---|---|
| R1：body 后、发布前授权/会话变化 | native post 等待中撤 read 后 404、logout 后 401，均无标题/正文；I08 在更新已经提交后撤 read，结果抑制、receipt 保留、撤权重放拒绝，重新授权后精确重放 | PASS |
| R2：执行阶段取消 | native pre 等待时取消 → 409 CANCELLED、无写入；SQL 已提交后取消 → 409 OPERATION_ALREADY_COMPLETED，执行成功与唯一 receipt 保留 | PASS |
| R3：原生错误分类 | 真实 native ABORTED_BEFORE_DISPATCH → 409 CANCELLED；补充端口夹具验证 ABORTED、ABORTED_BEFORE_DISPATCH 和 TOOL_TIMEOUT 分别映射到取消/504 工具超时 | PASS，按两种类别分别留证 |
| R4：凭据/结构化 AUTH 优先 | 直接分类与终态 stream 夹具均证明 NO_CREDENTIAL_STORE → CREDENTIALS_MISSING；含 quota/billing 文本的结构化 AUTH 仍按 401/403 分类 | PASS |
| R5：取消及账号切换后迟到响应 | 原浏览器套件延迟真实 prepare 响应，取消后不恢复可执行状态；U01 延迟实际 GET，再用真实登录接口将同一上下文切为 Bob，旧 Alice 内容被抑制、旧展示清空 | PASS |
| 旧 U02：目标切换后迟到 GET 覆盖新对象/版本 | 延迟 A 的真实 GET，选择 B(revision 2)后释放 A；MutationObserver 和最终状态均确认未显示 A，B ID/revision 不被覆盖、旧展示为空。随后显式读取 B，其 ID/title/body/revision/created_at/updated_at 与独立只读 SQL 一致 | PASS，旧失败保留 |

U02 没有要求自动读取 B，也没有等待旧 A 响应显示“重新读取完成”。检查既验证旧响应不得覆盖，又验证用户显式读取 B 后 SQL 一致。两张截图 `ui-additional/target-switch-old-read-suppressed.png`、`target-b-explicit-reread-sql.png` 已独立查看确认。U03 逐个改变 target/revision/key/instruction 均使 prepared 失效、清空旧展示；U04 在 prepare 响应等待期间改草稿，迟到响应不能恢复旧操作，新草稿保持。

R3 的 TOOL_TIMEOUT 证据只证明分类，不冒充实际 native 超时策略或工具体 deadline 测试。当前两个业务工具没有声明 timeoutMs；真实 SQLite busy 超时有另外的存储执行证据。真实提供方 TIMEOUT/ABORT、配额及其厂商终态归一化没有实测。

## 4. 独立新增 HTTP/SQLite 断言

- **I01/I02 身份与幂等隔离。** 两个真实用户同时执行同名原生 call ID `fixture-call` 和同一个幂等键，各自只修改自己的对象，各有一个 actor-scoped receipt；另一用户不能执行外来 prepared ID。单用户同键不同 patch 并发只有一方 200，另一方 409 IDEMPOTENCY_CONFLICT、只递增一次；仅改变 expected_revision 也冲突。
- **I03 edit-only 不能偷读。** action(edit) 为 200 而 GET 为 404；带完整对象返回的 AI 更新仍拒绝，无 mutation/receipt、没有标题/正文输出。
- **I04/I05 真实时间到期。** 先证明 read/edit 或项目创建者权限有效，再停在 native pre；实际墙钟跨过 grant 或 membership 到期后读写均 404，revision/receipt 不变。恢复 membership 的正控可重新读取，既有 action grants 不能绕过到期。
- **I06 真实锁等待后的撤权。** 独立 SQLite worker 占据写锁，在事务内撤销 read 后提交释放；真实 HTTP 更新在原生 pre 后等待数据库锁，再以新授权状态拒绝，revision 1、receipt 0。排序记录见 summary，SQL 生命周期设置是隔离夹具，没有公开 SQL 入口。
- **I07 提交后丢响应。** 在 native post 屏障用独立 SQL 证明 revision 2/receipt 已提交，再主动销毁 HTTP 连接。另一次普通业务 HTTP 编辑将对象推进 revision 3；原键重放精确返回原 revision 2 的完整业务对象，数据库仍是 revision 3、receipt 1。
- **I08 提交后的撤权与恢复。** 写已提交后撤 read，发布/撤权期间重放均抑制；真实 regrant 后原键可精确恢复原结果，不增加写入。
- **I09/I10 实时身份。** HTTP 已入场后、native body 前将合成账号 disabled，更新 401 且无写入；read body 已完成后让实际会话跨过 expires_at，发布 401，不输出内容。
- **I11 边界拒绝。** 13 类伪造身份/SQL/path/command 额外字段、5 类非法 revision、空键、匿名请求和外源 Origin 均在模型尝试前拒绝；attempts 增量 0。外源 Origin 由外层固定 Host 返回安全 403，不强求业务 JSON 错误码。

以上从真实业务 Cookie 出发，经本候选 HTTP、服务、AsyncLocalStorage 可信绑定和原生 ctx.tools 执行到 SQLite；模型选工具由受控 adapter 完成。固定 ctx.tools API 本身没有业务 actor 字段：本实现通过服务端局部绑定读取 actor、重查 originating session/服务/用户及 call ID/name/digest，不接受模型身份或模拟 DSH owner。真实无绑定 native dispatch 拒绝，跨用户同 call ID 并行隔离已实测。证据不扩展为进程外队列、PTC 或恢复 Agent 的身份传播保证。

## 5. pi-ai 空目录修复的实际 API 验证

`configuration/summary.json` 两个独立运行结果：

| 固定 pi-ai 适配器场景 | 预期/实际 HTTP 和 code | 本地陷阱收到的模型网络请求 |
|---|---|---:|
| 已配置合成模型，但随机生成的凭据环境引用不存在，listModels 隐藏目录 | 503 CREDENTIALS_MISSING | 0 |
| 相同无凭据配置，指定未配置模型 | 404 MODEL_NOT_FOUND | 0 |

使用真实固定 pi-ai 模块和真实业务 HTTP；baseURL 指向隔离本地 trap，凭据引用刻意不存在，不读取私人 provider profile 或真实密钥。它证明空目录不再吞掉上游精确凭据/模型错误；不证明 GPT 可用或真实厂商调用成功。与其他受控错误分类记录分开，不能把该 0 网络测试写成真实 GPT。

## 6. T01–T09 的接受范围

| 用户验收项 | 本轮独立判定 | 证据与限制 |
|---|---|---|
| T01 真实 GPT 只读 | BLOCKED | 夹具下 HTTP/native/SQL/UI 读成功；真实 GPT 选择工具未运行 |
| T02 真实 GPT 写入 | BLOCKED | 夹具下写入、回读、SQLite/receipt、重放成功；没有真实 GPT 写调用 |
| T03 私人对象/身份伪造拒绝 | PASS | 真实认证与 HTTP/native/SQL；模型受控；无绑定、跨用户、额外身份字段、owner 分离 |
| T04 延迟期间重新判权 | PASS | 撤权、grant 自然到期、创建者 membership 到期、锁等待、新身份状态、发布前 read/会话检查 |
| T05 幂等 | PASS | 顺序、并发、不同 actor 命名空间、同键不同参数/target/revision、重启、提交后丢响应、后续编辑后精确原结果；当前权限仍先检查 |
| T06 stale revision | PASS | 新键旧版本 409，不覆盖、不留成功 receipt；UI 保留失败草稿 |
| T07 错误/取消 | PASS，技术范围 | 真实配置/原生取消/HTTP 错误路径及受控分类，含真实固定 pi-ai 零网络两项；真实厂商归一化未运行 |
| T08 真实模型 UI 闭环 | BLOCKED | 浏览器/UI 及 U01–U04 技术检查通过；缺真实 GPT 关联链 |
| T09 固定 Host/受影响回归 | PASS，所列技术范围 | 加载/停止/重启、持久化原结果、FND001 状态及记录往返、FND002 迁移/回滚/busy/不兼容保护、FND003 身份隔离、FND004 7 项；上游构建使用实施者记录并独立核对来源 |

`final-audit.json` 还证明 v1–v4 SQL 与已接受前置提交逐字节相同，checksum 与实际运行 ledger 一致。v4→v5、v5 故障回滚/恢复及伪造 schema 不改写均有真实 SQLite 证据。旧 FND002 v1-only checker FAIL 保留；Connection-only stop/recovery 历史 BLOCKED 未被 Host restart 的成功解除。完整 F01–F44、66 场景、A01/A41 的完整要求以及 Windows 打包/发布没有因本轮而通过。

真实提供方 token/cost/用量未知；不能把零提供方调用写成经验证的真实调用成本。没有自动选择其他提供方、借用开发助手身份或要求付费失败来完成负例。

## 7. 旧失败与漂移：保留而不混淆

旧候选全部证据在 `round1/`，没有覆盖 U02 原失败或截图。

1. 更早一次独立 additional 在 08:56:31 UTC 启动，辅助函数假定 204 有 JSON 而读取 `.code`，仅 I01/I02 完成；它是探针错误，原始记录 `round1/additional/attempt-1-summary.json`、`command-additional-attempt-1.json` 保留。
2. **用户强调的首次完整 additional** 命令 `08:57:43.964–08:58:15.333 UTC`，退出 **1**，见 `round1/command-additional-attempt-2.json`。I01–I10 十项 PASS；I11 已实际得到外层 403，却过严要求业务 CSRF_REJECTED JSON code，故失败。该失败不是越权成功，也不是产品错误；当时原始检查事实保存在 `round1/additional/attempt-2-summary.json`。本轮仅修正外层/业务层的预期边界，仍要求安全 403、无数据和零模型尝试，I11 已通过。
3. 之后 09:02:01.830 UTC 的旧候选启动碰到主线程已重建的 lib 哈希，零业务检查执行，产生 setup/hash 失败；当时顶层 additional/summary 曾被该次写入。该记录现保留为 `round1/additional/summary.json`、`command-additional.json`，并有 `candidate-interrupted.json`；它是预期候选漂移，不能算产品新缺陷。旧服务追加检查也因哈希保护显式 NOT_RUN。
4. **U02 是独立的真实产品 FAIL**，见 `round1/ui-additional/summary.json` 与 `target-switch-delayed-read.png`：选择 B 后显示 A/旧 revision。它不能与上述探针错误相抵，也不能删除。新候选的 U02 已严格复测通过，形成明确的失败→修复→复测记录。
5. pi-ai 空目录误分类由主线程发现，独立读取固定 API 确认；本角色没有在旧候选完成其 HTTP 实测。新候选的两个实际 pi-ai 检查已亲自执行，旧证据不被回填为 PASS。

## 8. 收尾与结论

所有独立 Host 已停止，3133/3134/3135/3141/3142/3143/3144 端口均连接拒绝；没有残留 listener。证据目录未发现数据库、原始日志或凭据形状 JSON 字段，截图均为合成数据；已核对旧失败文件哈希。结果、命令与候选归属在 `summary.json`，文件索引在 `evidence-index.json`。

本角色本轮只新增独立证据、探针和报告，以及约定命令必需的隔离 cache 运行数据。**82 个具名检查组所覆盖的技术实现可接受；真实 GPT 为 0 次，总体验收仍 BLOCKED。** 不修改 passed、不推进单元；最终门禁、证据汇总、提交推送由主线程负责。
