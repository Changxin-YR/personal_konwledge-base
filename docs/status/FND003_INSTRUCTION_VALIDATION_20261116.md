# FND-003 指令激活核对

> 历史记录：本页仅记录v3.1.0提示词准备时的计划检查，原提示词已冻结至对应提交。当前返修入口为根CODEX_START.md v3.1.1；计划检查不证明第三部分产品通过。

日期：2026-11-16。范围：FND-002 前置验收后的执行提示词、计划状态与门槛；FND-003 产品实现和十二项产品测试尚未执行。

## 基线与当前指令

从已复核的 `3535f16b1a429d32cd2c80f6c1462ce556fcb509` 接续，工作分支为 `codex/knowledgeos-fnd-003`。产品修复发生在 `a03c9e3`，详见 [FND-002 验收复核](../evidence/FND-002/ACCEPTANCE_REVIEW_20261116.md)。本次没有再次运行完整 Windows DSH Host 验收。

根目录唯一入口 [当时的CODEX_START.md](https://github.com/Changxin-YR/personal_konwledge-base/blob/ae805d0aaad2f937b10f5b74c48d38bf6c7192ee/CODEX_START.md) 为 v3.1.0，执行器 Codex，阶段 `codex_foundation`，active_unit=FND-003，ready/planned，auto_advance=false。当前提示词 SHA-256：`03dc8b7f5efea53c3ffcec6cfc72f6feb7199b4e6f547ebd08e344792c0a8c47`。旧提示正文仅由 Git 历史保留。

## 实际检查

| 检查 | 结果与证据 |
|---|---|
| `node scripts/verify-plan.mjs` | PASS；44 需求、66 完整场景、76 工作单元、174 项计划测试义务；[输出](checks/fnd003-20261116/plan.json) |
| `node scripts/test-verify-plan.mjs` | 31/31 PASS：4 个结构正例、27 个拒绝反例；[输出](checks/fnd003-20261116/gate-regressions.json) |
| 执行环境、命令、退出码和输入指纹 | [本次检查记录](checks/fnd003-20261116/validation-run.json) |
| 当前提示词与 JSON | 十二项 scenario、preconditions、steps、expected、evidence_required 均逐项一致；指令哈希匹配 |
| 产品变更边界 | 当前新增和变更为指令/状态/文档、两份计划门槛脚本、复核输出与三处路径脱敏；产品源码、lib、旧迁移及运行测试脚本没有变更 |

门槛回归在临时副本构造状态，检查旧阶段、第二提示词、哈希偏移、自动推进、并行功能/多写者、前置未通过、R1/R2 重开、跨入 FND-004、当前 base 不一致、测试编号缺失、未完成测试或独立复核、无效证据与全量验收假通过。合成 completed fixture 仅证明计划门槛结构可通过，不能用作产品测试证据。

## 同一单元内的独立复核

架构角色核对固定 DSH WebServer/Connection/Token/Peer 接入、owner 初始化与独立业务会话、同库 v2 迁移、来源保护及测试闭环。复核发现并已修正：已运行 scrypt 不能随 HTTP 取消提前归还并发槽位；成功登录必须同事务替换当前请求携带的有效旧会话。两项同步到正文、T04/T10 和 JSON。

独立文档角色逐字核对十二项义务、当前范围、历史证据发布修正与链接。已清理实施计划中仍指向 FND-002 的当前范围和“76 个单元均未开始”的旧状态。仅保留有历史说明的旧结果。FND-002 路径脱敏精确涉及 T09 嵌套 stdout 的 out 及浏览器 summary 的 dsh_root/home，断言、时间、业务值与候选哈希不变；未发布原始日志的范围已经明示。

官方技术依据已列在当前指令第 10 节。密码/会话/限流参数属于本阶段工程默认值，不冒称用户指定。所有新产品结论仍待 Codex 对实际候选运行十二项验收。

## 交付状态

FND-001/FND-002 保持 passed。FND-003 只完成激活和执行契约，产品测试 NOT_RUN、独立产品验收 NOT_RUN；其余 73 个工作单元未激活。完整 44 项需求未提前 verified，66 个完整场景继续 NOT_RUN，完整产品审查未开始。

Codex 按当前提示词逐项实现并测试，合格后提交推送当前分支，将本单元置为 awaiting_user 并停止，不自动推进 FND-004；旧 API 额度问题不在本轮。
