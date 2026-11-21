# 验证证据

证据按单元放在docs/evidence/<unit_id>/，包含当前revision、需求子集、架构/测试预期、候选commit或逐文件指纹、实际命令/退出码、环境、输入、失败与复测、独立复核和报告。计划不是另一份启动指令，不授权跨单元。

FND-001与FND-002已验收，R1/R2已关闭，见 [FND-002验收复核](FND-002/ACCEPTANCE_REVIEW_20261116.md)。旧失败与旧候选保留各自事实；本次接受修复不把旧结果改成新通过。

FND-003 已由最终候选和独立复核通过；当前 FND-004 记录对象权限、项目成员、逐动作 grant、到期撤销和共享路由边界。对象基础闭环不提前认证 A02/A34/A46 的搜索、AI、导出、邀请码或完整缓存场景。

公开证据只存脱敏合成数据。扫描秘密、个人路径、嵌套stdout和截图，不提交数据库/WAL/SHM。实际没有发布的原始日志必须明确标出；不能将本地日志文件名写成远端已存在，也不能从摘要重建原始日志。

PASS/FAIL/NOT_RUN/BLOCKED分开。单元真实运行、完整产品场景、Desktop/Windows、模型分别证明；结构检查PASS不代表产品通过。候选变更后复测受影响内容，完成当前单元后提交检查点并按依赖调度。

## 跨单元完整场景

A09、P03、P08、A16、A46 使用 `integrated-case-v1`（规则见 `scripts/integrated-case-proof.mjs`）。责任单元及必需参与单元来自计划，不改写历史单元候选，也不把后补条件加成反向调度依赖。

- 场景证明记录 `case_id`、`unit_id`、实际 `candidate_sha`、整树 `tree`、`source_tree`、`entry_sha256`、`build_sha256`，以及 `participants`（各 `unit_id` 和已接受的 `candidate_sha`）。用门禁里的 `candidateFacts` 从 Git 计算指纹，再核对实际加载产物，不能把 Git 指纹当作运行结果。
- `main`、`independent`、`regression` 分别引用实际结果文件及字节 SHA-256。每份结果重复候选和参与单元映射，记录 `kind`、独立 `run_id`、`runner`、`command`、`environment`、`inputs`、真实 `exit` 与 `results`（断言 ID、状态与实际观察）。主跑和独立复核各覆盖完整断言；回归覆盖受变更影响的路径。每次运行至少有一件不同的可查证产物，`artifacts` 按路径及 SHA-256 绑定。
- 不能借用旧候选、夹具摘要或其他执行的截图。门禁验证记录的一致性与完整性；实际运行与独立验收仍是接受前提。既有 A05/A07/A08 单候选场景记录保留原样。
