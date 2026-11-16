# KnowledgeOS

基于 DeepSeek Harness 的个人知识、工程训练与小组协作平台。Windows 桌面端优先，目标约 10 人以内；产品范围保持已确认的 F01–F44。

## 当前唯一执行入口

**[DSH_START.md](DSH_START.md)** — 当前交给 DeepSeek Harness 的唯一可执行提示词。

当前模式：**分段、单功能、开发与测试同行**。先由 DeepSeek Harness 完成各功能基础开发和逐项验证；全部基础范围完成后，由用户确认进入 Codex 全面审查与修复阶段。当前没有启用 Codex 开发或审查指令。

当前只激活 **FND-001：DSH 原生单面板与 Host 只读状态**。目标是在固定 DSH 内打开一个 KnowledgeOS 页面，并读取真实 Host 版本/状态；此单元通过或受阻后报告并停止。下一单元由用户选择，不自动连做整份路线图。

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

2026-11-16：执行方式已调整为 DeepSeek Harness 单功能门控流程；需求、架构、数据/API 和验收文档仍为开发基线。**业务代码、真实 DSH 挂载和 Windows 安装包均尚未完成。** 文档和检查脚本通过不表示产品测试通过。

官方上游固定为 `39163dd30f703a79079e2d2446545cff3c453738`，根包版本 `0.2.2-rc.3`；工具链与证据见 [版本锁](config/upstream.lock.json) 和 [DSH 能力核对](docs/plan/02_DSH_CAPABILITY_AUDIT.md)。

## 现有辅助命令

```sh
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
node scripts/prepare-upstream.mjs --prepare
```

第一项检查指令一致性、当前单元、需求/验收映射与文档链接。`--check` 只读且不联网；尚未检出时返回 `NOT_PREPARED`。`--prepare` 只准备固定上游源码，不安装依赖、不修改全局 DSH 配置、不开始下一个功能。

M0–M6 是总体归属，不是一条可以连续执行的命令。开发启动脚本在 FND-001 实际验证后补入；只创建该单元需要的代码和依赖。

## 产品与发布

六个一级入口：今日计划、知识库、笔记、项目协作、智能讨论、管理与设置。界面遵循最多两级导航、冷玉青色、企业常用字体、适度圆角。

正常知识与学习记录长期保留，30 天清理只适用于回收站；F30 采用应用内不可关闭、按约定条件和时段执行的强提醒规则。

源码、方案和脱敏证据存 Git。后续经激活并完成的 Windows 安装包/插件包存本仓库 GitHub Releases，附提交、SHA-256 和验证范围；私人资料、数据库、备份及凭据不上传公开仓库。
