# 当前收口问题

更新：2026-11-17（Asia/Shanghai）。FND-003 六项返修已关闭，没有当前单元阻塞；最终候选 `r21` 与独立复核 `r13` 已绑定。不存在 FAIL、BLOCKED 或 NOT_RUN 被计入 PASS 的情况。

| 编号 | 状态 |
|---|---|
| FND003-R1 | CLOSED；普通身份路由统一要求真实已绑定 loopback listener、origin 和活跃 Connection；IPv4/IPv6/mapped IPv6 生产解析与反例通过 |
| FND003-R2 | CLOSED；来源限流、动态 Retry-After、KDF 运行/排队取消与恢复已验证 |
| FND003-R3 | CLOSED；严格 DTO、query 拒绝、四领域三主线目标保存已验证 |
| FND003-R4 | CLOSED；退出/切换清空、迟到响应丢弃、旧草稿禁写已验证 |
| FND003-R5 | CLOSED；v2 约束预检与 bootstrap/register/migration 回滚恢复已验证 |
| FND003-R6 | CLOSED；完整安装副本只篡改 `lib/index.js`，实际加载检查器明确报告 SHA-256 不一致并非零退出 |

未验证范围仍属于其他单元：完整 ACL、资料/学习计划/评分、模型/RAG、jobs/audit/outbox、Windows 安装和完整产品审查。FND-004 未开发。
