# FND-004 中文验收报告

日期：2026-11-18（Asia/Shanghai）
执行提示词：3.2.2
工作分支：`codex/knowledgeos-fnd-004`
修正基线：`518ce35a51ef07623480bc8cd75dc0e93262557d`

## 结果

本轮关闭 v3.2.2 的两个最终权限生命周期问题。R1 已修正为项目对象先要求当前有效 membership，再检查逐动作 grant；成员资格到期后，即使 actor 是对象创建者，GET、列表、action、PATCH、DELETE 都拒绝，个人空间所有者规则保持不变。R2 已通过无损 v4 迁移修正：v1/v2/v3 SQL 与 checksum 保留，旧 grant 行继续保留 `revoked_at`，重新授权插入新有效行，部分唯一索引保证同一对象/主体/动作不会有两个同时有效记录。

固定 DSH Host 上使用真实登录和三个隔离业务 Cookie 完成 T01–T07；独立 Host 复核 R1/R2、历史 SQL 和高权限入口；FND-001～003 受影响回归、重启、v3→v4 升级和故障回滚均通过。FND-004 状态为 `passed` / `awaiting_user`，FND-005 仅保留设计，未激活或自动开发。

## 单项状态

| 项目 | 状态 | 证据 |
|---|---|---|
| FND-004-T01 个人对象和三 Cookie 隔离 | PASS | `runs/final-20261118/FND-004-T01.json` |
| FND-004-T02 八类动作矩阵 | PASS | `runs/final-20261118/FND-004-T02.json` |
| FND-004-T03 项目成员、跨项目、R1 到期后五类操作 | PASS | `runs/v322-candidate/FND-004-T03.json` |
| FND-004-T04 到期、撤权、竞态、R2 重新授权 | PASS | `runs/v322-candidate/FND-004-T04.json` |
| FND-004-T05 v4 失败回滚、v3 升级、伪造 schema、恢复 | PASS | `runs/v322-candidate/FND-004-T05.json` |
| FND-004-T06 DSH 高权限入口探测 | PASS | `runs/v322-candidate/FND-004-T06.json` |
| FND-004-T07 构建产物和候选绑定 | PASS | `runs/v322-candidate/FND-004-T07.json` |
| 独立真实 HTTP/SQL 复核 | PASS | `independent/v322-candidate/summary.json` |
| FND-001～003 受影响回归 | PASS | `runs/v322-affected-regression/summary.json` |
| 旧 FND-002 v1-only 检查器 | FAIL（历史检查器契约过时） | `runs/fnd002-regression-20261118/T01.json` |

R1 真实 HTTP 证据为乙创建项目对象后 membership 到期，GET、列表、action、PATCH、DELETE 分别为 `404/200(不含对象)/404/404/404`，对象 SQL 状态仍为 `active`。R2 真实 HTTP/SQL 证据为撤权后 GET `404`、重新授权 `201`、读取恢复 `200`，历史两行中旧行 `revoked_at IS NOT NULL`、新行 `revoked_at IS NULL`，有效行数为 `1`。T05 注入 v4 故障后回滚到 user_version `3`/账本 `3`，正常恢复到 `4`/`4`，已有 v3 数据库升级且前三条 checksum 不变。

类型检查、构建、计划检查、T01–T07、独立复核和受影响回归均通过。旧 FND-002 v1-only 检查器及此前 3.2.1 证据继续保留为历史材料，不改写为本候选结果。完整 A02/A34/A46 以及搜索、AI、导出、邀请码、完整缓存路径仍为 `NOT_RUN`。Connection 独立停用/恢复仍为 `BLOCKED`，未用 Host 整体停止替代。

## 真实环境

- DSH 上游固定提交：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）。
- Host：loopback；专用共享 profile：`knowledgeos-identity-test`；业务 Cookie 不能访问 owner status、RPC、Shell、文件、插件或 Session 附件入口。
- 真实 HTTP 证据不使用手工 actor，不以源码包含路由名代替请求。

## FND-005 边界

FND-005 只允许设计记录，未激活、未编码、未改变 `active_unit`。FND-004 当前状态为 `passed` / `awaiting_user`，等待用户选择下一单元。
