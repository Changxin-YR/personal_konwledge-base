# Codex 接管指令验证 · 2026-11-16

## 本次交付范围

用户已授权从 DSH 开发执行器切换到 Codex，先理解项目、修复已有基础并验证，随后等待指令。用户进一步明确旧 API 只是额度用完且无需处理，因此本次不包含 API 排查或凭据配置任务。DSH 的产品 Host、profile、插件和固定上游保留。

接管前基线：`10c406713a64299d7c7a52695672bbadbe2c21cb`。工作分支：`codex/knowledgeos-takeover`。唯一入口：[当时的CODEX_START.md](https://github.com/Changxin-YR/personal_konwledge-base/blob/4562034c9b4da48ee7b0d1447f7ae7663908240f/CODEX_START.md)，revision `3.0.0`；旧 DSH_START.md 从本分支工作树移除，旧正文与旧分支留作 Git 历史。

## 实际执行的验证

环境为 Linux、Node v24.22.1。以下检查针对接管文档、机器状态与计划门槛，不运行产品或原 FND-002 九项测试。

| 命令 | 实际结果 | 原始输出 |
|---|---|---|
| `node scripts/verify-plan.mjs` | exit 0，PASS；44 需求、66 完整场景、76 单元、164 项计划检查；Codex / FND-002 / autoAdvance=false / fullProductReview=not_started | [plan.json](checks/codex-takeover-20261116/plan.json) |
| `node scripts/test-verify-plan.mjs` | exit 0，15/15 计划门槛回归；2 个有效结构正例与 13 个拒绝负例 | [gate-regressions.json](checks/codex-takeover-20261116/gate-regressions.json) |

负例涵盖提示词哈希漂移、旧入口恢复、DSH 执行器回流、目录执行器/入口错位、自动推进、允许并行功能、第二活动单元、未经授权激活下一单元、遗留 OPEN 时假完成、未复测假完成、提前启动完整审查、把基础子集标为完整场景通过。每项在独立临时副本执行，验证明确拒绝原因和非零退出。

第二个正例只构造临时的 passed / awaiting_user 状态及明确标注 synthetic 的证据文件，用于证明规则允许合法的结构性收口。它不代表产品验收通过，不写回真实状态。两个检查输出均明确 `implementationVerifiedByThisCheck=false`、`productTestsExecuted=0`。

## 只读复核与收口

两项独立只读复核分别检查执行规则一致性和产品修复边界。主入口、AGENTS、配置、检查器及支持规范一致；R1/R2、九项测试、独立候选验证和停止条件完整，未扩大为未来功能开发。

复核发现原测试计划将旧 Windows 机器路径、桌面实例和初次计划的 ready 状态混作当前约束，已明确历史环境示例与当前实际解析规则，更新为当前分支和 in_progress。桌面保护只在实际存在时适用；真实固定版本 Node Web Host 仍为本轮最低门槛。历史待澄清事项不再要求用户重复确认现行契约已解决的问题。

## 绑定的文件指纹

| 文件 | SHA-256 |
|---|---|
| CODEX_START.md | `efb33af0a2e99edb683cb19af03e0e78081a483316105768d0ec333c17f50760` |
| AGENTS.md | `fb180c15150529522faa648affc71c3fef34d5b38d50cffa0440a0c9e901b0bb` |
| config/execution_state.json | `d61359b4e483181cd1d1a79e97ad792fe5d58747b5d20036acba890f45bbbf90` |
| config/work_units.json | `5e53ca556ccf2720020d1eb85302f9acfb07b406331c38b4ad6b99c60d0ebf00` |
| scripts/verify-plan.mjs | `b34b320ca64c14914a14aca0c091d872cc9afa90486fc737a2436da5975c8faa` |
| scripts/test-verify-plan.mjs | `2fe299b1060bfeca1669d7d7d238cb3fb9b9be67e0ba7769fdc12371f3ff1a3e` |

## 产品状态没有提前改变

产品源码、构建产物、原 FND-001/FND-002 测试脚本、版本锁、完整需求矩阵及原始 runs/reviews 未作修改。FND-001 仍 passed；FND-002 仍 in_progress、R1/R2 OPEN、test_result_status=FAIL、retest_status=NOT_RUN；其余单元未激活，全部完整场景仍 NOT_RUN。

本次完成的是可直接交给 Codex 的接管指令与门槛。以上是接管准备提交当时的状态；后续产品修复已验收，见 [FND-002验收复核](../evidence/FND-002/ACCEPTANCE_REVIEW_20261116.md)。本记录不改变当时检查范围。
