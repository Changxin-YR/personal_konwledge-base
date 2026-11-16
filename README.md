# KnowledgeOS

基于 DeepSeek Harness 的个人知识、工程训练与小组协作平台。Windows 桌面端优先，协作目标约10人以内；产品范围以已确认 F01–F44 为准。

## 当前唯一执行入口

**[CODEX_START.md](CODEX_START.md)** — Codex v3.1.0，仅执行 **FND-003：注册登录与个人身份**。当前工作分支 `codex/knowledgeos-fnd-003`，状态 ready / planned；产品实现与本轮十二项测试尚未执行。

本轮交付可信本机管理员初始化、普通注册/登录/退出、服务端业务会话、本人方向目标与个人空间、小型账号页。沿用分层模块化单体及DSH运行底座；逐项开发测试，完成后停止等用户，不自动进入FND-004。旧API额度问题不处理。

## 已验收基础

FND-001 的真实面板/status及生命周期已通过。FND-002 的 R1 数据库前缀保护与 R2 证据检查已修复，前置提交 `3535f16b1a429d32cd2c80f6c1462ce556fcb509`；候选11个哈希匹配，九项测试113条断言及独立运行已核对，本次另在合成库重跑R1正反对照和R2比较器。见 [FND-002 验收复核](docs/evidence/FND-002/ACCEPTANCE_REVIEW_20261116.md)。这些基础成果不代表账号或完整产品已经完成。

## 文件职责

| 文件 | 职责 |
|---|---|
| [执行状态](config/execution_state.json) | 当前执行器、单元、指令哈希和停止状态 |
| [执行索引](docs/plan/00_EXECUTION_INDEX.md) | 当前功能的阅读入口 |
| [需求基线](docs/plan/01_REQUIREMENTS_BASELINE.md) | 六工作区、44项既定功能及不变量 |
| [总体架构](docs/plan/03_ARCHITECTURE.md) | 分层、部署和身份依赖边界 |
| [工作单元](config/work_units.json) | 当前细化范围及未激活未来目录 |
| [验收矩阵](docs/plan/07_ACCEPTANCE_MATRIX.md) | 66个完整场景；局部通过不得提前升级 |
| [协作协议](docs/plan/11_AGENT_AND_PROMPT_PROTOCOL.md) | 单功能、单写者、独立测试与候选 |
| [进度](docs/status/PROGRESS.md) | 已完成和当前待执行事项 |

旧提示词只保留Git历史，工作树不保留第二个执行入口。固定上游 `39163dd30f703a79079e2d2446545cff3c453738`、版本 `0.2.2-rc.3`，见 [版本锁](config/upstream.lock.json)。

## 开工与验证

```sh
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
```

计划检查只证明指令、状态、映射和链接一致。`--check`只读；NOT_PREPARED时按已有准备脚本获取固定源码。FND-001/FND-002历史检查留存；FND-003需建立相应身份/v2范围检查，不能将历史“两表/v1”门槛改成假通过。

正常知识和学习记录长期保存，30天仅适用于回收站。产品界面使用冷玉青、企业常用字体、适度圆角和最多两层导航。源码、方案与脱敏证据存Git；安装包仅在发布单元实际激活和验证后发布至本仓库Releases。私密资料、数据库、备份和凭据不上传公开仓库。
