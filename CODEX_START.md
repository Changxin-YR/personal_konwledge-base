---
instruction_revision: "3.1.0"
execution_phase: "codex_foundation"
executor: "codex"
active_unit: "FND-003"
auto_advance: false
---

# 当前执行指令：Codex · FND-003 注册登录与个人身份

你是 KnowledgeOS 当前单元的开发主管。用户已要求接续下一步，本次只激活 FND-003。请在已通过的 FND-001/FND-002 上完成一条可实际操作的身份闭环：可信本机初始化管理员 → 普通账号注册/登录 → 服务端会话识别本人 → 保存方向与目标并读取个人空间 → 退出立即失效。按小步骤边开发边测试，完成提交后停止等待下一指令。

本文件 v3.1.0 整体替换唯一 CODEX_START.md 的 v3.0.0 接管修复任务。不要重做已关闭的 R1/R2，不保留另一份 START/PROMPT，不自动启动 FND-004。旧 API 额度问题仍不处理；本轮不依赖模型调用。DSH 继续作为产品 Host 与插件上游，开发执行器为 Codex。

## 1. 基线、授权与范围

| 项目 | 本轮约定 |
|---|---|
| 仓库 | `https://github.com/Changxin-YR/personal_konwledge-base.git` |
| 工作分支 | `codex/knowledgeos-fnd-003` |
| 已验收前置提交 | `3535f16b1a429d32cd2c80f6c1462ce556fcb509`；产品修复提交 `a03c9e3312707bd146e29953c2cf8153e498dd40` |
| 前置复核 | `docs/evidence/FND-002/ACCEPTANCE_REVIEW_20261116.md` |
| 当前状态 | FND-003 ready / planned；当前产品测试 NOT_RUN；FND-001、FND-002 保持 passed |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738`，DSH `0.2.2-rc.3` |
| 工具链 | Node >=24.9.0 API 基线、pnpm 11.28.5；报告实际 Node/SQLite/浏览器版本 |
| 需求与验收 | F03；A02/A03 仅身份/偏好子集，完整场景继续 NOT_RUN |
| 架构 | 分层模块化单体，同一 DSH loopback Host、同一独立业务 SQLite、一个受控写连接 |

本轮包括首次管理员、普通注册、登录/退出、会话失效、本人偏好、唯一个人空间、最小账号页面、v2 迁移、认证与来源保护以及必要回归。不做完整 ACL/邀请码/共享 profile、公网部署、资料/题目/计划/评分、产品模型/RAG、审计/outbox 平台、安装包或全量六工作区。目录里未来功能不构成开工授权。

管理员身份也只能读取本人的私人资料和偏好。本轮不提供用户管理、密码重置、角色编辑、账号删除或其他人的资料接口；未来分别激活。当前阶段的“个人空间”是真实账号和空间记录，不包括尚未实现的知识内容管理。

## 2. 开工核对与同一功能内分工

先读 AGENTS、本文件、execution_state、当前 FND-003 工作记录、PROGRESS/BLOCKERS、FND-002 验收复核，再读需求 F03、03 架构、04/05 当前适用节、07 的 A02/A03、08 UI、11 角色协议。阅读现有插件的 Host、http、records、storage、config、客户端、构建及 fnd002 测试；按锁定 SHA 阅读上游 AGENTS、WebServer/Connection/Token/Peer 实际源码。

核对 origin、当前分支、实际 HEAD、用户未提交修改及候选前置，不 reset --hard、不自动 stash、不 force push。正常 fetch 后沿本轮分支继续，必要时隔离 worktree。运行 `node scripts/verify-plan.mjs`、`node scripts/prepare-upstream.mjs --check`；NOT_PREPARED 时按已有脚本准备固定源码，优先复用已核验构建。进入实施时同步当前单元为 in_progress；不要修改通过历史来“重新开工”。

最多四个活动角色：主管负责范围、候选和交付；架构角色核对接口/身份链/迁移且默认只读；独立测试角色先定义行为与反例；唯一实现者逐项写产品和获准测试。确认当前环境真实可用的子代理能力，不能虚构调用。测试文件单独分配排他写权限，正式验收时冻结源码和测试。独立复核确实缺失则如实报告，不虚报通过。

先在 `docs/evidence/FND-003/architecture.md`、`test-plan.md` 写最小调用链、准入表、迁移/DTO/密码及会话默认值、十二项测试的实际命令和预期，随后直接实施，不等待用户重复确认既定范围。工程默认值如实标注；依据代码作保持行为的局部适配可自主完成，实质改变已确认需求才提交具体差异。

测试复用固定上游，使用专用 `.cache/dsh-home-fnd003`、profile `knowledgeos-identity-test` 和空闲本机端口（默认 3101）。目录从当前检出解析，Windows 历史路径仅作参考。只用合成数据、临时账号和自己的测试进程；持久化/重启测试保持同一数据目录。操作进程前确认 PID、命令、profile 和端口，保护现有 DSH 实例。PowerShell 不给 $HOME/$home 赋值。

## 3. 唯一接入方案与权限边界

### 3.1 复用真实 DSH Host，不分发 owner 凭据

固定 WebServer 支持 `auth: 'anonymous' | 'required' | 'deny'`，handler 接收 `(req,res,peer)`；required 只保证有效 Peer，不自动保证 owner。Token 的真实 owner 为 `peer.principal.kind === 'owner'`。Connection 的 Host/Origin 检查适用于 anonymous；没有授权监听器时 anonymous 可直接放行，因此本项目必须声明真实 Connection 服务依赖并验证其生效，缺失时身份入口不可用，不能匿名降级。

本轮新增精确路由，不用覆盖全 `/api`、全 `/knowledge` 的宽泛 handler 或改默认 fallback：

| 路由类别 | DSH 准入 | 业务准入 |
|---|---|---|
| `/knowledgeos/setup`、初始化 POST | required | 再检查本次准入 peer 是 owner，listener 与实际 socket 都是 loopback，一次性状态有效 |
| `/knowledgeos/account` 及精确静态资源、注册/登录/状态 | anonymous | 来源/方法/输入/限流/初始化状态校验；页面不载入 owner 壳或凭据 |
| `/knowledge/v1/me`、偏好、spaces、logout | anonymous | KnowledgeOS Cookie 生成可信 actor；退出的幂等语义见后文 |
| 原 status/probe、DSH API/RPC/文件/插件入口 | 保持原策略 | 新业务 Cookie 不授予任何 DSH 权限 |

不将业务 Cookie 注册为 ConnectionAuthentication provider，不创建 owner 或伪造 non-owner Peer，不用 ctx.connection.browserPeer 冒充请求实际调用者。即使同一浏览器已有 DSH Cookie，业务 `/me` 仍只认自己的业务会话。测试必须使用分离的 owner、管理员业务、成员甲、成员乙上下文，后三者不带 DSH Cookie。

Host 只监听 loopback。本轮身份能力若遇到非 loopback listener 要拒绝启用或明确不可用，不能靠说明文字默许远程。真实本机判断使用 WebServer 的 `host` 与 `req.socket.remoteAddress` 的规范 IP 分类；复用实际 `isLoopbackHost` 或等价可靠解析，兼容 IPv4-mapped IPv6。Host/Origin/Forwarded 请求头不是 socket 本机证明，不接受任意 trustedHosts/CORS 扩大。

### 3.2 管理员只由受保护初始化入口创建

冻结 owner HTTP bootstrap 为本轮唯一方案，不同时实现另一套离线 CLI 或“第一个注册者成为管理员”。初始化页和 POST 都必须 required 且实际 owner；GET 不修改数据库。POST 同时通过本机、来源、JSON、专用请求头和输入检查。

KDF 在事务外执行；进入同一短事务后重新检查持久初始化标记，再创建密码凭据、管理员 users、personal space，并写入管理员 ID 与 initialized_at。并发最多一次提交；后续调用返回 409 ALREADY_INITIALIZED，不更换密码/管理员，不因用户表为空而重新开放。卸载、重启、注册、退出不能清除该标记。

初始化只返回安全创建结果，不发放 DSH 凭据，也不自动把 owner Cookie 转成业务会话。管理员随后通过普通业务登录进入个人空间。普通注册在初始化前返回 409 SETUP_REQUIRED，初始化后始终只建 member，拒绝客户端 role/is_admin 等字段。

### 3.3 分层与职责

保持入口/HTTP → 应用用例与端口 → 具体 SQLite/密码/会话适配。身份用例接收由服务端认证生成的 actor，不从请求体推断操作者；SQL 与 node:sqlite 留在适配层，React/DSH 服务实例不进入内层。按职责添加少量身份文件，保留已有 records 用例，不全仓重排目录或为每个方法建立空类。

同一业务库只有现有适配层管理的受控写连接；账号与探针共享连接生命周期。异步 KDF、网络或文件操作不得放进 SQLite 事务。处理关闭时先阻止新操作、取消尚未开始的队列任务，再等待已运行KDF的真实回调完成并释放名额，最后幂等关闭连接。已开始的crypto.scrypt不能随HTTP取消提前释放运行槽位；取消后的结果不得写库或继续响应。异步哈希完成后、进事务前再次检查关闭/取消状态。

## 4. 数据契约与 v2 迁移

数据库继续是可信 dataDir 下的 `knowledgeos.sqlite`，application_id 保持 `0x4B4F5331`。原 v1 SQL/checksum/账本/探针记录不可修改；v1 checksum 为 `033dcf95cd9e7c6e4fa964804de7944c1b99daa4b4acd5b92708555cb15dc84a`。通过新增原子 v2 迁移建立本轮身份职责，不删除旧库或换文件。

新增最多以下五类应用表（可在保持职责和验证前提下合理合并，不能扩为未来业务表）：

| 表/聚合 | 本轮字段与约束 |
|---|---|
| `service_identity` | 单例键、持久 UUID service_id、bootstrap_admin_user_id、initialized_at；初始化字段只由可信用例写入 |
| `users` | UUID id、规范 login_name 唯一、display_name、credential_ref 唯一、role(admin/member)、status(active/disabled)、timezone、planning_home_service_id、domains、learning_tracks、goal_text、revision、created_at/updated_at |
| `password_credentials` | UUID id、版本化密码派生记录（算法/参数/随机salt/派生值）、created_at；被 users.credential_ref 引用且无明文密码 |
| `auth_sessions` | UUID id、user_id 外键、唯一 token_hash、created_at/expires_at/revoked_at；原始 token 不落库 |
| `spaces` | UUID id、service_id、kind=personal、owner_user_id 唯一且外键、status、revision、创建/更新时间；每人一份私人空间 |

领域/主线数组可以是 users 的受约束 JSON，按枚举校验、去重并规范存储；不为简单偏好另建通用配置系统。用户名输入只做规定的 trim 和 ASCII lowercase 后唯一比较，展示名称可用中文；密码始终原值处理。默认时区 Asia/Shanghai，可保存有效 IANA 时区；planning_home_service_id 暂指当前持久 service_id，不开放跨服务迁移接口。

迁移要求：已有 v1 先以只读方式核验归属、版本、完整对象集合与 v1 checksum，确认可接受后才做修改性 PRAGMA/v2事务；v2 重启只校验。保留 R1 的字面 sqlite_ 前缀保护，不能再次用 LIKE 'sqlite_%'。未知/未来/伪v2/多余外来对象或账本错配拒绝，不自动“修复”用户库。新库顺序执行 v1、v2，失败不得半提交；service_id 与初始化状态也须持久一致。

保留 WAL、foreign_keys、synchronous=FULL、busy_timeout=250ms 和受控关闭。创建账号时凭据/users/personal space 同事务；初始化还包含一次性标记；更新偏好带 expected_revision，冲突不覆盖。测试故障注入只在测试层，不增加 HTTP SQL/path/force_fail/role 参数。

本轮适用例外明确冻结：注册用规范登录名唯一约束防重复、重复报冲突且不自动登录；登录每次创建新会话；退出幂等；偏好更新用 revision。本轮暂不建设通用 Idempotency-Key、审计/outbox 平台或宣称这些全周期契约已完成，后续归相应单元；现有探针的幂等契约继续保持。

未配置 dataDir 时原面板/status 继续可用，身份 API 返回明确 503 STORAGE_UNAVAILABLE，页面说明未配置；不得退回内存账号、固定假用户、DSH owner 或另一目录。正式 v2 使历史“仅两表/v1”检查不再是当前范围门槛，应新增 FND-003 范围/迁移测试，保留旧历史脚本和结果。

## 5. 密码、会话与 HTTP 防护默认值

以下是基于本轮平台的工程默认值，不能冒称用户指定；实现前记录实际支持和必要性能观测。

### 5.1 密码与输入

使用 Node 24 的异步 `crypto.scrypt`，N=131072、r=8、p=1，独立随机 salt 至少16字节、派生值32字节、maxmem=192MiB。使用版本化记录和安全等长比较，不用普通 SHA/可逆加密当密码存储，不使用同步KDF阻塞Host。存储参数解析必须有白名单/边界，不能按损坏记录申请任意内存；不因默认maxmem不足而暗降强度。

密码为15–128个 Unicode 码点且UTF-8不超过512字节；保留空格与原值，不 trim、不规范化、不截断，拒绝非法Unicode。登录名规范后为3–64位ASCII字母/数字/点/下划线/短横线，首位字母或数字；密码大小写保持。display_name为1–80码点且最多320字节，goal_text最多2000字节。JSON body最多16KiB、严格UTF-8及未知字段拒绝，SQL参数化。

不存在账号与密码错误均给同一401 INVALID_CREDENTIALS，不暴露账号查找差异；用相同参数的受控 dummy 派生避免直接跳过昂贵验证。密码、Cookie、会话原文不进入正文错误、日志、截图、URL、公开配置或证据。

### 5.2 会话

采用不透明随机 Cookie 会话，暂不引入 JWT/refresh token 平台。token由CSPRNG生成32字节，库中仅存SHA-256；绝对有效期12小时，now>=expires_at即失效。每次登录新建token，不能接受客户端指定session_id；成功登录须在同一事务撤销当前请求携带的有效本系统旧会话并创建新会话；主动切换账号也只撤销该客户端携带的旧会话，不撤销其他浏览器或客户端的会话。

每次受保护请求验证token哈希、到期、撤销及users.status，生成 `{user_id, service_id, personal_space_id}` 的可信actor。默认不缓存会话有效性；注销更新revoked_at提交成功才报成功，重启不能复活。会话不存localStorage、URL或响应JSON。

Cookie设置HttpOnly、SameSite=Strict、不设Domain、Path=/knowledge/v1；名称以持久service_id与规范listener origin生成稳定非敏感后缀，避免同机器不同profile/端口碰撞。HTTPS设置Secure，HTTP只允许本轮明确的loopback开发模式；判断协议用真实WebServer配置，不信任转发头。删除Cookie使用同名同Path同属性。实际浏览器必须验证Cookie可用与注销清理，不能只看Set-Cookie字符串。

### 5.3 明确采用 JSON API 的自定义请求头防伪路线

所有变更请求（含bootstrap/register/login/logout/preferences）要求 `Content-Type: application/json` 和 `X-KnowledgeOS-Request: 1`，GET不写入。结合已激活Connection的Host/Origin/Fetch-Metadata检查，本业务再校验附带的Origin与真实listener origin精确一致；外站、null、malformed Origin和cross-site都拒绝。没有Origin的本机CLI可在正确Host、专用头及所需凭据下操作；不能为“兼容”绕过专用头。缺头403 CSRF_REJECTED，非JSON415，恶意来源403；认证层原始拒绝不强行改格式。

不开放宽松CORS、不反射任意Origin、不允许simple form类型执行状态变更。此处选择完整的自定义头+来源保护方案，不再搭半套同步CSRF令牌；SameSite只是附加保护。更改上游来源/默认路由策略不属于本轮适配。

### 5.4 有界密码计算与失败限制

异步KDF最多2个同时运行、等待队列最多8个，超限快速返回429 AUTH_RATE_LIMITED并带Retry-After；排队任务取消时移出队列；已开始的KDF无论HTTP是否取消都占用名额直到真实回调结束，失败也在完成回调后释放，不能靠取消请求提前归还槽位。关闭时拒绝新任务、取消队列并等待在运行的计算结束；已取消请求不得在计算后写库或响应。对认证失败使用规范账号键与真实客户端地址两级有限窗口：默认同账号15分钟5次失败、同来源1分钟30次认证尝试，成功不清除其他账号/来源限制。注册与初始化同样经过有界KDF资源门槛，禁止未知账号绕过；计数Map有容量和TTL，不相信X-Forwarded-For，不永久锁账号。

这些是本机单进程限制，进程重启重置计数须如实记录，不能宣称分布式防护。必要时在测试前基于真实环境调整保守阈值并同步契约/断言，不为通过测试无限放宽。至少一轮真实HTTP触发与恢复，边界时间可以在纯规则测试注入时钟，不靠长时间睡眠。

## 6. 本轮路由、响应与最小页面

### 6.1 路由清单

| 方法与路径 | 请求/行为 | 成功及关键失败 |
|---|---|---|
| GET `/knowledge/v1/auth/status` | 只返回setup_required、可用状态等非敏感信息 | 200；存储不可用503；不枚举账号 |
| POST `/knowledge/v1/auth/bootstrap` | owner本机；login_name,password,display_name；timezone可选 | 201安全创建结果，不自动业务登录；已初始化409 |
| POST `/knowledge/v1/auth/register` | 同上字段，但不接收角色；仅初始化后 | 201新member与个人空间安全ID，不自动登录；重名409 LOGIN_NAME_TAKEN |
| POST `/knowledge/v1/auth/login` | login_name,password | 200安全用户资料+Set-Cookie；错凭据统一401 |
| POST `/knowledge/v1/auth/logout` | JSON空对象；撤销当前业务会话 | 204；没有/过期/已撤销会话仍清Cookie并幂等204，来源/专用头仍校验；存储撤销失败不可报成功 |
| GET `/knowledge/v1/me` | 服务端会话确定本人 | 200当前资料/偏好/revision；无效会话401 |
| PATCH `/knowledge/v1/me/preferences` | expected_revision必需；可变字段为display_name、timezone、domains、learning_tracks、goal_text，至少一项 | 200新revision；旧版本409 REVISION_CONFLICT |
| GET `/knowledge/v1/spaces` | 服务端会话确定本人 | 200仅本人有效personal空间及service_id，不枚举他人 |

注册/初始化后可以暂未填写方向，页面明确引导保存；用户提交非空方向与主线时数组至少一项且不得出现未知枚举。domains支持 `software_engineering/system_architecture/hardware_engineering/ai_development`；learning_tracks支持 `engineering_practice/architecture_exam/knowledge_accumulation`。变更方向由本人点击保存表达确认，不自动生成计划、评分或AI建议。

响应沿既定 `{data,meta:{request_id,service_id,server_time}}`，服务端生成ID和UTC时间；错误用code/message/request_id/retryable/safe_details。无效字段422、坏JSON400、body过大413、错误媒体415、不支持方法405+Allow、冲突409、限流429、存储故障503。不得返回credential_ref、password派生记录、token_hash、会话原文、私有路径或堆栈。user_id/role/owner_id/service_id/space_id等身份覆盖字段在正文或不支持的查询中拒绝，不当授权输入。

偏好变更同事务按actor与revision更新；只返回当前用户的安全冲突元数据。目录中的目标API清单不是本轮路由全部实现指令。

### 6.2 页面

`/knowledgeos/account` 提供注册、登录、个人资料/方向目标、个人空间摘要与退出；`/knowledgeos/setup` 为受保护owner初始化页。继续现有React/TypeScript/esbuild体系，按真实构建可分出小账号页bundle；不要套用需要owner壳的完整DSH前端来验证普通用户，也不要另起框架/服务。

按既定冷玉青、企业常用字体、适度圆角、两层以内布局做紧凑中文界面。现有只读面板可加无凭据链接。覆盖加载、未初始化、未配置、输入错误、重名、401过期、429及服务异常；提交期间防重复，错误保留非秘密草稿，密码在成功或退出后清理。

刷新从真实 `/me` 恢复状态；退出或切换账号先清理旧用户缓存并取消/废弃在途请求。迟到响应不得把上一用户资料重新放回页面，不把“页面显示已退出”当会话撤销证据。界面只显示本轮真实能力，不生成六工作区假页面。

## 7. 逐项实现顺序

按顺序形成可测增量：核对契约/写独立预期 → v2迁移和前缀/旧数据保护 → owner一次性初始化 → 普通注册与唯一性 → 登录会话/注销 → 本人偏好与个人空间 → 小账号页与切换清理 → 故障/来源/资源边界 → 构建冻结候选并正式验收。每步立即跑相关正反用例，发现失败先在本轮修复，不累计多个未来功能再测。

允许变更现有插件中identity所需的应用/适配/HTTP文件、Host组合/可信配置、必要客户端页面和构建、实际产物、必要锁定依赖、`scripts/fnd003/`、FND003证据和当前状态。仅因本轮造成的旧链路回归可一并修复；每项记录原因、影响和测试。不改上游固定SHA，不修改旧v1迁移，不改写旧run的通过结果。

## 8. 十二项必测义务

以下与config/work_units.json一一对应。新候选在真实固定版本Node Web Host上测试；受控适配器/时钟/SQLite故障需单独标注，不能冒充真实HTTP或Desktop。

### FND-003-T01：可信本机初始化与管理员唯一性

**前置：** 固定上游的隔离 loopback Host、全新合成业务库、实际 DSH owner 凭据；普通业务上下文不含 DSH 凭据。

1. 匿名、仅业务 Cookie、伪造角色或非 owner Peer 请求初始化均拒绝；非 loopback listener/socket 的判断使用受控适配器用例，不开启公网测试。
2. 有效 owner 在正确来源下初始化；重启后再次初始化应冲突。
3. 两个有效 owner 请求并发初始化；独立查询初始化标记、管理员、凭据和空间。

**断言：** 初始化页及 POST 均要求真实 owner 与本机来源；最多一次成功，管理员/凭据/个人空间/完成标记同事务；普通注册永远不能抢首个管理员。

**证据：** 真实 HTTP 正反对照；并发返回与独立 SQL；初始化前后及重启后标记；来源适配器受控测试单列。

### FND-003-T02：三个独立业务身份注册登录与个人空间

**前置：** 已初始化管理员，两个新普通账号，三个相互隔离且没有 DSH Cookie 的业务客户端。

1. 管理员正常业务登录；甲乙注册后各自登录、退出、重登。
2. 同规范登录名以不同大小写/首尾空白重复或并发注册。
3. 独立核对每个账号唯一凭据和 personal 空间；检查注册不自动登录。

**断言：** 角色由服务端决定，普通账号仅 member；重复注册冲突且不更改旧密码/空间；三个身份和空间互不混入，密码及会话不出现在安全响应。

**证据：** 三个 Cookie jar 的脱敏身份标识；登录/退出/重登 HTTP 记录；唯一性与原子性 SQL；普通账号角色断言。

### FND-003-T03：业务身份与 DSH 宿主权限分离

**前置：** 独立 owner 上下文、仅业务 Cookie 的上下文、匿名上下文，同一真实 Host。

1. 仅 DSH owner Cookie 调 /knowledge/v1/me 和 /spaces；仅业务 Cookie 调初始化与原 status/probe。
2. 仅业务 Cookie 尝试真实 DSH /api 代表性 RPC、/connect 无有效 token、原生文件/插件管理入口；先从固定路由清单选择实际存在路径。
3. 向 me/preferences 和其他身份接口加入 user_id/role/owner_id/service_id/space_id 等禁止字段。

**断言：** 业务会话不注册为 DSH provider/Peer；owner Cookie 不自动产生业务 actor；业务账号不能获得 owner RPC、文件或插件能力，伪造身份字段拒绝且他人数据不变。

**证据：** 实际路由与准入表；干净上下文 Cookie 名清单但不含值；401/403或真实未注册路径404及合法对照；独立数据库前后比较。

### FND-003-T04：会话生成、到期、注销和重启

**前置：** 真实业务会话、可控制时钟的纯规则测试和实际数据库/HTTP验证。

1. 测试伪造令牌、客户端指定会话、同账号再次登录的新令牌及会话固定防护；再次登录或主动切换账号后重放该客户端旧token应拒绝，其他客户端原会话仍有效。
2. 退出后重放旧 Cookie，重复退出；Host 重启后再重放。
3. 在到期边界验证 now>=expires_at；通过隔离合成记录制造到期/撤销/disabled 用户并从真实 HTTP 校验；其他客户端保持有效。

**断言：** 会话原始令牌只在Cookie，库中仅哈希；成功登录在同一事务撤销当前请求携带的有效本系统旧会话并创建新会话，其他客户端不受影响；注销持久化且立即生效，重启不复活。

**证据：** Cookie 属性及哈希存储检查；旧令牌重放/到期 HTTP；重启前后 session 行；受控时间测试注明类型。

### FND-003-T05：来源、防伪、媒体类型与请求界限

**前置：** 真实 Host；注册、登录、退出、偏好更新和初始化各有正确请求对照。

1. 携带有效凭据测试外站 Origin、Origin:null、错误 Host、cross-site、缺 X-KnowledgeOS-Request、自定义头错误及 simple form Content-Type。
2. 验证同源浏览器与可信 CLI 无 Origin 但正确专用头的合法请求；GET 不写入。
3. 确认不放宽 CORS，不凭 Forwarded/X-Forwarded-For 推断本机或安全传输；Connection 缺失/停用时身份能力不放行。

**断言：** 变更使用 JSON、专用请求头及来源防护；不依赖 SameSite 单一控制；拒绝请求不产生账号/会话/偏好写入；已有 FND-002 CLI 约定保持。

**证据：** 跨来源真实 HTTP 矩阵；拒绝前后 SQL 计数；实际 Connection 依赖与缺失时行为；合法浏览器和CLI对照。

### FND-003-T06：领域、目标、私人空间及版本冲突

**前置：** 三个身份各有 personal 空间；偏好由用户主动保存。

1. 选择四领域及三条学习主线，保存中文目标和时区，刷新与重启后读取。
2. 甲乙及管理员分别读取 /me 与 /spaces；向请求夹带其他人的标识。
3. 同一用户两个会话用同一 expected_revision 并发更新，检查冲突与原草稿保留。

**断言：** 四领域/三目标可表达，资料持久保存且仅本人可见；管理员标签不赋予他人私人偏好；一次更新成功另一次409，不静默覆盖，不生成未来计划/评分。

**证据：** 真实页面及HTTP保存/重读；独立 SQL 与重启；并发revision结果；三个身份返回集合。

### FND-003-T07：密码、输入和公开证据保护

**前置：** 明确的 DTO、密码工程默认值、只含合成数据的账号。

1. 验证密码最短/最长、空白与Unicode逐值处理、孤立代理项、错误UTF-8、超限body、未知字段、SQL文本与用户名规范化边界。
2. 验证相同密码不同salt、库中无明文密码或原会话令牌；未知账号与错密码返回同一安全错误。
3. 扫描实际输出/日志/截图/JSON嵌套stdout，确认不含合成秘密原值、Cookie、token、私有绝对路径或数据库旁文件。

**断言：** 成熟异步密码KDF、随机salt与版本参数；不截断/trim密码，不用普通SHA当密码存储；严格参数化与输入限额；证据发布检查覆盖嵌套字符串。

**证据：** KDF参数/版本与行为测试；原始数据库独立检查的脱敏结论；输入边界HTTP；秘密/路径扫描范围与结果。

### FND-003-T08：新库与 v1 到 v2 无损迁移

**前置：** 新合成库、FND-002 v1库含哨兵及幂等记录、未来版本/归属冲突/prefix外来对象fixture。

1. 新库完成v1再v2；旧v1升级，比较v1 SQL/checksum/迁移时间及探针数据，重复启动。
2. 检查v2表、外键、唯一约束、持久service_id；身份表仅在正确版本和归属下接受。
3. 重跑R1四类拒绝和正常对照，增加伪v2/迁移校验不匹配；在修改性配置前拒绝。

**断言：** application_id和v1历史不变，新增原子v2且只执行一次；不删库重建、不换路径、不把用户表自动接管；保留真实探针行为与数据。

**证据：** 迁移前后独立SQL；v1/v2规范checksum；重复启动账本；未知/未来/prefix拒绝与未改库对照。

### FND-003-T09：身份事务失败与恢复

**前置：** 生产同一路径的独立故障fixture；测试注入不经HTTP暴露。

1. 在管理员初始化、普通注册、v2迁移的真实事务中途分别制造确定约束失败。
2. 核对账号/凭据/空间/初始化标记/账本没有部分提交，原v1记录保留。
3. 解除故障通过正常HTTP/启动路径完成操作；COMMIT/ROLLBACK异常按实际驱动策略记录。

**断言：** 失败不创建孤立身份或半初始化；正常恢复不需要清库；KDF不在SQL事务内，异常不伪报成功；测试钩子不发布为请求参数。

**证据：** 失败点与真实SQLite错误；多表/标记原子前后比较；恢复结果；不能构造的故障如实标限制。

### FND-003-T10：登录注册限流与有界KDF负载

**前置：** 冻结的可信限流/KDF并发与队列默认值，隔离Host；计时测试注明实际版本。

1. 同规范账号及不同账号连续失败登录/注册，验证两级限制并观察Retry-After。
2. 并发请求超过KDF并发/等待上限；分别取消排队和已开始计算的HTTP请求，统计真实KDF活动峰值与队列，确认在运行的计算直到回调完成才归还槽位，已取消请求不写库。
3. 受控时钟验证恢复规则，至少一轮真实HTTP触发及恢复；同时调用轻量status观察异步KDF没有长时间同步阻塞。

**断言：** 返回明确429/繁忙且不泄漏账号存在性；无永久锁死、无无界内存或Promise队列；排队取消及时移除，已开始KDF在真实回调完成后释放名额，取消洪泛也不能突破实际2并发；关闭停止新任务且取消结果不写库，恢复后合法登录正常。

**证据：** 真实HTTP限制与合法对照；并发/队列峰值和拒绝记录；受控时钟测试；实际status响应、真实KDF峰值、取消后回调/槽位及无写库证据。

### FND-003-T11：真实账号界面与身份切换

**前置：** 实际Host提供小型账号页与受保护初始化页；owner及三个业务浏览器上下文分离。

1. 真实浏览器完成初始化、普通注册、登录、方向/目标保存、刷新与退出，至少验证甲乙独立上下文。
2. 使用延迟响应构造退出/切换账号期间的旧请求完成，确保页面不恢复上一账号内容。
3. 观察加载、输入失败、未初始化、未配置存储、过期和服务不可用状态；1366x768与1920x1080检查表单。

**断言：** 用户可以真实完成身份闭环；页面遵守既定冷玉青/企业字体/两级以内布局；无owner壳依赖、无六工作区占位；退出清理数据且迟到结果不串号。

**证据：** 浏览器操作和截图；相互隔离上下文证明；迟到响应/过期/失败恢复；真实结果与受控故障分别标记。

### FND-003-T12：构建、真实加载、释放及既有回归

**前置：** 冻结新候选源码、v1/v2迁移、测试、依赖锁、构建产物和实际profile。

1. 运行类型/构建/FND003范围检查，解析profile实际安装目录/导出路径，对照事先冻结的产物SHA；临时不一致副本应失败。
2. 核对卸载关闭、未配置dataDir旧profile、真实面板/status刷新和受影响探针写读/幂等/重启/忙锁与R1回归。
3. 运行计划一致性检查及准确证据链接/脱敏检查，确保没有FND004+实现、没有把历史两表检查改成假通过。

**断言：** 一个受控数据库写连接与正确分层；新旧身份路由不扩大owner权限；构建、实际加载和用户行为各自留证；只更新当前单元，未来功能未激活。

**证据：** 构建/类型/范围命令与退出码；候选及实际安装/加载manifest；不一致负例；生命周期及已有行为回归；计划和证据卫生结果。

## 9. 候选、证据、提交与停止

建立 `docs/evidence/FND-003/` 的任务、架构、测试计划、候选、独立结论和报告。候选须包含实际源码、v1/v2 SQL、测试/故障脚本、依赖锁、实际lib/页面资源与配置的逐文件SHA-256；有未提交或未跟踪文件时不能只写HEAD。实际profile解析使用真实安装目录/导出结果，与预先冻结manifest逐值比较，不能只从依赖spec推断或校验hash长度。

每个新候选运行目录另建，记录真实命令/退出码、开始结束时间、Node/SQLite/profile/端口、合成数据、期望与实际、测试角色和局限。独立验收以原始SQL、HTTP与浏览器行为验证，不能只读取实现者的summary。失败先记录，再修复、重新冻结并重测有影响的项；不删断言或更改产品规则自证通过。

公开证据只保留合成数据与脱敏结果；检查JSON内嵌stdout、路径、Cookie、密码、token和截图。被引用的日志若不发布，明确“原执行机日志未提供，仅公开摘要”，不写成Git已存文件、不从摘要重造日志。FND-002 历史113条断言及旧运行只证明旧候选，本轮十二项各自实际执行。

最低运行门槛是固定版本真实Node Web Host；Desktop/Electron、Windows安装、完整共享ACL、真实模型仍按范围分别记未运行，不新增为本轮阻塞，也不宣称已验证。A02/A03完整场景及F03整项不能提前PASS/verified。

十二项义务全部实际通过、独立复核完成、当前阻碍交付问题关闭且证据可复验后，才更新FND-003：status=passed、test_result_status=PASS、independent_review_status=PASS、completed_test_ids包含全部十二项、open_review_items=[]，补completed_at与真实evidence_paths。execution_state.unit_state=awaiting_user，active_unit仍为FND-003，auto_advance=false。

同步README、PROGRESS、BLOCKERS及当前报告；运行计划检查、本轮范围检查和相关验证，正常提交推送 `codex/knowledgeos-fnd-003` 并回读确认。保留用户无关修改，不force push、不自动合并main、不覆盖前置分支。

真实外部阻塞时先完成当前范围内独立可做工作，记录影响测试、已尝试方案和最小解除条件后交接；未运行/失败/受阻不算通过。旧API额度不构成本轮阻塞。当前代码缺陷继续修复，不能借受阻跳到FND-004。

最终中文报告：实现的实际用户路径、架构/身份准入与迁移落点、关键默认值、十二项测试与独立证据、当前提交和复验方式、未运行范围与剩余问题。然后停止等待用户。可以提出下一单元建议，但不得自动开发完整对象ACL/共享入口或其他后续功能。

## 10. 已核对的官方技术依据

以下为依据，不是另一份执行指令；上游API按固定提交源码核对后使用。

- [固定 WebServer 路由与准入](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/host/webserver/README.md)：handler、auth策略、监听协议与来源授权事件。
- [固定 Connection 来源与认证](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/connection/README.md)：anonymous来源检查、业务身份与owner边界。
- [固定 Token owner 创建](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/host/authentication-token/src/index.ts) 与 [Peer principal](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/connection/src/peer.ts)：必须检查本次准入的peer。
- [Node 24.9 crypto](https://nodejs.org/download/release/v24.9.0/docs/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)：异步scrypt、salt和maxmem。
- [OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[CSRF防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)：安全默认值与JSON自定义头方案。
