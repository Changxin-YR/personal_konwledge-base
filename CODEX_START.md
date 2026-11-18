---
instruction_revision: "3.3.0"
execution_phase: "codex_foundation"
executor: "codex"
active_unit: "FND-005"
auto_advance: false
---

# 当前执行指令：Codex · FND-005 一次真实 GPT 业务工具调用

本文件是仓库唯一当前可执行提示词。FND-001～FND-004 的验收历史必须保留；本轮只执行 FND-005，不重新标记完整需求场景为通过，不自动开始 FND-006、PDF 导入、完整 AI 助手或其他后续功能。

## 1. 当前执行登记

| 字段 | 值 |
|---|---|
| 指令版本 | `3.3.0` |
| 活动单元 | `FND-005` |
| 执行者 | `codex` |
| 工作分支 | `codex/knowledgeos-fnd-005` |
| 基础提交 | `4282b9231a4ac38b0eb87145c337b811aec033e4` |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738` |
| 自动推进 | `false` |

先核对远端最新 HEAD、工作树和未提交修改；保留用户已有修改；禁止 `reset --hard`、force push、无授权合并 main。远端不可达时如实记录，不伪造在线核验结果。

## 2. 必读材料与一致性门槛

开始编码前读取：`AGENTS.md`、`config/execution_state.json`、`config/work_units.json`、FND-004 最新报告/候选/源码/计划、`docs/plan/01_REQUIREMENTS_BASELINE.md`、`03_ARCHITECTURE.md`、`04_DATA_AND_STATE_CONTRACTS.md`、`05_API_AND_AI_CONTRACTS.md`、`07_ACCEPTANCE_MATRIX.md`、`11_AGENT_AND_PROMPT_PROTOCOL.md`，以及固定上游对应的 `AGENTS.md`、LLM 与工具注册文档。

执行单元切换必须原子替换唯一 `CODEX_START.md`，同步 `execution_state.active_unit=FND-005`、`executor=codex`、`auto_advance=false`、提示词 SHA-256、工作分支、基础提交、工作单元指令版本和计划检查脚本。修改后先运行并通过：

```text
node scripts/verify-plan.mjs
```

指令一致性检查未通过前不得进行产品代码开发。

## 3. 本轮目标与边界

通过固定版本 DeepSeek Harness，使用真实 GPT 提供方完成最小业务闭环：真实 KnowledgeOS 用户登录 → 自然语言指令 → 模型选择业务工具 → 领域服务以服务端可信 actor 重新判权 → SQLite 执行 → 返回结果 → 用户重新读取验证。

优先复用固定上游的 `ctx.llm`、`ctx.tools` 和受控执行接口；不修改上游模型循环，不复制整套 Agent 框架。模型只选择动作并生成结构化参数，不决定执行身份，不授予自己权限，不提供任意 SQL、文件路径或 Shell 指令。

实现两个受控工具：

- `knowledgeos_read_object`：读取当前用户有权访问的现有测试知识对象。
- `knowledgeos_update_object`：修改当前用户有权编辑的测试对象；必须包含 `expected_revision` 和幂等键/幂等保护。

身份只来自真实登录和服务端可信执行上下文；不得信任模型提供的 `user_id`、`role`、`owner_id`，不得把普通用户提升为 DSH owner。写入提交时重新检查 FND-004 ACL 和对象版本。只建设本轮最小幂等记录，不提前建设 FND-006 通用 jobs/outbox 平台。

## 4. 模型与失败处理

先核对 DSH 实际 provider、model 标识、目录和可用性。使用正确配置且获得授权的模型；API Key 不得进入源码、日志或 Git。保留用户指定模型，不自动切换到其他模型。设置保守的调用次数、输出限制、超时与费用预算。

必须区分 `MODEL_NOT_CONFIGURED`、凭据缺失、额度耗尽、权限拒绝、模型不存在、超时、取消、模型错误、工具拒绝、版本冲突和幂等冲突。没有可用 GPT API 时仍完成架构、工具、权限与测试代码，但真实模型测试标记 `BLOCKED`，不得用夹具冒充 GPT，也不得将本单元标记完全通过。

## 5. FND-005 验收义务

| ID | 预期 |
|---|---|
| T01 | 真实 GPT 选择只读工具，当前登录用户只读有权对象，结果显示在 UI。 |
| T02 | 真实 GPT 选择受控修改工具，完成一次可验证写入；重新读取结果与 SQLite 一致。 |
| T03 | 甲尝试经 AI 读取乙私人对象，服务端拒绝且不泄露标题/正文。 |
| T04 | 项目对象撤权或成员资格过期后，已准备但尚未执行的工具调用重新判权并拒绝。 |
| T05 | 相同操作重试不重复写入；同一幂等键复用不同参数明确冲突。 |
| T06 | 旧 `expected_revision` 返回 `409`，原内容不被覆盖。 |
| T07 | 模型不存在、无凭据、额度耗尽、超时、取消均返回准确状态，不伪造成功。 |
| T08 | 真实 UI 显示模型名、请求状态、所用工具、执行结果和可核验对象变化。 |
| T09 | 固定 DSH Host 构建、加载、停止、重启及 FND-001～004 受影响回归；区分真实模型、真实 HTTP/SQLite、受控夹具和静态检查。 |

至少一次真实提供方调用必须保存脱敏证据：provider/model、非敏感请求/响应摘要、工具调用、数据库变化、候选哈希和独立复核。凭据、token、完整私人内容不得保存。

## 6. 开发、证据与停止条件

按单功能迭代：先写架构和测试契约，再小步编码、逐项运行、修复、冻结候选并独立验收。同一时刻只有一个产品代码写者。所有运行记录、候选哈希、测试结果、失败原因和独立复核保存到 `docs/evidence/FND-005/`，结果只能使用 `PASS`、`FAIL`、`BLOCKED`、`NOT_RUN`。

只有全部必测项真实通过、至少一次真实提供方调用完成且独立复核完成，才可将 FND-005 设置为 `passed` / `awaiting_user`。否则如实保留 `BLOCKED` 或 `NOT_RUN`。正常提交并推送 `codex/knowledgeos-fnd-005`，回读确认远端提交，然后停止等待用户下一条指令。
