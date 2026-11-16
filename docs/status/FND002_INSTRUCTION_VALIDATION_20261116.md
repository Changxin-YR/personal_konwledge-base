# FND-002 指令激活核对

> 历史记录：以下是 v2.1.0 初次激活时的结构检查及哈希，仅适用于提交 a938fd4。当时未开发的状态不是当前状态；当前为 v2.1.1 收尾，见 [提交复核](../evidence/FND-002/SUBMISSION_REVIEW_20261116.md)。

日期：2026-11-16（Asia/Shanghai）。范围：第二部分执行方案、契约和状态一致性；不属于 FND-002 产品验收。

## 1. 基线与唯一入口

- 继承已验收第一部分提交：`ce3a00ccd7c8cc46eaae6e660144730109cf93a0`。
- 用户明确选择第二部分；工作分支：`dsh/knowledgeos-fnd-002`。
- 唯一入口：[DSH_START.md](../../DSH_START.md)，instruction_revision `2.1.0`。
- 当前提示词 SHA-256：`0091884d2b62b0ecb78fff38de34bf26a998de1fa0a37201e6fb7868699b5523`。
- 执行状态为 FND-002 / ready，目录状态 planned，九项产品测试 NOT_RUN；FND-001 仍 passed。
- 一个活动单元、一个生产代码写者、auto_advance=false；Codex review locked。

## 2. 实际检查结果

实际执行 `node scripts/verify-plan.mjs`，退出码 0，结果 PASS，检查范围为 `plan_structure_traceability_and_execution_consistency_only`：44 项需求、66 个完整验收场景、76 个工作单元和 164 项已登记测试义务保持可追踪，当前活动单元为 FND-002。

额外逐项比较确认：FND-002-T01 至 T09 的场景、前置、步骤、断言及证据要求在 JSON 与当前提示词一致；需求/验收矩阵未改；本地已有的产品源码、构建产物、运行脚本及 FND-001 证据与验收基线相同。发布使用完整验收基线的 Git tree 叠加文档变更，保留未在本地重取的大型历史运行证据。

只读方案复核检查了数据/API 边界与测试可执行性。已明确 resource 与 handler 的区别、真实 Config 注入、旧禁数据库范围检查的历史适用性，以及 Unicode 内容逐值保留所需的输入边界；未通过新增未来功能消除问题。

## 3. 结果的限制

本次只替换唯一提示词并同步计划、状态和数据库旁文件忽略规则。没有实现 FND-002 产品代码，没有执行其产品测试，没有用文档 PASS 代替运行 PASS。真实持久化、事务回滚、迁移保护、生命周期和当前候选回归仍由 DSH 在本轮开发中逐项完成。

FND-001 既有通过结论继续绑定其原候选。A07/A49 等完整场景未改为 PASS，没有需求被标记 verified。后续单元未激活，main 和第一部分完成分支不在本次修改范围。
