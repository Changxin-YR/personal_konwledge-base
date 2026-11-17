# FND-003 验收报告

更新：2026-11-17（Asia/Shanghai）  
候选：`fnd003-candidate-20261117-r10`  
固定上游：`39163dd30f703a79079e2d2446545cff3c453738`  
工作分支：`codex/knowledgeos-fnd-003`

本轮实现了可信本机首次管理员初始化、普通账号注册/登录/退出、独立业务 Cookie 会话、12 小时到期与持久撤销、个人方向/学习主线/目标/时区、personal space、最小账号页，以及 v1→v2 SQLite 无损迁移。DSH owner 凭据只用于受保护初始化，KnowledgeOS 业务账号由独立 `auth_sessions` 会话识别。

## 验收命令

| 项目 | 命令 | 退出码 |
|---|---|---:|
| 类型检查 | `npm run typecheck`（`packages/knowledgeos-panel`） | 0 |
| 构建 | `npm run build`（`packages/knowledgeos-panel`） | 0 |
| 计划检查 | `node scripts/verify-plan.mjs` | 0 |
| 范围检查 | `node scripts/fnd003/scope-check.mjs` | 0 |
| 十二项真实验收 | `node scripts/fnd003/run-all.mjs --out docs/evidence/FND-003/runs/fnd003-candidate-20261117-r2 --run-id fnd003-candidate-20261117-r2 --candidate fnd003-candidate-20261117-r2` | 0 |
| 独立缺口复核 | `node scripts/fnd003/independent-verification.mjs --out docs/evidence/FND-003/runs/independent-20261117-r5 --run-id independent-20261117-r5 --port 3115` | 0 |
| 最终候选 T12 复核 | `node scripts/fnd003/run-all.mjs --only T12 --out docs/evidence/FND-003/runs/t12-check-r10 --run-id t12-check-r10 --candidate fnd003-candidate-20261117-r10 --manifest docs/evidence/FND-003/candidate-manifest.json --port 3101` | 0 |

环境为 Node `24.22.0`、SQLite `3.53.4`、固定 DSH Host、profile `knowledgeos-identity-test`、隔离端口 `3101`、隔离 home `.cache/dsh-home-fnd003`。所有账号、密码和目标均为合成数据；原始 token、密码、绝对路径均未写入公开证据。

## T01–T12 结果

十二项均为 `PASS`，原始逐项证据位于 [runs/fnd003-candidate-20261117-r2](runs/fnd003-candidate-20261117-r2)：

- T01：owner loopback 初始化并发只有一个成功者，重启后重复初始化返回 `ALREADY_INITIALIZED`，独立 SQL 确认一套管理员/凭据/个人空间。
- T02：管理员、甲、乙三个业务身份独立注册、登录、退出和重登；规范化重名冲突；注册不自动登录。
- T03：owner Cookie 不创建业务 actor；业务 Cookie 无 DSH status/RPC/连接能力；身份覆盖字段被拒绝且数据库不变。
- T04：会话 token 只在 Cookie，数据库只保存 64 位 SHA-256；旧会话替换、注销、到期、disabled 用户和重启后的拒绝均通过。
- T05：Origin、Host、Fetch-Metadata、专用请求头和 JSON Content-Type 矩阵通过；Forwarded/X-Forwarded-For 不替代真实 socket 来源。
- T06：四领域、三学习主线、中文目标、时区和个人空间持久化；两个会话同 revision 一次成功、一次 `REVISION_CONFLICT`。
- T07：scrypt `N=131072,r=8,p=1,maxmem=192MiB`、随机 16B salt、32B derived key、输入边界和公开证据扫描通过。
- T08：新库 v1→v2、已有 v1 升级、重复启动及 future/wrong-app/checksum/unknown/prefix fixture 拒绝通过；v1 哨兵保留。
- T09：身份多表事务约束故障完整回滚，正常初始化恢复；迁移故障保持空库且不伪报成功。
- T10：真实 HTTP 登录限流返回 `429` 和 `Retry-After: 60`；KDF 实际峰值不超过 2 running、8 queued，取消/超限结果不写库。
- T11：真实浏览器完成 setup、注册、登录、偏好保存、刷新、退出，并以第二浏览器上下文验证身份隔离；保留 1366×768 与 1920×1080 截图。
- T12：构建、类型、计划、范围、候选 manifest、实际 profile 加载、篡改负例、关闭/重启、FND-002 status/records 回归均通过。

## 候选与独立复核

逐文件 SHA-256 冻结清单为 [candidate-manifest.json](candidate-manifest.json)。整套运行摘要为 [summary.json](runs/fnd003-candidate-20261117-r2/summary.json)。独立复核结论见 [independent-review-20261117.md](independent-review-20261117.md) 和 [independent-verification-closeout.md](independent-verification-closeout.md)，原始摘要为 [independent-20261117-r5/summary.json](runs/independent-20261117-r5/summary.json)。每个 JSON 只保存脱敏状态、HTTP 状态码、SQL 计数和路径标签；截图只含合成账号。

账号页已加入请求代次保护，退出或切换后迟到结果不会恢复旧资料；独立 Playwright 复核验证了真实退出按钮路径。服务端请求取消信号同时绑定请求与未完成响应的 `close`，独立 HTTP 复核确认客户端断开后不会写入账号。

未验证范围：完整 F03 需求、完整 ACL/共享入口、资料/计划/评分/RAG/jobs/outbox、Windows 安装和完整产品审查均不属于本单元。FND-004 未开发。
