# 当前收口问题

2026-11-20，FND-005：锁定 DSH 的原生 CLI 已初始化隔离 Web profile，冻结插件确实加载，但仍未获得合规路由，真实模型调用为零。除确认已授权凭据引用外，原生 `deepseek-official` 与现有 `llm-pi-ai` 专用派送门禁的兼容性需要核对；保持 `BLOCKED`，不能据此判断 API 无效。详见[更新预检](../evidence/FND-005/continuous/isolated-profile-preflight-20261120.json)。

2026-11-19：持续协议迁移起点：FND-001～004、006 历史 passed；FND-005 保持 blocked，等待新候选真实 DeepSeek 复验。 当前证据见 [FND-006](../evidence/FND-006/REPORT.md)。

## 历史记录

2026-11-19，FND-005：候选 `f1364b9` 已核对源码、入口与锁定 Host；独立测试 home 缺少已配置的原生路由，发现命令在启动阶段退出 1，零推理请求。历史专用 profile 的插件哈希不同，不能借用其旧结果。见[本次预检](../evidence/FND-005/continuous/discovery-blocked.json)。请通过 DSH 原生凭据管理在隔离测试 profile 中绑定已授权路由，或使用实际加载该候选并能证明预算、身份和数据隔离的授权 Host；不要将密钥发到聊天、日志或 Git。此项不阻塞 LIB-001。

更新：2026-11-17（Asia/Shanghai）。FND-003 六项返修已关闭，FND-004 当前没有代码级阻塞。真实 DSH 浏览器对象 HTTP 矩阵、Connection 单独停用/恢复和完整 A02/A34/A46 仍是 NOT_RUN 或需真实上游能力证据；不以 Host 整体停止代替 Connection 测试，不把未实现搜索/AI/导出/邀请码/缓存路径记为 PASS。

| 编号 | 状态 |
|---|---|
| FND003-R1 | CLOSED；普通身份路由统一要求真实已绑定 loopback listener、origin 和活跃 Connection；IPv4/IPv6/mapped IPv6 生产解析与反例通过 |
| FND003-R2 | CLOSED；来源限流、动态 Retry-After、KDF 运行/排队取消与恢复已验证 |
| FND003-R3 | CLOSED；严格 DTO、query 拒绝、四领域三主线目标保存已验证 |
| FND003-R4 | CLOSED；退出/切换清空、迟到响应丢弃、旧草稿禁写已验证 |
| FND003-R5 | CLOSED；v2 约束预检与 bootstrap/register/migration 回滚恢复已验证 |
| FND003-R6 | CLOSED；完整安装副本只篡改 `lib/index.js`，实际加载检查器明确报告 SHA-256 不一致并非零退出 |

未验证范围仍属于其他单元：真实 DSH 浏览器对象 HTTP 矩阵、Connection 单独停用/恢复、搜索索引、AI 摘要/答案、文件下载、邀请码、完整缓存失效、资料/学习计划/评分、模型/RAG、jobs/audit/outbox、Windows 安装和完整产品审查。FND-004 的基础权限闭环已 PASS；上述范围保持 NOT_RUN 或待真实上游能力证据，不能由本单元结果代替。
