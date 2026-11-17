# FND-003 架构说明

更新：2026-11-17（Asia/Shanghai）  
指令：CODEX_START.md v3.1.1；active_unit=FND-003；auto_advance=false  
最终候选：fnd003-candidate-20261117-r16  
固定上游：39163dd30f703a79079e2d2446545cff3c453738

本单元实现 F03 的身份与个人偏好切片：可信 loopback DSH owner 一次性初始化、普通 member 注册/登录/退出、独立业务会话、本人方向/主线/目标/时区、personal space、账号页和 v1→v2 SQLite 身份迁移。FND-004 及资料、计划、模型、ACL 全量范围未激活。

## 实际调用链

- Host 组合根注入 connection 与 connection.authentication，身份路由在 Connection 生命周期内注册；可用性同时要求真实 WebServer origin、loopback listener 和实际 socket。缺失、停用或非 loopback 不匿名降级。
- bootstrap 使用 auth: required，再检查 admitted owner、loopback listener/socket、来源、专用请求头和 JSON；KDF 在事务外，随后以短事务写入 service_identity、users、password_credentials、spaces。
- register/login/logout/me/preferences/spaces 使用精确 auth: anonymous 路由；业务 Cookie 只生成 KnowledgeOS actor，不注册为 DSH provider。所有身份 API 在统一 dispatch 中拒绝 query 参数。
- 偏好只接受本人 actor 和 expected_revision；bootstrap/register DTO 仅含 login_name、password、display_name、可选 timezone，方向/主线/目标通过 /me/preferences 保存。
- 账号页在退出/切换开始时清空资料、草稿、revision 与密码并禁用保存；以 generation 丢弃迟到 /me 响应，成功加载新身份后才重新启用编辑。

## 存储、约束与恢复

v1 账本与探针数据保留；v2 增加 service_identity、users、password_credentials、auth_sessions、spaces。启动前真实核验列、类型、NOT NULL、PK、UNIQUE、FK、CHECK、账本、application_id、user_version 和未知对象；伪 v2 或不兼容库在修改性 PRAGMA 前拒绝且保持原库不变。bootstrap、register 与 v2 migration 均有生产入口中途故障注入，失败回滚后可通过正常 HTTP/启动路径恢复。

密码使用异步 scrypt（N=131072、r=8、p=1、maxmem=192MiB，salt 16B，derived key 32B）；最多 2 个真实运行任务和 8 个排队任务。来源认证尝试在 DTO 后、KDF 前计数，成功/失败注册与登录均计入，账号失败计数独立，429 的 Retry-After 使用当前窗口剩余时间。

## 验证边界

真实固定 DSH Host、真实 HTTP、真实业务 SQLite、真实 Chrome 浏览器分别留证；受控适配器仅用于 IPv4/IPv6、非 loopback、故障注入等无法安全改动生产监听的反例。完整结果见最终候选和独立复核报告。FND-004 未开发。
