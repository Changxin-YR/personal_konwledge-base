# KnowledgeOS｜API 与 AI 执行契约


> FND-006 是唯一已激活单元，正式依赖为已通过的 FND-004。FND-005 保持 blocked；继承代码不等于继承验收。完整产品审查未激活。
> 此页是全周期目标；实际实施范围以唯一 CODEX_START.md 为准。

- 版本：1.0，2026-11-16（Asia/Shanghai）。
- 状态：**planned**。本文件中的 `/knowledge/v1/...`、工具名、事件名和响应字段均是拟新增的 KnowledgeOS 接口，不能当作 DSH 已存在的 API 调用。
- 数据语义见 `04_DATA_AND_STATE_CONTRACTS.md`；DSH 真实可复用接口见 `02_DSH_CAPABILITY_AUDIT.md`；最终函数签名以锁定源码与 M0 适配验证为准。

## 0. FND-003 当前身份接口

原 `/knowledgeos/status` 与 `/knowledgeos/foundation/records` 继续保持既有DSH准入和探针契约。新 `/knowledge/v1` 只实现auth/status、auth/bootstrap、auth/register、auth/login、auth/logout、me、me/preferences、spaces；精确方法/响应及十二项测试在唯一 [CODEX_START.md](../../CODEX_START.md) 冻结。

bootstrap和设置页为DSH required，再检查本次peer是owner、listener和socket均loopback、来源及专用请求头。其他业务路由使用anonymous DSH准入但保留Connection来源防护；需要身份的操作再验证独立业务Cookie。业务Cookie不注册DSH provider、不转成owner，DSH Cookie也不能代替业务actor。普通账号页面不要求先进入DSH owner壳。

身份变更采用JSON+X-KnowledgeOS-Request:1及来源/Fetch-Metadata检查，禁止宽松CORS；每次会话检查撤销/到期/账号状态。注册不自动登录、重名冲突；登录创建新会话、退出幂等；偏好使用expected_revision。本轮不引入通用Idempotency-Key/operation/audit/outbox平台，相关全周期目标随后逐单元落实。

本机身份闭环不等于完整对象ACL/共享服务已完成。FND-004、真实模型、资料业务仍未激活；旧API额度问题不参与本轮验收。

## 1. 调用边界和身份链

调用链为：用户界面或 AI 工具 → KnowledgeOS 客户端 → KnowledgeOS 认证 → 资源授权 → 领域服务 → 数据库事务/后台任务。前端和模型都不能绕过领域服务直接写表、读原件目录或修改 DSH 配置文件来完成业务动作。

个人模式可以在本机调用同一领域服务；协作模式通过单一权威服务访问。两者复用同一套 DTO、错误码和业务校验。每个请求都绑定实际用户、目标 `service_id`、空间和授权范围；用户 ID 来自认证会话，不能信任请求体中的任意 `user_id`。

用户的 DSH 桌面 Host 保持 loopback。共享服务使用最小专用 profile，只暴露本项目认证、业务路由和必需的静态资源；不开放上游默认 owner Token、Session 通用接口、任意绝对文件路径读取、共享附件库或 Host 级插件管理 RPC。若需要复用上游 RemoteAccess，必须注册本项目 non-owner principal 与逐资源规则，并测试 owner 通道无法旁路；不能用“连上 DSH”代替账号认证。

M0 必须画出实际路由表并验证：匿名访问被拒绝；用户 A 无法读用户 B 的私人资料、答案、日志和附件；切换项目不能保留旧页面的有效请求身份；撤销授权后现有 SSE/WebSocket 和长任务也被限制。仅有前端按钮隐藏不算通过。

### 1.1 注册与会话

首个管理员的初始化只能在可信本机完成，并有一次性初始化状态；不能让任意远端第一个请求抢占管理员。个人账号支持注册和登录；协作服务可通过邀请码开放注册/加入，具体开放方式是部署配置，不影响已经确认的注册登录能力。

密码采用成熟库的安全哈希，绝不明文存储；具体库及参数在 M0 按运行平台确认。浏览器会话使用安全 Cookie 与请求防伪措施；桌面端的服务凭据由可用的系统安全存储或主进程凭据层保存，不能放在可导出的笔记、URL 查询参数或公开仓库。跨机器连接启用 HTTPS；本机开发 loopback 的例外必须显式区分。

账号令牌、DSH 运行权限和第三方模型凭据是三类不同授权。把用户加为项目编辑者，不得授予安装 Host 插件、读取模型密钥或执行任意本机命令的能力。

## 2. 通用 HTTP 约定

### 2.1 请求与响应

基础路径拟定为 `/knowledge/v1`。资源 ID 为不透明字符串，日期时间使用含时区的 ISO 8601。JSON 对外边界、模型工具参数、后台消息和导入文件均进行结构校验；同进程已有静态类型保证的内部参数无需机械重复校验。

成功响应包含明确业务状态，不只返回布尔 `success`：

```json
{
  "data": {
    "id": "asset_example",
    "revision": 3,
    "state": "partial",
    "available_pages": 120,
    "total_pages": 730
  },
  "meta": {
    "request_id": "request_example",
    "service_id": "service_example",
    "server_time": "2026-11-16T02:00:00Z"
  }
}
```

示例 ID、时间和页数只用于解释响应，不是实测结果。分页使用稳定游标并包含明确排序，默认最大页量作为可配置技术参数；列表不会泄露无权对象的标题、数量、片段或作者。

### 2.2 幂等、版本与异步

创建、提交、审核、评分相关变更、邀请兑换、冻结、恢复及 AI 执行动作携带 `Idempotency-Key`。同键同摘要返回原操作结果或安全的操作回执；同键不同摘要返回 `IDEMPOTENCY_CONFLICT`。返回历史回执前也要按当前权限过滤，撤权后不能通过幂等缓存拿到受限正文。

更新和删除携带 `If-Match` 或等价的 `expected_revision`，与数据库 revision 一致才执行。冲突返回当前安全元数据和可重试建议，不覆盖用户草稿。权限校验、版本校验、业务状态转移、审计和 outbox 在同一事务中完成。

耗时任务返回 `202 Accepted`，响应含 `operation_id`、当前状态、查询地址及是否可取消。`202` 只表示受理，不表示解析、模型调用或安装已经完成。客户端通过 `GET /operations/{id}` 对账，通过任务事件流获得进度。

流式响应包含单调 `event_seq` 和 `operation_id`，支持以最后收到的序号重新订阅。重连不能重新发起相同业务动作。权限撤销时终止或收窄订阅；不得在断线后继续缓存并重放当前已无权读取的正文。

### 2.3 通用错误

| HTTP/错误码 | 含义 | 客户端动作 |
|---|---|---|
| `401 AUTH_REQUIRED/SESSION_EXPIRED` | 未登录或会话失效 | 保留草稿，重新认证后再校验原操作结果 |
| `403 FORBIDDEN/GRANT_EXPIRED` | 无权或分享过期 | 停止读取、隐藏受控缓存，显示合法申请入口 |
| `404 NOT_FOUND` | 不存在或不应暴露其存在 | 不根据错误差异探测他人对象 |
| `409 REVISION_CONFLICT` | 版本已改变 | 显示差异并保留双方草稿 |
| `409 IDEMPOTENCY_CONFLICT` | 幂等键重复但请求不同 | 使用新动作/新键，不自动覆盖原动作 |
| `409 INVALID_STATE/DEPENDENCY_UNRESOLVED` | 当前状态或前置条件不允许 | 展示下一处理人或所缺材料 |
| `422 INPUT_INVALID/SOURCE_UNVERIFIABLE` | 格式或可引用来源不足 | 指出具体字段/页段，允许修正 |
| `429 PROVIDER_RATE_LIMITED` | 提供方限流；本地预算仅提醒 | 显示来源、重试时间，不悄悄换模型 |
| `503 PROVIDER_UNAVAILABLE/PLANNING_HOME_UNAVAILABLE` | 外部能力或权威计划服务暂不可用 | 保留当前结果，阻塞依赖步骤 |
| `500 OPERATION_OUTCOME_UNKNOWN` | 外部动作可能已发生但无法确认 | 进入对账，不直接重做或宣告成功 |

错误正文含 `code, message, request_id, retryable, safe_details`；不返回堆栈、密钥、私有绝对路径或无权资源正文。区分“没有权限”“来源已删除”“模型未配置”可以在用户有权知道对象存在时给出精确说明。

## 3. 接口目录与验收重点

以下是实现范围清单。路径可以在 M0 契约评审中合并或调整，但行为、权限和追踪关系不得丢失；一旦前后端开始消费，应由 OpenAPI/等价 schema 生成类型并检查变更。

### 3.1 身份、空间、权限

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `POST /auth/register` | 创建账号/兑换注册资格 | 初始化管理员不被远端抢占、邀请码策略有效 |
| `POST /auth/login` / `POST /auth/logout` | 创建/撤销登录会话 | 注销后旧会话不可继续访问 |
| `GET /me` / `PATCH /me/preferences` | 自身资料、领域、时区等 | 不能更改角色或关闭 F30 |
| `GET /spaces` | 当前有权访问的个人/项目空间 | 私人空间互不可枚举 |
| `GET /resources/{type}/{id}/permissions` | 有权管理者查看授权 | 查看权限记录本身也需要授权 |
| `POST /invitations/preview` / `POST /invitations` | 预览并创建邀请 | 明确范围、动作、绝对到期、兑换次数 |
| `POST /invitations/redeem` | 登录者兑换令牌 | 不从兑换时重新计算七天 |
| `POST /invitations/{id}/revoke` | 撤销邀请及已预览的派生授权 | 该授权覆盖的读取、订阅和任务权限同步失效；不无故注销整个账号 |
| `POST /invitations/{id}/renew` | 对仍有效邀请及其全部有效派生授权整组续期 | 同一事务更新同一绝对到期时间；过期/撤销邀请需创建新邀请 |
| `POST /grants/{id}/renew` / `POST /grants/{id}/revoke` | 有权人显式续期/撤销 | 非邀请授权可直接续期；邀请派生授权转入邀请续期或创建新邀请，不单独改期限 |

### 3.2 导入、阅读、转换与搜索

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `POST /imports` | 声明文件、归属、类型、哈希与是否新版本 | 文件接收和解析分开，原件不被覆盖 |
| `PUT /imports/{id}/parts/{part}` | 分片上传 | 分片校验、重复上传不重复计数 |
| `POST /imports/{id}/commit` | 完整哈希核验并排队处理 | 提交成功前原件完整，失败有可恢复状态 |
| `GET /imports/{id}/entries` | 查看压缩包清单并选择 | 路径、展开量和引用范围合法 |
| `GET /assets/{id}` / `GET /assets/{id}/versions` | 元数据、版本、处理状态 | 不把 partial 显示为全本完成 |
| `GET /assets/{id}/versions/{v}/pages` | 分段读取可用内容 | 页码、原页定位、质量问题完整 |
| `GET /assets/{id}/versions/{v}/original` | 受控查看/下载原件 | 查看检查 read，显式下载检查 export；均校验到期和回收站状态 |
| `POST /assets/{id}/process` | 首次/局部重试处理 | 输入版本锁定、可取消、无重复页 |
| `POST /assets/{id}/convert` | 生成转换结果 | 原件保留、结果独立、问题可预览 |
| `PUT /reading-states/{asset_id}` | 保存个人阅读位置 | 每人独立，版本失配需要复核 |
| `POST /bookmarks` / `POST /annotations` | 书签与批注 | 不强迫公开个人笔记 |
| `POST /search` | 当前权限内统一搜索 | 中文测试集、可复现引用、无跨空间片段 |
| `GET /citations/{id}/resolve` | 解析到固定版本原页/代码 | 失权时只返回允许的状态信息 |

对约 40 MB、730 页资料使用可见进度与可恢复上传/处理。无法恢复的阶段必须明确重试成本，不谎称断点续传。解析支持先打开已可用部分；模型分析不得被放在所有页面可阅读的前置路径上。阅读与显式导出是不同的产品权限动作，但原文一旦显示或传到浏览器，不能保证用户绝对无法复制；权限设计不得承诺不存在的 DRM 能力。

### 3.3 知识、笔记和个人训练

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `POST /terms/explain` | 按已选语境临时解释术语 | 不自动创建永久条目，显示来源与不确定性 |
| `POST /knowledge-items` / `POST /knowledge-items/{id}/versions` | 保存条目与修订 | 来源、确认状态和版本保留 |
| `GET /ontology/types` / `POST /ontology/relations` | 类型规则与关系提案 | 方向/类型限制、证据、待确认状态 |
| `POST /ontology/relations/{id}/review` | 确认/纠正/拒绝关系 | 操作者有权、保留原建议 |
| `POST /notes` / `PATCH /notes/{id}/nodes` | 新笔记及原子树编辑 | 大纲/脑图同源，无环、无跨笔记节点 |
| `POST /notes/{id}/delete-preview` | 节点/子树删除影响预览 | 不误删引用原件 |
| `POST /practice-sessions` | 快答或完整训练 | 输入固定题目版本，学习方向不自动更改 |
| `GET /practice-sessions/{id}/questions` | 学习者题目视图 | 首次提交前不在响应中泄露答案 |
| `POST /practice-sessions/{id}/attempts` | 保存首次或后续答案 | 先保存首次答案，再返回解析 |
| `POST /practice-sessions/{id}/hints` / `POST /.../reveal` | 提示/揭示 | 记录辅助程度；提前揭示使独立表现标记失效 |
| `GET /me/wrong-questions` / `PATCH /me/question-states/{id}` | 个人错因、掌握状态、复习 | 一个用户答错不改变其他用户 |
| `POST /recall-materials` / `PATCH /recall-materials/{id}` | 保存长文选区和遮挡分组 | 跨页不截断、来源版本绑定 |
| `POST /recall-attempts` / `PATCH /recall-attempts/{id}` | 保存揭示、提示、自评和进度 | 自评与独立表现分开 |
| `GET /me/learning-assessments` | 有依据的反馈 | 区分证据、自评、缺少数据 |
| `POST /me/direction-proposals/{id}/decision` | 本人确认/拒绝方向调整 | AI、项目编辑者和管理员不能代替本人同意 |

术语查询、快答和背诵都能从阅读页返回原位置。普通学习者接口不返回题目的隐藏答案；内容作者管理题目使用独立权限接口，并在挑战记录中标记已经看过答案的情形。

### 3.4 仓库分析与工程训练

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `POST /repository-connections` | 连接 GitHub/GitLab/Gitee 适配器 | 凭据安全保存、只读默认 |
| `POST /repositories/{id}/snapshots` | 固定提交抓取 | 完整 SHA、文件清单和来源记录 |
| `POST /repository-analyses` | 文件/模块/项目/流程分析 | 固定快照、行号引用可回看 |
| `POST /engineering-cases` | 创建诊断或独立挑战 | 初始分析先保存 |
| `POST /engineering-cases/{id}/steps` | 提交复现、假设、定位、方案等 | 每步新版本，提示与原始分析保留 |
| `POST /engineering-cases/{id}/evidence` | 接收修改和验证证据 | 来源级别、环境、命令和代码版本清楚 |
| `POST /engineering-cases/{id}/publish` | 确认复盘为工程案例 | 案例形成与任务正式完成分别处理 |
| `POST /architecture-training-sessions` | 知识/案例/论文/模拟训练 | 评分依据可看、事实和模型意见区分 |

平台适配器至少有 `resolveRepository`、`resolveRef`、`readTree`、`readBlob` 四种只读语义，入口统一。没有真实凭据的平台保留 `unverified` 状态，不能因为 DTO 一样就宣称平台集成已通过。

### 3.5 今日计划、协作、评分与提醒

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `GET /me/planning-home` | 当前唯一计划权威服务 | 不同连接不同时结算评分和发送提醒 |
| `GET /me/daily-plans/{date}` / `PUT /...` | 查看/编辑当天计划草稿 | 时区、预算、前置条件明确 |
| `POST /me/daily-plans/{date}/commit` | 固定承诺、权重和评分规则 | 承诺后变更留痕，不能静默改成绩 |
| `POST /execution-sessions` | 开始有限执行时段 | 必须有结束时间，不永久豁免 |
| `POST /execution-sessions/{id}/finish` / `extend` | 结束或继续下一时段 | 一条执行记录不能被两个模块重复计时 |
| `POST /projects` / `GET /projects/{id}` | 项目及进度 | 项目成员与个人数据权限分离 |
| `POST /tasks` / `POST /tasks/{id}/publish` | 草拟和派发任务 | 标准、期限、负责人、审核路径完整 |
| `POST /tasks/{id}/submissions` | 提交固定版本成果 | 重复请求只生成一份提交 |
| `POST /tasks/{id}/blockers` / `POST /blockers/{id}/decision` | 报告并认可阻塞 | 只影响该任务，限期复核 |
| `POST /submissions/{id}/reviews` | 同伴预审或正式终审 | 角色权限、管理员任务不可绕终审 |
| `POST /decisions/{id}/appeals` | 提出复议 | 保留原裁决，关键影响暂缓结算 |
| `POST /appeals/{id}/resolution` / `POST /decisions/{id}/correction` | 复议决定/管理员改判 | 版本重算、已发通知留档 |
| `GET /me/daily-scores/{date}` | 档位、版本、输入依据 | 待审不伪装 settled，无法评分不自动 D |
| `GET /me/reminder-status` | 只读查看规则与条件 | 没有关闭、暂停、退出规则的操作 |
| `GET /me/notifications` / `POST /notifications/{id}/ack` | 查看/已读通知 | 已读仅处理通知，不关闭 F30 |
| `GET /admin/project-statistics` | 授权范围的管理统计 | 不把平台管理员等同所有私人记录可读 |

业务 API 不提供由用户任意指定“今日 A/B/C/D”的直接写接口。人工纠正必须关联正式理由与可追溯的裁决/计划依据，由领域服务重算。上报阻塞不能由模型自行伪造认可人；改变提醒时段不能形成隐藏停用开关。

### 3.6 多智能体、操作票据和插件

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `POST /discussions` | 发起分阶段讨论 | 目标、材料范围、席位和五轮上限 |
| `POST /discussions/{id}/rounds` | 生成/修改当前方案版本 | 预算、轮次、源权限重新检查 |
| `POST /proposal-versions/{id}/reviews` | 请求既定席位评审 | 失败席位不移除，投票绑定哈希 |
| `GET /discussions/{id}/status` | 轮次、席位、意见、预算与阻塞 | 两赞成一失败仍 blocked |
| `POST /stages/{id}/freeze` | 冻结指定版本 | 全部有效、ceil(2N/3)、阻断处理均满足 |
| `POST /stages/{id}/user-decision` | 第五轮后用户裁定 | 明示人工裁定，不伪装自动通过 |
| `POST /actions/prepare` | 形成类型化动作与预览 | 身份、对象、范围、版本和已有授权 |
| `POST /actions/{id}/confirm` | 确认确需确认的动作 | 确认者真实有权，确认不能替代后续鉴权 |
| `POST /actions/{id}/execute` | 执行已满足授权的动作 | 幂等、版本检查、结果对账 |
| `GET /plugins` / `POST /plugins/actions/prepare` | 查看可管理插件与安装/移除计划 | Host 作用范围、可信来源和依赖清楚 |

协作服务的项目管理员不因此取得其他成员电脑的 Host 插件管理权。每台桌面插件变更在对应的本机管理边界执行；项目分享邀请不能远程安装代码到成员机器。核心 F30 和授权组件不作为普通可选插件显示启用/停用/移除动作。

### 3.7 生命周期和运维

| 方法与路径 | 行为 | 必须验证 |
|---|---|---|
| `POST /trash/preview` / `POST /trash` | 查看影响并回收对象 | 停止旧分享、保存三十天期限 |
| `GET /trash` / `POST /trash/{id}/restore-preview` | 查看和恢复预览 | 只有授权者可见，重名与依赖清楚 |
| `POST /trash/{id}/restore` | 恢复正文 | 旧授权不复活，分享另行确认 |
| `POST /trash/{id}/purge` | 永久清理 | 明确对象和影响、执行授权与 blob 引用核对 |
| `POST /exports` | 按权限生成导出 | 不导出无权原文、答案、他人记录或密钥 |
| `POST /backups` | 创建一致快照 | 清单、哈希、版本与恢复验证 |
| `POST /restores/preview` / `POST /restores` | 隔离恢复与切换 | 不覆盖未保存新数据，不复活撤销分享 |
| `GET /operations/{id}` / `POST /operations/{id}/cancel` | 对账/取消长任务 | 取消后迟到结果不可发布 |
| `GET /health/live` / `GET /health/ready` | 存活及依赖就绪 | 业务状态与进程存活区分，不暴露敏感配置 |

## 4. AI 调用与来源上下文

### 4.1 模型路径

只使用部署配置指定的 DeepSeek 或 DSH 已选的 DeepSeek；服务地址与凭据由该提供方适配器解析。用量按实际返回值记录；未知价格不阻止请求，预算阈值仅提醒，不设本地总费用或 token 硬上限。提供方拒绝、超时及并发保护仍生效。

主 Agent 使用用户实际已配置且可调用的 DeepSeek 路由。模型名称、提供方、非敏感账号连接 ID、`credential_ref` 和配额来源记录在运行配置与每次调用记录中；密钥、令牌原文和 Cookie 只在凭据存储/认证层使用，不能写入调用记录或公开证据。开发工具的模型身份不能证明产品通过真实模型验收。未配置时显示 `MODEL_NOT_CONFIGURED` 并让非 AI 功能继续工作，不回退到 GPT 或其他模型，也不虚构免费额度。

根据上游已核对扩展点，模型适配通过 DSH 的模型服务和已配置 provider 路由完成，保持请求路由与生命周期可追踪。不得截获全局 `llm/stream` 后临时改写所有会话模型。每次讨论捕获确切模型路由、参数与配置版本；修改配置仅作用于后续明确的新请求，不影响已准备好的调用。

使用 DSH Agent 的模型可见内容必须遵循上游 Session 记录机制；KnowledgeOS 额外记录业务上下文清单。上下文不得仅在隐藏旁路中注入而无法回看。自定义数据检索工具对当前执行用户和空间重新授权，模型不能把自己的自然语言声明当成身份。

### 4.2 上下文清单

每次请求记录 `run_id, actor_id, service_id, scope_id, purpose, provider/model, configuration_version, source_version_refs, citation_locators, allowed_actions, assistance_mode, input_hash, started_at`。在 UI 中展示用户能理解的来源范围，例如教材版本及页段、选中的两段文字、固定提交中的代码文件。

数据取材按顺序执行：确定真实用户和操作目的 → 查询授权范围 → 检索候选 → 再次检查每条来源及版本 → 构造有预算的上下文 → 持久记录清单 → 调用模型。模型生成结果发布前再核对权限与取消状态。源在调用过程中被撤权，结果不能继续公开其受限摘要或原文。

导入文件、仓库 README、注释、网页和检索结果均作为待分析数据，不获得调整系统指令、访问其他项目、安装插件或改变提醒规则的权限。输出引用必须能解析到真实已授权来源；无法匹配的引用标记为无法核实，不凭标题或模型编造页码补齐。

### 4.3 用量和失败

用量记录分开保存请求次数、提供方返回 token、估计 token 和费用。提供方没有返回的数据标为未知；估计值标为估计，不能与真实账单混加。费用只在已知计价配置和可用数据下计算，价格配置绑定版本；不擅自填固定人民币/token 数值。

并发队列、每次任务的调用数、重试次数和超时是 KnowledgeOS 自身资源控制，不能冒称账户配额。模型评审按席位排队；上游已有速率限制若可获知应继续遵守。具体并发和重试默认值在配置中声明并以 M0 实测选择，禁止无限重试和因限流自动减少评审席位。

取消采用可传播的中止信号，并将终态、已产生结果和已知用量保留。外部请求失败或结果不确定时不伪造答案；解析、查阅、笔记和手动训练等不依赖模型的功能保持可用。

## 5. AI 工具与动作票据

### 5.1 工具清单与能力限制

模型只接触命名清楚、参数受限的领域工具，例如：

| 工具组 | 典型工具 | 默认动作性质 |
|---|---|---|
| 阅读与取材 | `knowledge.search`、`knowledge.read_source`、`knowledge.explain_term` | 读取当前有权内容 |
| 整理与训练 | `knowledge.propose_item`、`training.create_practice`、`notes.create_draft` | 生成可追溯草稿/已授权可逆记录 |
| 计划 | `planning.propose_tasks`、`planning.schedule_review`、`planning.show_score_basis` | 已授权排程或计划建议；方向变化需本人确认 |
| 协作 | `tasks.create_draft`、`tasks.submit`、`tasks.report_blocker` | 按真实权限执行；不能伪造终审 |
| 评审 | `discussion.submit_proposal`、`discussion.record_review` | 结构化版本与评审记录 |
| 管理 | `plugins.prepare_change`、`assets.prepare_delete`、`backup.prepare_restore` | 返回影响预览与需要的授权 |

不要提供通用 `execute_sql`、任意文件读写、任意 HTTP 请求或“代替任何用户执行”工具给共享服务模型。代码项目分析默认只读。需要运行命令的工程实践在明确授权的隔离执行边界完成，操作范围与知识库读权限分别判断。

### 5.2 票据字段和流程

动作票据保存：`action_id, requested_by, interpreted_intent, tool_name, target_service_id, target_objects, expected_revisions, normalized_arguments_hash, permission_scope, authorization_source, preview, confirmation_requirement, expires_at, state, execution_receipt`。自然语言可先帮助形成票据，但真正执行只接受结构校验后的参数。

票据流程：`prepared → authorized → running → succeeded/failed/outcome_unknown/cancelled/expired`。确需额外确认时才经过 `awaiting_confirmation`。用户在本次会话已经明确授权的可逆动作，在授权范围和参数未变化时可以直接执行，不能为了每一次普通保存或已授权复习排程反复请求确认。

下列动作应展示具体影响后按其已有授权决定是否确认：扩大分享、修改他人权限、删除原件、永久清理、切换备份恢复目标、安装会在 Host 执行代码的插件。确认必须绑定具体对象、版本和影响摘要；参数改变后原确认失效。已有明确授权能覆盖的动作不人为新增阻塞，但任何授权都不能超过当前用户真实权限。

学习方向调整只能本人确认；管理员任务终审只能符合审核路径的管理员裁决；多智能体投票不能替代这些真实用户决定。固定强提醒政策不可通过任何票据变为关闭。

执行先检查票据尚未过期、当前操作者仍有权、对象 revision 一致、请求摘要一致，再获取幂等执行资格。完成后回读业务对象，保存实际结果和可跳转入口。若外部动作可能已发生但结果未知，进入对账；不得换幂等键盲目重试。

## 6. 插件变更边界

插件安装和移除改变对应 DSH Host 的运行代码，作用范围必须在 UI 预览中写明。成员自己的桌面插件由该成员在本机权限边界操作；共享业务服务插件只允许部署管理员管理，业务“项目管理员”不自动等同部署管理员。

变更预览列出插件来源、固定版本/哈希、新增能力、依赖、受影响页面/任务和回退方式。从明确可信清单安装的插件可以按既有授权连续执行；未知来源需要具体授权与可审查信息。安装过程失败应保持旧可用配置或显示明确失败，不修改无关 Host/其他账号配置。

核心身份、ACL、数据事务、审计、F30 调度与通知不能被普通插件工具卸载或禁用。M0/M5 应验证实际插件管理入口无法通过“删除依赖”“覆盖 profile”绕过这些不变量；不把代码层任意插件具有的进程权限包装成安全沙箱保证。保留上游许可和第三方 notices，不向公共仓库上传凭据或私有账号配置。

## 7. 多智能体评审的结构化输出

各席位输出最少包括 `proposal_id, proposal_hash, seat_id, vote(approve/reject), findings[], evidence_refs[], limitations`。每条 finding 有稳定 ID、严重程度、是否阻断、依据和建议。无效 JSON、引用无法核验、失败/超时均不是有效投票。

主 Agent 对意见逐项记录 `accepted/partially_accepted/rejected` 及理由；涉及重大阻断的处理需要可核对证据。方案修改产生新哈希，所有正式评审绑定新版本。重试同席位对同版本的请求按 attempt 记录，只允许一份当前有效评审。

冻结检查由确定性领域代码计算，不由模型口头宣布：既定 N 个席位全部完成有效评审；`approve_count >= ceil(2*N/3)`；无未处理重大阻断；轮次 ≤5；被审方案哈希与当前方案相同。第五轮未达标返回 `AWAITING_USER_DECISION`，不得降低门槛、缩小 N 或自动继续第六轮。

默认三个席位可以配置实际可用模型与角色，但不能伪装成三个互相独立的模型供应商。所有席位可能共享同一模型带来的判断相关性，应在讨论配置中如实显示。冻结后的方案进入知识库，并把任务建议保存成草案；实际发布仍检查发布权限。

## 8. 开发交付与契约验收

M0 输出实际可执行的接口 schema、领域类型、错误码、身份链测试和一次 DSH UI/服务挂载及模型调用证据。缺少模型凭据时，模型调用项记录 blocked 并只继续同一已激活单元内不依赖模型的工作，不能把模拟响应报告为真实调用成功。

M1 起每个接口交付同时包含权限测试、状态转换测试和失败恢复证据。验证应针对业务风险，例如猜测对象 ID、并发重复提交、分享过期、源更新、响应丢失、晚到任务结果；不堆砌只重复实现逻辑的测试。

客户端与工具共用契约类型，但都通过真实服务做关键集成验收。不得用固定返回成功的假接口把六个工作区包装成已完成产品。测试夹具必须显式标为夹具，不能覆盖真实失败信息或在验收报告中混同。

所有接口变更更新 OpenAPI/等价 schema、受影响调用方与验收记录。上游升级必须先重做 DSH 适配与权限边界验证；本文件不授权自动跟随 master 或覆盖用户本机已有 DSH 配置。
