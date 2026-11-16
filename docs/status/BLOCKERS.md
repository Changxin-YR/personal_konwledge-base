# 阻塞与剩余限制

更新：2026-11-16。FND-002 当前单元已通过，状态为 `awaiting_user`；没有当前交付阻塞。

R1/R2 已关闭，证据分别见 `docs/evidence/FND-002/runs/codex-takeover-r1/r1-regression.json`、`docs/evidence/FND-002/runs/codex-takeover-20261116-r2/` 及主报告。

以下限制如实保留为 NOT_RUN 或不能证明：Desktop/Electron 探针、Windows 安装/升级/卸载、突然断电零丢失、OS 级 fd 泄漏、Host 级迁移故障注入和回滚自身失败故障构造；它们不阻塞本轮 Node Web Host 单元收口。正式账号/ACL、多用户协作、真实 GPT、RAG、jobs/outbox、FND-003+ 仍未激活。

用户已明确旧 API 额度问题不属于本轮范围，不登记为 blocker。完成本轮后停止，等待下一条明确指令。
