# FND-005 证据索引

最终候选：`FND-005-d0ec209b8161e14e`。整体 **BLOCKED**：真实 GPT 调用 0 次；受控模型、真实 HTTP/SQLite/Chrome 的技术检查不能替代 GPT 验收。

| 资料 | 用途 |
|---|---|
| [中文验收报告](REPORT.md) | 单项结果、实现范围、剩余依赖及停止状态 |
| [最终候选](candidate.json) | 50 个产品/测试/指令文件、13 个运行时文件及固定上游来源 |
| [任务切换](task-switch.json) | 起始分支、远端检查、指令版本、提示词哈希与历史保护 |
| [架构](architecture.md) / [测试契约](test-plan.md) | 真实业务身份、受控工具、事务与分层测试设计 |
| [提供方审计](provider-audit.json) | 实际 DSH 配置为 DeepSeek，未发现获授权 GPT 路由 |
| [真实模型结果](real-provider/summary.json) | BLOCKED、调用数 0、无替代模型 |
| [实现者运行汇总](implementer-summary.json) | 各轮实际版本、时间、类别及对应摘要 |
| [独立结论](independent/REVIEW.md) / [独立详细报告](independent/REPORT.md) / [机器汇总](independent/summary.json) | 最终候选 82 项技术检查、关闭项与真实 GPT 阻塞 |
| [开发修复历史](development-history.md) | 缺陷、测试预期错误、修复与候选替换 |
| [固定上游构建](build-and-gates.json) | 8 个产物门、2 个聚合门及 14524 份源码比对 |
| [计划门禁](plan-gates.json) | 指令一致性与 35 项结构测试；不计作产品验收 |
| [交付安全检查](delivery-safety.json) | 历史记录保护、冻结哈希、敏感模式及产物检查 |
| [最终一致性检查](finalization-checks.json) | 最终单元状态、独立结果、候选及证据路径交叉核对 |
| [Git 交付回执](delivery.json) | 产品提交、正常推送、真实远端回读及认证链故障记录；不代表 GPT 验收通过 |
| [复验说明](operator-notes.md) | 将来配置真实 GPT 后在本单元补充 read/update/UI/SQL 证据的方法 |

最终独立验收位于 `independent/`：基础六组为 integration 14、storage 6、configuration 21、barriers 5、ui 8、acl 7，共 61 项；独立追加 additional 11、service-additional 6、ui-additional 4，共 21 项。每组 `summary.json` 记录观察事实，`command-*.json` 绑定当前候选、命令、退出码及前后文件差异；`candidate-before.json`、`candidate-after.json`、`final-audit.json` 提供来源、哈希、迁移和测试端口释放核验。独立最终结论在 `independent/summary.json`、`independent/REVIEW.md`。

旧候选保留在 [candidates/FND-005-572a5b58a7b46671.json](candidates/FND-005-572a5b58a7b46671.json)，独立首轮在 `independent/round1/`。旧的 `runs/final-*` 是较早一轮，不能按文件名推断其为最终候选；中间失败不改写为通过。原始 Host 日志、真实凭据、Cookie、owner token、数据库与私人原件不在证据目录或 Git 中。
2026-11-19 补充：[截图指定的 DeepSeek HS14 真实读写、界面缺陷与修复后回归](live-hs14-Oaxv9B/REPORT.md)。不替代 GPT 的独立验收。
