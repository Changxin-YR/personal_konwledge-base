# FND-003 架构说明

更新：2026-11-17（Asia/Shanghai）  
指令：CODEX_START.md v3.1.0；工作单元 FND-003；唯一产品代码写者：主管 Codex  
起始快照：分支 `codex/knowledgeos-fnd-003`，HEAD `3535f16b1a429d32cd2c80f6c1462ce556fcb509`，工作区初始干净；固定上游 `39163dd30f703a79079e2d2446545cff3c453738`。

## 目标与边界

本轮只实现 F03 的身份与个人偏好切片：可信 loopback DSH owner 首次初始化、普通 member 注册/登录/退出、独立业务会话、本人方向/主线/目标/时区、personal space、最小账号页，以及同一业务 SQLite 的 v1→v2 无损迁移。完整 ACL、邀请、资料/计划/模型、FND-004 以后均不实现。

## 实际调用链

- 可信初始化：DSH `WebServer` exact route `auth: required` → Connection 已完成 Host/Origin/Fetch-Metadata 来源准入 → handler 检查 admitted `peer.principal.kind === "owner"`、listener/socket loopback、专用请求头和 JSON → 应用 bootstrap 用例 → 异步 scrypt（事务外）→ SQLite 同一短事务写 service_identity、users、password_credentials、spaces。
- 普通业务：WebServer exact routes `auth: anonymous` → 同源/Host/Origin/Fetch-Metadata 与自定义头校验 → 业务 Cookie token hash 查 auth_sessions/users 生成可信 actor → 应用用例 → SQLite。
- 领域偏好：actor 只来自服务端会话；请求体禁止 user_id/role/owner_id/service_id/space_id 覆盖；preferences 使用 expected_revision 乐观锁。
- 客户端：账号页面只调用精确 `/knowledge/v1` 路由；不加载 DSH owner 壳，不把业务 Cookie 注册为 Connection provider。

## 分层与新增文件

- 领域/用例层：`src/host/identity.ts`，只含 DTO、枚举、验证、actor、会话/偏好规则，不导入 React、Cordis、SQLite 或 node:http。
- 传输层：`src/host/identity-http.ts`，负责方法、来源、JSON、body 限制、错误映射、Cookie；不写 SQL。
- 适配层：`src/host/storage.ts` 扩展 v2 schema、迁移、密码凭据、sessions/users/spaces 查询写入，仍只持有一个 `DatabaseSync`。
- 组合根：`src/host/index.ts` 注册精确身份/账号资源与生命周期，复用旧 status/records。
- 客户端：现有 `Panel.tsx` 提供账号页入口；账号页 HTML 与最小交互脚本由 Host 资源返回，保留现有面板。
- 测试：`scripts/fnd003/` 只使用合成账号、隔离 home/profile/port/dataDir；故障注入仅测试导出，不经 HTTP。

## 数据与迁移

保留 v1 的 `schema_migrations`、`storage_probe_records`、checksum `033dcf95cd9e7c6e4fa964804de7944c1b99daa4b4acd5b92708555cb15dc84a`。v2 追加一个版本账本行和五类表：`service_identity`、`users`、`password_credentials`、`auth_sessions`、`spaces`。新库按 v1→v2；现有 v1 先只读核验 app id/version/对象/ledger，再在原连接的短事务内新增 v2；重启只校验 v2。保留 WAL、foreign_keys、synchronous=FULL、busy_timeout=250ms、application_id=0x4B4F5331。未知/未来/错配对象、字面 `sqlite_` 前缀保护、ledger/checksum 不匹配均拒绝且不自动修复。

## 密码、会话和来源默认值

Node 24 异步 `crypto.scrypt`，N=131072、r=8、p=1、salt≥16B、derived key=32B、maxmem=192MiB；最多 2 个运行、8 个排队。业务 token 为 CSPRNG 32B，数据库仅 SHA-256，12h absolute expiry，Cookie HttpOnly + SameSite=Strict + Path=/knowledge/v1 + loopback HTTP 开发模式不设 Secure，HTTPS 才 Secure。成功登录只撤销本请求携带的有效旧会话；注销持久写 revoked_at 且幂等 204。变更请求要求 JSON 与 `X-KnowledgeOS-Request: 1`；Origin 必须精确 listener origin，CLI 可省略 Origin 但仍需 Host/专用头。

## 风险与独立检查

DSH owner 与业务 actor 始终分离；业务 Cookie 不进入 Connection provider。真实 HTTP、独立 SQL、重启、并发、浏览器与受控非 loopback/时钟/事务故障分别留证。HTTP 请求取消会传入 KDF，并在写库前再次检查；插件销毁等待 KDF 调度器关闭。所有结论严格为 PASS/FAIL/BLOCKED/NOT_RUN；本说明不构成产品通过结论。
