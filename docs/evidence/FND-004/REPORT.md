# FND-004 中文验收报告

日期：2026-11-18（Asia/Shanghai）
执行提示词：3.2.1
工作分支：`codex/knowledgeos-fnd-004`
审查基线：`d2ad59e470e699b10a3db605134959f05c0e80b2`

## 结果

上一候选的 PASS 因跨项目创建权限和撤权请求契约未关闭而失效。本轮按 3.2.1 重新打开后已完成修复，并在固定 DSH Host 上用真实登录和三个隔离业务 Cookie 完成最终 T01–T07，独立复核与 FND-001～003 受影响回归均 `PASS`。项目对象创建现在检查目标 project 的 service/status、当前时刻有效 membership 和创建权限；非成员不能通过创建对象获得项目授权。撤权路由接受 `grant_id`，按 `manage_share` 校验并用未撤销条件更新；撤权后下一次 HTTP GET、列表和 action 立即重新判权。对象 `expected_revision` 冲突返回 `409 REVISION_CONFLICT`。

## 单项状态

| 项目 | 状态 | 证据 |
|---|---|---|
| FND-004-T01 个人对象和三 Cookie 隔离 | PASS | `runs/final-20261118/FND-004-T01.json` |
| FND-004-T02 八类动作矩阵 | PASS | `runs/final-20261118/FND-004-T02.json` |
| FND-004-T03 项目成员、跨项目和跨 service | PASS | `runs/final-20261118/FND-004-T03.json` |
| FND-004-T04 到期、撤权、竞态和 409 | PASS | `runs/final-20261118/FND-004-T04.json` |
| FND-004-T05 v3 失败回滚、伪造 schema、恢复 | PASS | `runs/final-20261118/FND-004-T05.json` |
| FND-004-T06 DSH 高权限入口探测 | PASS | `runs/final-20261118/FND-004-T06.json` |
| FND-004-T07 构建产物和候选绑定 | PASS | `runs/final-20261118/FND-004-T07.json` |
| 独立真实 HTTP 复核 | PASS | `independent/final-20261118/summary.json` |
| FND-001～003 受影响回归 | PASS | `runs/affected-regression-final-20261118/summary.json` |
| 旧 FND-002 v1-only 检查器 | FAIL（历史检查器契约过时） | `runs/fnd002-regression-20261118/T01.json` |

最终候选已冻结并完成复验。类型检查、构建、计划检查及三组运行命令退出码均为 `0`。旧 FND-002 检查器的失败没有被隐藏或转写为 PASS；它把累计 v3 schema 错判为 v1-only，当前候选使用新的受影响回归脚本验证 v1/v2 账本、记录持久化和事务回滚。完整 A02/A34/A46 及搜索、AI、导出、邀请码、完整缓存路径仍为 `NOT_RUN`。Connection 独立停用/恢复为 `BLOCKED`，未用 Host 整体停止替代。

## 真实环境

- DSH 上游固定提交：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）。
- Host：loopback；专用共享 profile：`knowledgeos-identity-test`；业务 Cookie 不能访问 owner status、RPC、Shell、文件、插件或 Session 附件入口。
- 真实 HTTP 证据不使用手工 actor，不以源码包含路由名代替请求。

## FND-005 边界

FND-005 只允许设计记录，未激活、未编码、未改变 `active_unit`。FND-004 当前状态为 `passed` / `awaiting_user`，等待用户选择下一单元。
