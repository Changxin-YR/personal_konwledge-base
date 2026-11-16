# 实际进度

更新：2026-11-16（Asia/Shanghai）。本表的状态描述真实完成情况，不把计划当成果。

## 当前交付

- 已读取目标仓库初始化状态及官方 DSH 固定提交的清单、文档和关键源码。
- 已整理需求基线、上游能力核对、架构、数据/API、UI、M0–M6 实施计划、发布手册与 Codex 提示词。
- 已建立 44 项需求和 66 个验收场景的双向追踪；初始实现 `planned`、运行验收 `NOT_RUN`。
- 已准备上游源码检出与方案结构检查脚本。实际执行记录见 `docs/evidence/PLAN_VALIDATION.md`。

## 里程碑

| 阶段 | 实现状态 | 运行验收 | 下一步 |
|---|---|---|---|
| M0 | planned | NOT_RUN | 固定源码、插件真实挂载、持久化/身份/模型探针 |
| M1 | planned | NOT_RUN | 资料导入、阅读、中文检索、引用和权限 |
| M2 | planned | NOT_RUN | 术语、笔记、本体、遮挡、快答、错题与复习 |
| M3 | planned | NOT_RUN | 仓库分析、工程训练、软考完整训练与反馈 |
| M4 | planned | NOT_RUN | 协作、审核、计划、评分、F30 |
| M5 | planned | NOT_RUN | 多智能体、AI动作与插件治理 |
| M6 | planned | NOT_RUN | 生命周期、备份恢复、Windows包与整体验收 |

## 下次执行入口

读取 `CODEX_START.md`，从 M0 继续。保留既有工作树并在 `codex/knowledgeos-*` 工作分支开发；不重复重新设计已确认的功能范围。

Windows 包、真实模型调用、真实大 PDF、跨平台仓库接入和多人长期使用尚未验证。只有实际尝试遇到缺失条件时，才把对应项从 NOT_RUN 改成 BLOCKED 并附证据。
