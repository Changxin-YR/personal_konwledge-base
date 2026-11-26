# 当前收口问题

## 当前阻塞与在制缺口

2026-11-26，[PROJECT-002 和 A31](../evidence/PROJECT-002/REPORT.md) 已通过，P08 等待 SCORE-001。[FND-005 和 A01](../evidence/FND-005/tokease-20261126/REPORT.md) 已通过，A41 等 MODEL-001 的全套配置与用量验收。[PROJECT-003](../evidence/PROJECT-003/REPORT.md) 已通过指定审核和权限内改判，A32 等 PROJECT-004 的正式复议和处理完成后验收。

GitLab、Gitee、真实 AI 写入拒绝及 GitHub 私库认证仍待各自验收。Windows 安装、升级、回退、卸载和 CHECK-004 未启动。

## 2026-11-22 检查点

2026-11-22，FND-005 仍为 **BLOCKED**，以[原生 Host 派送预检](../evidence/FND-005/native-host-egress-20261122.json)为准。该运行已验证未配置凭据及目录/Messages/Files 合成拒绝场景的零出站，`configured=false`、`model_count=0`、真实推理 0。原先“profile 未初始化”及“零出站负例尚未验证”的描述属于历史；本次结果没有证明带真实凭据的正向业务链。

剩余条件是：绑定当前候选、实际路由、既有调用授权与额度及请求体范围的一次性 Messages 正向许可；隔离 profile 中原生凭据和可用模型；真实业务 read/update、UI/HTTP/SQLite 核对及独立复跑。先完成可自行处理的派送设施，再核对原生凭据引用；必须由用户绑定时只问隔离 profile/Host 和非秘密 provider/model 等最少信息，凭据在原生安全入口填写。不能借用旧插件证据，不能据零推理判断 API 无效或余额不足，不改变产品既有费用展示/警示语义。

PROJECT-002 是 **in_progress**，不是已通过或外部 blocked：共享材料固定版本、当前权限、等待授权及恢复的真实路径尚未完成。沿[当前检查点](../evidence/PROJECT-002/CHECKPOINT.md)继续实现和测试，再收口 A31；P08 的计分断言等 SCORE-001。

完整 A19 的 GitLab/Gitee 和真实 AI 写入拒绝仍未验收；REPO-001 私库认证未实测。Windows 安装、升级、回退、卸载和 CHECK-004 仍为未来未验收范围，不把缺少这些证据提前记作当前所有单元的共同阻塞。

FND-005 持续受阻时，当前显式依赖允许继续 PROJECT-002/003/004、REPO-002/003；条件不变时不重复无效调用，按[最新续接计划](../plan/06_IMPLEMENTATION_PLAN.md#8-从-project-002-检查点继续推进)调度。

## 历史排查记录

2026-11-21，FND-005 补查：锁定运行时的原生 listing、provider hooks 和 Messages extensions 共 26 项上游测试通过，使用测试替身，实际业务推理为零。原生 `admit` 只做模型兼容检查，`prepare` 在 `admit` 之前可能访问模型目录，不能把它当预算或零出站派送闸门。仍需在隔离 Host 验证正式派送边界及无凭据/无许可零出站；未获得 API 有效性或额度结论，暂不请求用户提供密钥。

2026-11-21，FND-005：只读核对锁定 DSH。`llm-deepseek-api-key` 注册的 `deepseek-official` 由 `llm-deepseek` 的 Messages 适配器直接派送，不经过现有 `llm-pi-ai/request-headers` 守卫。原生 `deepseekLlmApiExtensions` 的单字段准备异常会被吞并；不能用该回调拒绝来代替额度闸门。下一步在隔离副本上验证原生派送前拒绝及零出站负例，再绑定已授权的原生凭据引用。此次未触发推理，也未发现可判定 API 有效性的证据。

2026-11-20，FND-005：锁定 DSH 的原生 CLI 已初始化隔离 Web profile，冻结插件确实加载，但仍未获得合规路由，真实模型调用为零。除确认已授权凭据引用外，原生 `deepseek-official` 与现有 `llm-pi-ai` 专用派送门禁的兼容性需要核对；保持 `BLOCKED`，不能据此判断 API 无效。详见[更新预检](../evidence/FND-005/continuous/isolated-profile-preflight-20261120.json)。

2026-11-19：持续协议迁移起点：FND-001～004、006 历史 passed；FND-005 保持 blocked，等待新候选真实 DeepSeek 复验。 当前证据见 [FND-006](../evidence/FND-006/REPORT.md)。

### 早期记录

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
