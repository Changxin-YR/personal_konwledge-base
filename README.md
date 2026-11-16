# KnowledgeOS

基于 DeepSeek Harness 的个人知识、工程训练与小组协作平台。Windows 桌面端优先，兼顾约 10 人以内的协作。

## 从这里开始

- **交给 Codex 的完整执行指令**：[CODEX_START.md](CODEX_START.md)
- **文档阅读顺序与执行入口**：[执行索引](docs/plan/00_EXECUTION_INDEX.md)
- **已确认的 44 项需求**：[需求基线](docs/plan/01_REQUIREMENTS_BASELINE.md)
- **DSH 实际能力与限制**：[上游核对](docs/plan/02_DSH_CAPABILITY_AUDIT.md)
- **开发阶段与验收**：[实施计划](docs/plan/06_IMPLEMENTATION_PLAN.md) · [验收矩阵](docs/plan/07_ACCEPTANCE_MATRIX.md)
- **实际进度**：[PROGRESS.md](docs/status/PROGRESS.md)

## 当前状态

2026-11-16：执行方案、上游版本锁、需求追踪、接口与数据设计、验收规则和源码准备脚本已整理。**KnowledgeOS 业务功能尚未实现，Windows 安装包尚未构建；设计覆盖不能作为软件通过验收的证明。**

目标仓库保留现有名称 `personal_konwledge-base`。上游是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，固定基线为 `39163dd30f703a79079e2d2446545cff3c453738`，根包版本 `0.2.2-rc.3`。详见 [upstream.lock.json](config/upstream.lock.json)。

## 产品范围

六个一级入口：**今日计划、知识库、笔记、项目协作、智能讨论、管理与设置**。首批服务软件工程、系统架构、硬件工程、AI 开发四个领域。

核心流程是资料阅读、专业术语、任意长文遮挡背诵、基础快答、个人错题复习、代码与工程问题分析、每日计划、协作审核及有证据的多智能体评审。正常知识和学习记录长期保存；30 天清理只适用于回收站。

F30 采用已确认规则：应用内不可关闭强提醒，在连续 3 个已结算计划日为 C/D、处于约定时段、存在可行动未完成事项时执行；具体判断见需求与数据契约。

## 仓库组织

| 路径 | 用途 |
|---|---|
| `docs/plan/` | 需求、技术方案、UI、分期开发、验收和发布规则 |
| `config/` | 上游固定版本与 44 项需求追踪表 |
| `scripts/` | 源码准备与计划一致性检查；业务构建脚本在 M0 实现 |
| `docs/status/` | 实际进展、阻塞、交接状态 |
| `docs/evidence/` | 证据记录格式；测试通过后由 Codex 填真实证据 |
| `releases/` | 发布索引；安装包上传本仓库的 GitHub Releases |

后续业务源码放本仓库的 `packages/`、`profiles/`、`tests/`；上游源码由版本锁重建到忽略目录，必要的最小补丁单独追踪。具体集成以 M0 的真实构建结果为准。

## 目前可执行的辅助命令

```sh
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
node scripts/prepare-upstream.mjs --prepare
```

`--check` 不联网、不安装；缺少上游检出时返回 `NOT_PREPARED`。`--prepare` 只准备固定提交的上游源码，不安装依赖，不修改全局 DSH 配置。运行产品的命令由 M0 构建后写入本文，不使用尚不存在的启动命令充当交付。

## 数据和发布

这里只保存源码、方案、脱敏证据和发布索引。用户教材、私人资料、运行数据库、真实访问令牌及模型密钥不进入 Git。安装包属于本仓库 Releases 资产，保留版本、提交、SHA-256、平台和验证记录。
