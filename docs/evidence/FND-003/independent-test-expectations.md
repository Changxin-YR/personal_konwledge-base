# FND-003 独立测试预期（测试角色草案）

更新：2026-11-17（Asia/Shanghai）
角色：独立测试（实现前预期）
状态：全部 NOT_RUN；本文件只冻结预期，不构成产品通过证据。

## 固定环境与证据规则

- 候选分支：codex/knowledgeos-fnd-003；上游固定 SHA：39163dd30f703a79079e2d2446545cff3c453738。
- 实际运行前报告 Node、SQLite、pnpm、浏览器、Windows 版本，使用 .cache/dsh-home-fnd003、profile knowledgeos-identity-test、隔离数据目录和端口（默认 3101）。
- Host/HTTP/SQLite/浏览器结果分开记录；受控适配器、注入时钟、事务故障和非 loopback 判定不能替代真实 HTTP。
- 每项保存：candidate commit/工作树指纹、上游 SHA、命令、退出码、起止时间、输入样本标识、身份上下文、预期、实际、结论、脱敏证据路径。秘密、Cookie 原值、令牌、密码、绝对私有路径不得出现在证据。
- 结论严格使用 PASS、FAIL、BLOCKED、NOT_RUN；测试角色不能用实现者口头摘要替代真实运行。

## 测试入口约定

实现后预计提供 scripts/fnd003/run-all.mjs（或等价单项脚本）和 scripts/fnd003/scope-check.mjs。命令模板：

  node scripts/fnd003/run-all.mjs --out docs/evidence/FND-003/runs/<candidate> --run-id <id> --port 3101
  node scripts/fnd003/run-all.mjs --only T01,T02 ...
  node scripts/fnd003/scope-check.mjs
  node packages/knowledgeos-panel/build.mjs
  node packages/knowledgeos-panel/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json
  node scripts/verify-plan.mjs

若实现没有提供同名入口，记录实际替代命令与原因，不把计划命令写成已执行。

## T01 可信本机初始化与管理员唯一性

真实 HTTP：隔离 loopback Host/全新库，owner 凭据、匿名、业务 Cookie、伪造角色、非 owner 上下文分别请求 setup/bootstrap；正确来源及专用请求头的 owner 成功一次，重启后再次 bootstrap 409，普通 register 在初始化前 409 SETUP_REQUIRED。两个 owner 并发只有一个 201，另一个 409；独立只读 SQLite 校验 service_identity 单例、admin user、credential、personal space、initialized_at 一致。

受控验证：非 loopback listener/socket 与 admitted peer 分类、缺 Connection/owner 依赖的拒绝。证据：真实请求矩阵、并发状态、重启标记、SQL 脱敏结论。预期：最多一个管理员且无 DSH 凭据泄露；当前未运行。

## T02 三个独立业务身份注册登录与个人空间

真实 HTTP：管理员登录；成员甲乙注册（注册不自动建立业务 Cookie）、分别登录、logout、重登；规范登录名大小写/首尾空白重复和并发注册只保留一个账号并返回 409 LOGIN_NAME_TAKEN。三套不带 DSH Cookie 的客户端 Cookie jar 互相独立；SQLite 校验三 users、三 credentials、三 personal spaces 及 member role。

证据：Cookie 名/脱敏哈希标识、响应字段、角色/空间集合、旧密码与空间未改变。预期：不返回 password/credential/token；当前未运行。

## T03 业务身份与 DSH 宿主权限分离

真实 HTTP：owner Cookie 调 /knowledge/v1/me、/spaces 应为未登录业务身份；仅业务 Cookie 调 bootstrap 与原 status/probe，选择固定上游实际存在的 /api、/connect、文件/插件入口作代表性拒绝或 404；业务 Cookie 不得变成 DSH Peer。me/preferences 等正文加入 user_id/role/owner_id/service_id/space_id 应拒绝且数据库不变。

证据：实际路由和准入表、Cookie 名清单（无值）、授权前后 DB diff。owner/业务/匿名三上下文结果分开；当前未运行。

## T04 会话生成、到期、注销和重启

真实 HTTP/DB：登录令牌只出现在 HttpOnly Cookie，数据库仅 SHA-256 token_hash；客户端指定 session_id/伪造令牌拒绝。相同账号同客户端再次登录撤销该客户端旧会话并创建新令牌，其他客户端会话仍有效；logout 持久化，重复 logout 清 Cookie 且 204，重启后旧令牌仍失效。隔离 DB/时钟验证 now >= expires_at、disabled/revoked 会话拒绝。

受控验证：纯规则时钟和合成 session 行；不冒充真实 HTTP。证据：Set-Cookie 属性、session 行脱敏摘要、重启前后 HTTP；当前未运行。

## T05 来源、防伪、媒体类型与请求界限

真实 HTTP：bootstrap/register/login/logout/preferences 的正确 JSON + X-KnowledgeOS-Request: 1 + 精确 listener Origin 成功；外站/null/malformed Origin、错误 Host、缺/错专用头、simple form Content-Type、Forwarded/X-Forwarded-For 伪造均拒绝（403/415 等约定码），拒绝前后 SQL 行数不变。GET 不写入；无 Origin 的可信 CLI 在正确 Host/专用头下可用。禁用或缺少真实 Connection 时身份路由不可用。

证据：跨来源矩阵、拒绝前后计数、Connection 依赖输出；当前未运行。

## T06 领域、目标、私人空间及版本冲突

真实 HTTP/页面：管理员、甲、乙各自读取 /me /spaces，保存四领域 software_engineering/system_architecture/hardware_engineering/ai_development、三主线 engineering_practice/architecture_exam/knowledge_accumulation、中文目标与有效 IANA 时区；刷新和 Host 重启后保留。两个会话同 expected_revision 并发更新，一次 200、一次 409 REVISION_CONFLICT；原数据不静默覆盖；夹带他人标识拒绝。

证据：真实页面/API 保存与重读、独立 SQLite、并发响应及三个身份返回集合；当前未运行。

## T07 密码、输入和公开证据保护

真实 HTTP/纯规则：密码 15–128 Unicode 码点且 UTF-8 <=512；空格与大小写保留，非法 Unicode/孤立代理/坏 UTF-8、超 16 KiB body、未知字段、SQL 文本、用户名规范化边界按契约处理。相同密码不同随机 salt；未知账号与错密码同 401 INVALID_CREDENTIALS，dummy KDF 不暴露枚举。数据库无明文密码/原 token；stdout/日志/JSON/截图/证据扫描无密码、Cookie、token、私有绝对路径。

证据：KDF 版本/N/r/p/maxmem、输入响应矩阵、脱敏 SQL/扫描报告；当前未运行。

## T08 新库与 v1→v2 无损迁移

真实 SQLite/Host：新库 v1→v2、现有 v1（含探针哨兵）升级，校验 application_id、v1 checksum/账本/记录、WAL/foreign_keys/synchronous/busy_timeout；重复启动只校验不重复迁移。v2 五表、外键、唯一约束、持久 service_id 正确。future/wrong app/bad checksum/unknown object/sqliteX_ 外来对象/伪 v2 fixture 在任何修改前拒绝，旧库字节/SQL 逻辑状态不变。

证据：迁移前后独立 SQL、规范 checksum、拒绝 fixture 及未改库证明；当前未运行。

## T09 身份事务失败与恢复

受控测试层沿生产事务路径注入初始化、注册、v2 迁移确定约束失败；不得通过 HTTP 参数暴露。验证 users/credentials/spaces/service_identity/ledger 无孤立或半提交，原 v1 数据保留；解除注入后正常 HTTP/启动完成。记录 SQLite 错误、COMMIT/ROLLBACK 实际行为、KDF 在事务外且取消不写库。无法构造的 OS/Host 级故障单独记未运行；当前未运行。

## T10 登录注册限流与有界 KDF 负载

真实 HTTP：同账号 15 分钟 5 次失败、同来源 1 分钟 30 次认证尝试后 429 AUTH_RATE_LIMITED + Retry-After；不同账号与合法成功请求不泄露存在性。并发超过 2 running + 8 queued 触发拒绝；排队取消移除，已开始 scrypt 在回调前持续占槽，取消请求不写 DB；轻量 status 不被同步 KDF 阻塞。受控时钟检查 TTL/恢复，真实 HTTP 至少触发一次并恢复。

证据：请求计数/峰值、Retry-After、活动 KDF/队列、取消后 DB 行数、status 延迟；当前未运行。

## T11 真实账号界面与身份切换

真实浏览器：owner setup、管理员/甲/乙注册登录、保存偏好、刷新、logout，至少两个隔离浏览器上下文；1366x768/1920x1080检查冷玉青色调、企业字体、两级布局、加载/未初始化/未配置/输入错误/重名/401/429/503。延迟响应在 logout/切换期间返回不能恢复旧用户资料；密码草稿在成功或退出后清理。截图与浏览器步骤脱敏保存；当前未运行。

## T12 构建、真实加载、释放及旧链路回归

冻结源码/测试/依赖锁/构建产物和实际 profile manifest，记录逐文件 SHA；build/typecheck/scope/plan 命令退出码必须可复验。profile 实际加载目录与冻结 manifest 逐值匹配，篡改临时副本失败。Host 关闭/重启释放连接；未配置 dataDir 仍让旧 status/probe 行为准确返回；FND-002 读写/幂等/忙锁/R1 回归通过。确认没有 FND-004+实现、没有把历史两表检查改写成假通过；当前未运行。

## 当前独立测试结论

十二项均为 NOT_RUN，直到实现者冻结候选、提供实际命令和运行目录。测试角色将在候选上独立执行全部适用项，逐项给出退出码和脱敏原始证据；任何 FAIL/BLOCKED/NOT_RUN 保持原状态，不计入 FND-003 PASS。

