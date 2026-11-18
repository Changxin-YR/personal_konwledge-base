# FND-005 中文验收报告

日期：2026-11-18（Asia/Shanghai）；唯一提示词版本：3.3.0。

本单元完成受控业务工具实现、固定 DSH 运行验证和非真实模型部分测试；**整体状态 BLOCKED，未完全验收**。现有个人 DSH 路由为 `api / deepseek-v4.1-flash-1017/hs14`，没有已确认获授权可用的 GPT API。本轮真实 GPT 调用为 **0**，不把 OpenAI 兼容协议、受控模型夹具或开发助手自身作为真实 GPT 证据。

工作分支：`codex/knowledgeos-fnd-005`，基线：`4282b9231a4ac38b0eb87145c337b811aec033e4`。最终冻结候选：`FND-005-d0ec209b8161e14e`。实际插件包 SHA-256：`5c48af614b4d53a06a15e3abdb5126494677e731341137d5b9c7b9d11b4c16cc`。详细文件清单见 [candidate.json](candidate.json)；配置与提供方审计见 [provider-audit.json](provider-audit.json)。旧候选及失败记录保留，不能据旧候选通过推导最终候选通过。

## 已实现行为

业务用户在 `/knowledgeos/account` 真实登录，经 `/knowledgeos/ai` 提交自然语言指令。固定 `ctx.llm.stream` 只选择一个白名单业务工具并生成结构化参数；准备与执行分开，后者使用固定 DSH 原生 `ctx.tools.execute`。没有修改上游模型循环或另建 Agent 框架。

- `knowledgeos_read_object`：只读取当前登录用户有 read 权限的现有对象。
- `knowledgeos_update_object`：只修改当前有 edit 和 read 权限的对象，强制匹配 `expected_revision`，使用服务端绑定的操作幂等键。
- 模型不能提供执行身份、角色、所有者、SQL、文件路径或 Shell；额外字段直接拒绝。服务端业务 Cookie 与 AsyncLocalStorage 执行绑定提供身份，DSH owner 不代替业务登录。
- SQLite v5 仅新增本轮 `ai_tool_mutations`。取得写锁后重新取时间，原业务会话、ACL、成员资格、版本、修改及回执位于同一事务。精确重放保留原成功结果；变参复用键 409，旧版本 409。发布正文前再次重新判权。
- 输出 512 tokens、一次提供方尝试/请求、无自动替换或重试。默认每 Host 8 次、30 秒、0.10 USD；使用可信单价上界保守预留，未知价格拒绝调用。缺配置、缺凭据、坏凭据、额度、限流、提供方拒绝、模型不存在、超时及取消分别分类。
- 执行等待时取消可阻止尚未开始的写入；已提交操作明确提示已完成并保留回执。界面阻止取消后的迟到响应恢复执行入口。切换账号、目标或编辑草稿使旧准备动作失效，迟到读取不得覆盖新对象及其版本；新目标需显式重读。
- 固定 pi-ai 在缺凭据时隐藏模型目录。空目录交由固定适配器继续区分确切模型和凭据错误；真实 pi-ai 配合本地网络陷阱验证缺凭据为 503、模型不存在为 404，两者实际外部网络请求均为 0。

## 单项验收

| 测试 | 当前结果 | 证据性质与事实 |
|---|---|---|
| T01 GPT 只读及 UI | **BLOCKED** | 夹具经真实 DSH 原生执行器、业务登录和 Chrome 读取通过；真实 GPT 未调用 |
| T02 GPT 写入及重读 | **BLOCKED** | 夹具工具写入、revision 增加、HTTP/SQL/UI 一致通过；真实 GPT 未调用 |
| T03 私人对象隔离 | PASS（受控模型） | 真实 HTTP/SQLite 越权读写均 404；模型与请求伪造身份 422；无业务上下文的实际原生调用拒绝 |
| T04 撤权、到期、会话 | PASS（受控模型/策略） | prepare 后撤权、成员过期、注销拒绝；真实 SQLite 锁等待后使用新时间；工具完成后发布前撤权/注销仍不泄露正文 |
| T05 持久幂等 | PASS（真实 SQLite） | 相同参数、并发、后续其他修改及重启均回放原结果；变参或变对象同键 409；故障注入证明修改/回执原子回滚 |
| T06 旧版本 | PASS（真实 HTTP/SQLite/UI） | 409 REVISION_CONFLICT；原内容、版本、时间和成功回执不变，界面保留失败草稿 |
| T07 准确失败和取消 | PASS（真实 Host 配置/受控错误） | 21 项配置与错误场景，包括实际 pi-ai 的缺凭据/不存在模型；原生开始前及提交后取消、结构化终止错误准确；未对真实付费提供方制造额度或凭据故障 |
| T08 界面可观察性 | **BLOCKED（真实 GPT 部分）** | 真实 Chrome 八项基础检查及四项独立迟到响应/草稿测试通过；模型、状态、工具、结果、重读、冲突均有证据，真实 GPT UI 尚缺 |
| T09 构建和受影响回归 | PASS（固定 Host/真实 HTTP/SQLite） | 固定上游 8 个产物构建门、2 个聚合检查门；Host 加载/停止/新 PID 重启、持久回放、v4→v5、迁移故障、伪造结构拒绝；既有 ACL 七组回归通过 |

最终冻结候选由独立角色完整运行 **61 项基础技术检查**：`independent/integration`（14）、`storage`（6）、`configuration`（21）、`barriers`（5）、`ui`（8）、`acl`（7），全部通过。另运行 **21 项独立附加检查**：`additional`（11）、`service-additional`（6）、`ui-additional`（4），全部通过。每组 `summary.json` 与 `command-*.json` 记录类别、实际命令、候选绑定及退出码；总计 82 项技术检查不包含真实 GPT。

实现者旧一轮 58 项检查仍在 `runs/final-*` 和 `runs/acl-regression`，仅说明当时版本；随后 `runs/revised-integration`（14）、`runs/revised-ui`（8）实际加载最终包，`runs/configuration-r2`（21）使用目标切换 UI 修复前的中间包。它们的具体版本与时间见 [implementer-summary.json](implementer-summary.json)，不将这些旧运行重新标记为最终候选。另有独立重跑的 35 项计划门禁结构测试及插件类型检查；静态检查不计产品测试，也不代替真实模型。

固定运行时 `39163dd30f703a79079e2d2446545cff3c453738 / 0.2.2-rc.3` 的 14524 份运行源码与固定上游逐哈希相同，零差异；实际加载包哈希另由真实 Host 测试核对。构建与聚合检查的脱敏结果在 `build-and-gates.json`。开发失败和修复保留在 `development-history.md` 与中间运行目录，没有覆盖为 PASS。

## 独立复核与剩余阻塞

独立角色先形成测试契约，再预审复现 R1～R5，主线程保持唯一产品代码写者。独立首轮另发现 U02 目标切换迟到读取缺陷；实现者发现并修复 pi-ai 空目录误分类。修复后再次冻结，独立角色在隔离 Host、Cookie、数据库及浏览器中完整重验；候选前后 50 个产品/测试/指令文件及 13 个运行时文件均匹配。首轮失败及测试预期错误保留在 `independent/round1/`，最新结论见 [独立验收结论](independent/REVIEW.md) 与 [详细独立报告](independent/REPORT.md)。技术复核通过，真实 GPT 部分仍为 BLOCKED，不能由技术路径通过推导本单元完全通过。

`real-provider/summary.json` 明确记录 BLOCKED 和零调用。继续验收需要已授权且身份明确的 GPT 路由、凭据可用性及可信价格；在同一候选上关联真实 read/update 模型选择、业务 HTTP、独立 SQL、UI 和独立复核。运行说明在 `operator-notes.md`。未调用非 GPT 替代品，也未向源码、证据或 Git 保存 API Key、Cookie、owner 入口 token 或其他用户私人内容。

FND-001～004 的工作单元记录与前置提交逐项相同；完整 44 项需求、66 项完整场景不自动通过。此前 Connection 独立停用/恢复的历史 BLOCKED 仍保留，未用 Host 整体重启替代。没有开发 FND-006、通用 jobs/outbox、PDF 导入或完整 AI 助手。当前保持 `blocked` 并停在 FND-005，交付分支正常提交推送后等待下一条用户指令。
