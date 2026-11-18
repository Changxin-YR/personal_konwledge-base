# FND-005 独立验收第一轮（旧候选，非最终结论）

日期：2026-11-18，Asia/Shanghai。候选：`FND-005-572a5b58a7b46671`。独立角色只写本证据目录，没有修改产品、冻结测试、配置、分支或状态表，没有调用真实模型提供方、读取凭据或发送跨线程消息。

本轮不能通过验收：新增浏览器断言 U02 为真实产品 **FAIL**；真实 GPT 的 T01/T02/T08 仍 **BLOCKED**。实现者已宣布重新修复并冻结，因此本报告保留旧候选事实，所有最终验收结论 **NOT_RUN**，等待新 manifest 后完整重跑。不得将本轮夹具成功或后续哈希漂移记成整个单元 PASS。

## 候选绑定与实际执行

`candidate-before.json`：首次运行前 50 个 candidate_files、13 个 runtime_files 共 63 项哈希全部一致；候选 ID 可重算一致；HEAD 为 `4282b9231a4ac38b0eb87145c337b811aec033e4`，分支 `codex/knowledgeos-fnd-005`。固定上游 HEAD 为 `39163dd30f703a79079e2d2446545cff3c453738`，其已跟踪文件没有修改；运行目录 14,524 份源码与上游逐哈希相同，零缺失、零差异。清单自身 SHA-256 为 `c014558f5532523afc469f7a5e0fb7059fa1bff6b6693b00a8b48a76cff808b3`。

集成和追加 HTTP 探针核对了实际 profile 下加载的插件 `lib/index.js`，SHA-256 为 `70a41b8d867667f0ecaa456eac165fde2950c747c4e00f722a07445396b4c093`。不以目录名或客户端 commit 标签代替加载文件证据。浏览器附加探针启动于 08:58:58 UTC，U02 观察于 08:59:15 UTC；这是重新构建前启动的旧 Host。其截图与源文件的目标切换逻辑相互印证。

各命令和进程退出码见 `command-*.json`；开始/结束时间使用 UTC（北京时间加八小时）。Host home、数据库、合成账户均独立；使用 3141、3142、3143、3144，以及用户已释放的 3133/3134/3135。各 Host 最终已停止；追加 HTTP 探针还检查了 3142 端口释放。瞬态数据和原始 Host 日志保留在隔离 cache，不进入本证据目录；这里没有 Cookie、token、真实密码、提供方凭据或数据库原件。

| 独立运行 | 命令主体 / 输出目录 | 退出码 | 实际结果与类别 |
|---|---|---:|---|
| 集成 | `scripts/fnd005/run-all.mjs --port 3141 --out .../integration` | 0 | 14 PASS；受控模型，真实 DSH 原生工具、HTTP、登录与 SQLite |
| 存储 | `scripts/fnd005/storage-checks.mjs .../storage` | 0 | 6 PASS；真实 SQLite，受控故障/到期设置 |
| 原生屏障 | `scripts/fnd005/barrier-checks.mjs .../barriers` | 0 | 5 PASS；真实原生前/后策略等待，受控模型/排序，真实 HTTP/SQLite |
| 浏览器 | `scripts/fnd005/browser-checks.mjs .../ui` | 0 | 7 PASS；真实 Chrome/UI/HTTP/SQLite，模型为夹具 |
| 配置与分类 | `scripts/fnd005/configuration-checks.mjs .../configuration` | 0 | 6 个真实 HTTP 配置场景 + 13 个直接分类断言 PASS；不是提供方错误实测 |
| ACL 回归 | `scripts/fnd005/acl-regression.mjs --port 3143 --out .../acl --candidate FND-005-572a5b58a7b46671` | 0 | 7 PASS；FND004 受影响场景，累计 schema v5 |
| 类型检查 | `node .cache/panel-builder/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json` | 0 | STATIC；noEmit，不重建冻结包 |
| 计划检查 | `scripts/verify-plan.mjs`、`scripts/test-verify-plan.mjs` | 0、0 | STATIC；不等价于产品验收 |
| 自定义 HTTP/SQLite | `additional-checks.mjs`；第二次有效运行见 `additional/attempt-2-summary.json` | 1 | I01–I10 共 10 PASS；I11 是独立探针过度限定外层 403 错误码，不是产品缺陷 |
| 自定义浏览器 | `ui-additional.mjs` | 1 | U01 PASS，U02 产品 FAIL，见下文 |
| 服务分类补充 | `service-additional.mjs` | 0 | **NOT_RUN**：加载包已被主线程重新构建，哈希保护阻止把新包当旧候选；零分类断言执行 |

表中 `...` 代表命令记录里完整的、仓库相对的独立证据输出路径。整个固定上游 artifacts 8 gates/check 2 gates 是实施者执行的 `../build-and-gates.json` 记录，本角色没有重新执行会改写冻结包的构建，只独立验证源码/运行文件对应及产品类型检查。真实 GPT 仅有实施者脱敏阻塞记录与用户说明，本角色没有探测真实凭据或发请求。

## 新增产品缺陷：U02 / P2，目标切换后的迟到读取覆盖

位置：`packages/knowledgeos-panel/src/host/ai-page.ts:9`，生成页面中的 `read()` 与 `objects.onchange`。`read()` 捕获旧 target 和 generation；选择新对象只改 target、清除 prepared，没有使旧读取失效。旧响应返回后，账号仍相同，`accept(gen)` 通过，遂把旧对象及旧 revision 写入当前新目标的页面。

可执行复现：在旧候选、端口 3144 空闲时，从仓库根运行 `node docs/evidence/FND-005/independent/ui-additional.mjs`。脚本用实际业务 HTTP 创建同一用户的 A(revision 1)、B(revision 2)，真实浏览器登录，拦住并延迟 A 的真实 GET 响应，切换下拉选择到 B，再释放 A 响应。归档后的脚本路径随目录变化，复跑时需恢复当时路径或按新轮次适配导入；原执行命令与原脚本均已保留。

观察：下拉项和 target 为 B `4d300fdb-aa4f-40fd-b2cb-5d250e1d197e`，正文区域却显示 A `bc9e6ad4-e196-434a-b169-6aa65d4cbde5`，revision 输入为 1；独立 SQL 确认 B 的 revision 为 2。页面显示“重新读取完成 · revision 1”。截图 `ui-additional/target-switch-delayed-read.png` 已独立查看确认。该错配使用户看到的对象/版本与待操作目标不一致；本次没有越权或额外写入。要求目标/读取代次绑定并丢弃迟到响应，清除旧展示/准备结果，并在新候选实际复测。主线程已确认修复意图，尚未独立复测。

U01 同时证明：A 的真实 GET 被延迟，使用同一浏览器上下文的真实登录接口将 Cookie 切换为 B 后，账号回读保护会重新加载身份，抑制 A 内容并清空对象/结果列表，断言 PASS。不能用 U02 的失败否定这一已实测保护，也不能用 U01 的成功掩盖 U02。

## R1–R5 与新增业务断言的边界

- R1：原生 post 屏障后撤 read 权限返回 404；logout 后返回 401；均没有标题/正文。I08 进一步验证：真实更新已提交、post 等待时 read 被撤销，输出受抑制，既有 receipt 保留，撤权时 replay 拒绝，重新授权后 replay 精确恢复原结果，revision/receipt 不增加。
- R2：native pre 等待中取消返回 CANCELLED、revision 1；提交后取消准确返回 OPERATION_ALREADY_COMPLETED，执行结果/唯一 receipt 仍在。I07 额外故意在 SQL 已证明提交、HTTP 尚未发布时销毁客户端连接；另一 HTTP 编辑将对象推进到 revision 3 后，原键重放仍精确返回原 revision 2，数据库维持 revision 3、receipt 1。
- R3：真实原生 ABORTED_BEFORE_DISPATCH → 409 CANCELLED 已 PASS。ABORTED / TOOL_TIMEOUT 的更多分支原计划由服务端口夹具补充，但执行前已发生包漂移，故本轮仍 NOT_RUN。不能把该直接夹具写成实际原生工具超时/真实提供方超时。
- R4：NO_CREDENTIAL_STORE 与带有误导性 quota/billing 文本的结构化 AUTH 状态三项直接分类断言 PASS；实际 pi-ai 的目录/凭据语义问题是另外一项，见下一段。
- R5：原浏览器套件实际延迟 prepare 响应，取消后释放，UI 保持已取消且不能执行；U01 补充真实账号变更期间的迟到 GET 保护 PASS。新 U02 是同账号下的目标切换正确性缺陷。
- I01/I02：同一个原生 call ID、同一幂等键并行用于不同真实用户时，各自仅修改自己的对象、各有一个 actor-scoped receipt；外来 prepared ID 拒绝。相同用户同键不同 patch 并发仅一方提交，另一方 409 IDEMPOTENCY_CONFLICT；仅改变 expected_revision 也冲突。
- I03–I06：edit-only 不能借更新回传全文；真实 grant 自然到期、项目对象创建者 membership 自然到期后，native pre 屏障释放均拒绝读写；保留 action grants 不绕过 membership。独立 SQLite worker 在占锁事务中撤权，再提交释放锁；HTTP 更新实际等待 209ms 后拒绝，revision 1、receipt 0。排序/故障设置均明确为夹具，HTTP/SQL 路径是真实的。
- I09/I10：合成账户 disabled 与实际会话自然到期都在原生等待后被重新检查，分别拒绝写入/发布保护内容。测试用 SQL 只改变隔离数据的生命周期状态，没有读取 token/密码/凭据列。

## 重新冻结与探针本身的记录

用户通知的 pi-ai 问题已通过固定源码只读确认：`packages/llm/llm-pi-ai/src/adapter.ts:350` 的 listModels 在 MISSING_CREDENTIAL 时返回空目录；旧 AiService 对空目录返回 MODEL_NOT_FOUND，会把真实缺凭据误分类。旧候选没有独立实际跑 pi-ai 缺凭据 HTTP，此项不能冒充运行 FAIL/PASS。修复/新增零网络用例待新候选验收。

`additional/attempt-1-summary.json` 保留独立辅助函数错误：204 无 JSON 时读取 `.code`，在产品检查外中止；已修正。`attempt-2-summary.json` 保留 10 项通过及 I11 过严错误码断言：实际外层 403 已拒绝，没有业务 JSON code。修正为检查安全 403 与零模型尝试，尚未在旧候选重跑完成。

之后 `additional/summary.json` 的零检查退出是主线程已重建导致加载哈希不同；它不是产品缺陷，也不是旧候选验收结果。`service-additional/summary.json` 同样显式 NOT_RUN。主线程已授权停止旧候选重跑并在新候选完整执行原套件及 additional/ui-additional/service-additional；本轮所有原记录保留，禁止覆盖失败。

历史 FND002 v1-only checker FAIL、Connection-only stop/recovery BLOCKED 保持其原义。本轮 Host stop/restart PASS 不能解除 Connection-only 阻塞；受影响回归也不等价于 F01–F44/66 场景或 Windows 发布验收。没有修改 `passed` 或推进后续单元。
