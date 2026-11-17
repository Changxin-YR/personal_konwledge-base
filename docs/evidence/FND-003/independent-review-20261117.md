# FND-003 独立复核

> 提交后复核：以下保留b1ff9ae提交时的报告与PASS声明。后续独立复核发现真实缺陷和必测缺口，当前FND-003已重新进入返修；本报告不代表当前完成状态。见 [提交复核](SUBMISSION_REVIEW_20261117.md)。

日期：2026-11-17（Asia/Shanghai）  
复核角色：Codex 独立测试  
候选主运行：`fnd003-candidate-20261117-r2`（原始 T01–T12）  
最终候选：`fnd003-candidate-20261117-r10`（状态与构建产物重新冻结）  
独立补充运行：`independent-20261117-r5`

独立补充命令：

```text
node packages/knowledgeos-panel/build.mjs
node scripts/fnd003/independent-verification.mjs --run-id independent-20261117-r5 --port 3115 --out docs/evidence/FND-003/runs/independent-20261117-r5
```

独立补充运行退出码为 0，汇总证据见 [summary.json](runs/independent-20261117-r5/summary.json)。该运行对原始候选未充分覆盖的边界逐项复核：loopback 地址分类、`now >= expires_at`、客户端指定 session id、注册/登录/退出/偏好来源矩阵、跨身份空间隔离、密码与用户名边界、坏 UTF-8、伪 v2 schema 拒绝且原库不变、重复注册事务结果、真实 HTTP 取消、浏览器迟到 `/me` 响应与退出竞态。以上九项均为 `PASS`；真实 HTTP 取消后用户数为 0，状态接口仍以 3ms 返回；浏览器退出后状态为“已退出”且个人区块隐藏。

原始候选 T01–T12 的真实验收汇总见 [summary.json](runs/fnd003-candidate-20261117-r2/summary.json)。结合原始真实 HTTP、SQLite、浏览器、迁移、构建和回归证据，以及本次独立补充复核，FND-003 的十二项测试结论为：

| 项目 | 独立复核结论 | 证据 |
|---|---|---|
| T01 | PASS | 原始 T01 + `T01-adapter` |
| T02 | PASS | 原始 T02 |
| T03 | PASS | 原始 T03 |
| T04 | PASS | 原始 T04 + `T04-gap` |
| T05 | PASS | 原始 T05 + `T05-gap` |
| T06 | PASS | 原始 T06 + `T06-gap` |
| T07 | PASS | 原始 T07 + `T07-gap` |
| T08 | PASS | 原始 T08 + `T08-gap` |
| T09 | PASS | 原始 T09 + `T09-gap` |
| T10 | PASS | 原始 T10 + `T10-gap` |
| T11 | PASS | 原始 T11 + `T11-gap` |
| T12 | PASS | [最终候选 T12](runs/t12-check-r10/summary.json)；构建产物、状态和候选 manifest 一致 |

复核结论：`independent_review_status=PASS`。本文件只记录 FND-003；没有将任何 FND-004 或完整产品审查标为已执行。
