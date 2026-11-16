# KnowledgeOS

基于 DeepSeek Harness 的个人知识、工程训练与小组协作平台。Windows 桌面端优先，目标约 10 人以内；产品范围保持已确认的 F01–F44。

## 当前唯一执行入口

**[CODEX_START.md](CODEX_START.md)** — 当前交给 Codex 的唯一可执行提示词。

当前模式：**分段、单功能、开发与测试同行**。用户已授权改由 Codex 接管：先理解已有项目，修复并验证已有基础，完成后等待新指令。DSH 仍是产品运行底座；旧 API 额度问题不在本轮范围。完整产品审查没有被提前激活。

当前 **FND-002：本地业务持久化最小闭环** 进入 v3.0.0 Codex 接管修复，状态 `in_progress`。复核提交 `cba39e4` 发现可复现的未知非空库归属判断缺陷，R1/R2 待修；已完成的主体实现及真实测试历史保留。接管工作分支 `codex/knowledgeos-takeover`，FND-001 保持 passed，FND-003 未激活。

## 文件职责

| 入口 | 用途 |
|---|---|
| [执行状态](config/execution_state.json) | 唯一 active_unit、执行引擎、指令哈希与下一阶段锁 |
| [执行索引](docs/plan/00_EXECUTION_INDEX.md) | 按当前功能选择需要阅读的规范 |
| [需求基线](docs/plan/01_REQUIREMENTS_BASELINE.md) | 六个工作区与 44 项既定功能 |
| [总体架构](docs/plan/03_ARCHITECTURE.md) | 从需求推导的分层模块化单体及依赖方向 |
| [逐功能工作目录](docs/plan/06_IMPLEMENTATION_PLAN.md) | 后续单元、前置依赖、开发与测试边界；目录不等于激活 |
| [验收矩阵](docs/plan/07_ACCEPTANCE_MATRIX.md) | 66 个完整场景与各自最终验收阶段 |
| [多智能体与提示词协议](docs/plan/11_AGENT_AND_PROMPT_PROTOCOL.md) | 同一功能的角色分工、任务包、证据和返修规则 |
| [实际进度](docs/status/PROGRESS.md) | 已执行结果与本次交接 |

工作树只保留现行执行入口。被替代的指令由 Git 历史保留，不生成备用执行副本。

## 当前实际状态

2026-11-16：**第二部分主体已实现，当前仍需修正数据库保护及证据检查。** 新反例表明 sqliteX_* 用户对象会被错误过滤，外部非空库被初始化；当前不能沿用原候选整体 PASS。见 [本次提交复核](docs/evidence/FND-002/SUBMISSION_REVIEW_20261116.md)、[当前报告与历史记录](docs/evidence/FND-002/REPORT.md)。真实 Host 写读、重启、回滚及面板回归等既有证据继续保留；本轮修复和新候选测试尚未执行。

官方上游固定为 `39163dd30f703a79079e2d2446545cff3c453738`，根包版本 `0.2.2-rc.3`；工具链与证据见 [版本锁](config/upstream.lock.json) 和 [DSH 能力核对](docs/plan/02_DSH_CAPABILITY_AUDIT.md)。

## 现有辅助命令

```sh
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
node scripts/prepare-upstream.mjs --prepare
```

第一项检查指令一致性、当前单元、需求/验收映射与文档链接。`--check` 只读且不联网；尚未检出时返回 `NOT_PREPARED`。`--prepare` 只准备固定上游源码，不安装依赖、不修改全局 DSH 配置、不开始下一个功能。

M0–M6 是总体归属，不是一条连续执行命令。`scripts/fnd001/` 与通过记录保留；其禁数据库范围检查只适用于第一部分历史候选。`scripts/fnd002/` 提供本轮 SQLite 范围检查、真实 Host/HTTP/SQLite 九项验收与锁辅助；FND-002 目前按唯一提示词修正 R1/R2 并复测，FND-003 及以后仍未激活。

## 产品与发布

六个一级入口：今日计划、知识库、笔记、项目协作、智能讨论、管理与设置。界面遵循最多两级导航、冷玉青色、企业常用字体、适度圆角。

正常知识与学习记录长期保留，30 天清理只适用于回收站；F30 采用应用内不可关闭、按约定条件和时段执行的强提醒规则。

源码、方案和脱敏证据存 Git。后续经激活并完成的 Windows 安装包/插件包存本仓库 GitHub Releases，附提交、SHA-256 和验证范围；私人资料、数据库、备份及凭据不上传公开仓库。
