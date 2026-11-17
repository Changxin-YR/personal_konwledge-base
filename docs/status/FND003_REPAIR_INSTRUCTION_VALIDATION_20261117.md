# FND-003 返修指令核对 · 2026-11-17

## 范围与基线

本次审查提交 `b1ff9ae506d98420796a6dd84d90e345a6eaa2d7`，结论为需要返修，详见 [提交复核](../evidence/FND-003/SUBMISSION_REVIEW_20261117.md)。当前只更新提示词、执行状态、门槛与复核材料，不修改产品源码/构建/依赖锁，不激活FND-004。

唯一根入口 [CODEX_START.md](../../CODEX_START.md) 版本3.1.1，SHA-256为 `ae09e69aaf7bc67aa56c230fa0d9895785d299cc246eeb830016cd22a97877aa`。执行器Codex、阶段codex_foundation、active_unit=FND-003、unit_state=in_progress、auto_advance=false。FND003-R1至R6 OPEN，审查FAIL，新候选复测NOT_RUN。

## 实际验证

| 检查 | 结果与证据 |
|---|---|
| `node scripts/verify-plan.mjs` | PASS；44需求、66完整场景、76单元、174项计划义务；[输出](checks/fnd003-repair-20261117/plan.json) |
| `node scripts/test-verify-plan.mjs` | 33/33 PASS，4个正例、29个反例；[输出](checks/fnd003-repair-20261117/gate-regressions.json) |
| 实际命令、时间、退出码、Node及输入指纹 | [运行记录](checks/fnd003-repair-20261117/validation-run.json) |
| 当前提示词与JSON | 十二项场景、前置、步骤、断言和证据逐项一致，唯一指令hash与state匹配 |
| 独立提示词复核 | 六项修复准确对应已证实缺陷/必测缺口，保留原契约，没有扩大到FND-004；补两份旧架构/测试材料的历史说明 |

门槛在既有单功能、单写者、禁止自动推进、前置通过和十二项完成检查上，增加复测必须PASS以及六项审查问题明确关闭。临时合成passed状态仅用于门槛正反验证，不是真实产品验收，不写回当前工作单元。

## 证据与产品状态区分

本次 [四个反例探针](../evidence/FND-003/reviews/b1ff9ae/README.md) 实际复验于原b1ff9ae文本候选；探针exit0表示执行完毕，JSON中的FAIL或reproduced=true表示旧候选存在缺陷。受控HTTP/SQLite/DOM/检查表达式验证不等于完整DSH Host或浏览器重跑。

21项旧候选manifest与b1ff9ae匹配，仅说明提交前候选可追溯。本次修改了AGENTS、CODEX和执行状态等文档，旧manifest因此只用于固定旧提交，不用于证明返修候选。未来产品修复必须新建候选manifest，包含独立脚本、真实安装解析、运行版本/时间及全部相关产物。

旧报告和run保持历史结果，只给当前引用加复核说明；三条error内13个私人file URL前缀脱敏，不改断言/时间/业务值。新候选产品测试尚未运行；六项关闭和最终十二项实际通过后才可返回awaiting_user，并等待用户决定第四部分。
