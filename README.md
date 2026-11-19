# KnowledgeOS

基于DeepSeek Harness的个人知识、工程训练与小组协作平台。Windows桌面端优先，协作目标约10人以内；范围以已确认F01–F44为准。

## 当前唯一执行入口

**[当前执行指令](CODEX_START.md)**：Codex 按依赖连续开发，每个候选单独测试与独立验收。

## 规范与结果

| 文件 | 职责 |
|---|---|
| [执行状态](config/execution_state.json) | 当前单元、指令哈希与停止状态 |
| [执行索引](docs/plan/00_EXECUTION_INDEX.md) | 唯一指令与阅读顺序 |
| [需求基线](docs/plan/01_REQUIREMENTS_BASELINE.md) | 44项产品功能及不变量 |
| [总体架构](docs/plan/03_ARCHITECTURE.md) | 分层模块化单体与DSH边界 |
| [工作单元](config/work_units.json) | 76 单元的范围、依赖、状态与测试义务 |
| [验收矩阵](docs/plan/07_ACCEPTANCE_MATRIX.md) | 66个完整场景，未提前PASS |
| [协作协议](docs/plan/11_AGENT_AND_PROMPT_PROTOCOL.md) | 同功能多角色、单产品写者 |
| [进度](docs/status/PROGRESS.md) | 已完成、待修复和待复验事项 |

```sh
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
```

计划检查只证明结构与状态一致，不证明产品通过。固定上游 `39163dd30f703a79079e2d2446545cff3c453738`、版本 `0.2.2-rc.3` 保持。常规知识长期保存，30天仅用于回收站。私密资料、凭据、数据库和备份不进入公开仓库；本轮不发布安装包。
