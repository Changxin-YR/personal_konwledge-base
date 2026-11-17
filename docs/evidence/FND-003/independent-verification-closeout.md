# FND-003 独立复核结论

> 提交后复核：以下保留b1ff9ae提交时的报告与PASS声明。后续独立复核发现真实缺陷和必测缺口，当前FND-003已重新进入返修；本报告不代表当前完成状态。见 [提交复核](SUBMISSION_REVIEW_20261117.md)。

日期：2026-11-17（Asia/Shanghai）  
复核角色：独立测试代理  
候选基线：`fnd003-candidate-20261117-r2`  
独立运行：`docs/evidence/FND-003/runs/independent-20261117-r5/summary.json`

独立脚本 `scripts/fnd003/independent-verification.mjs` 在隔离端口 `3115`、固定 DSH Host 和隔离业务目录中运行，结果为 `PASS`。全部独立缺口检查通过：

- T01-adapter：IPv4、映射 IPv4、IPv6 loopback 判断及非 loopback 拒绝。
- T04-gap：到期边界立即拒绝、客户端自带 `session_id` 拒绝、数据库 token hash 为 64 位。
- T05-gap：注册、登录、退出和偏好变更拒绝外部 Origin。
- T06-gap：两个业务身份的 actor 与 personal space 相互隔离，跨身份字段被拒绝。
- T07-gap：边界输入、密码空格、无效 UTF-8 和长度校验。
- T08-gap：伪 v2 schema 被拒绝且 fixture 保持不变。
- T09-gap：重复注册返回 `LOGIN_NAME_TAKEN`，原管理员与首个普通账号均保留。
- T10-gap：真实 HTTP 客户端 `ECONNRESET` 后取消 KDF，`cancelled` 用户数为 0，状态接口仍返回 200（3ms）。
- T11-gap：Playwright 延迟 `/me` 响应与真实 UI 退出并发时，最终状态为“已退出”，个人资料保持隐藏。

复核期间发现并修复了服务端响应断开后的取消信号遗漏：`requestSignal` 现同时监听请求和未完成响应的 `close`，并将响应对象传入 bootstrap、register、login。修复后 T10 独立复核通过。T11 使用真实账号页退出按钮复核迟到响应竞态，结果通过。

结论：独立复核 `PASS`。没有 `FAIL`、`BLOCKED` 或 `NOT_RUN` 的独立结果。
