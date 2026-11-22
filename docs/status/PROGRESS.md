# 实际进度

2026-11-22 当前摘要（核对基线 `65eed4bad59a58ad2372f59f005f0e8d0f224880`）：**22/76 工作单元通过、11/66 完整场景通过、4/44 完整需求 verified（F05/F06/F08/F21）**。PROJECT-002 为 in_progress，FND-005 为 blocked，52 个单元 planned。本段汇总已存在的候选与证据，未新增产品验收；当前值以机器矩阵为准。

- [PROJECT-001](../evidence/PROJECT-001/REPORT.md) 的 T01/T02 和 A30 已经主跑、独立复跑通过。持续打开页面的双重邀请撤销清屏、复验超时清屏、私人任务隔离及重启已留证。
- [REPO-001](../evidence/REPO-001/REPORT.md) 修复候选 `12afff5` 已正式通过，两次实跑各 11 次真实 GitHub GET，验证切换引用后按原 blob SHA 首次读取旧快照。私库和完整 A19 未验收；GitLab、Gitee及实际 AI 写请求拒绝仍待验证。
- [PROJECT-002 检查点](../evidence/PROJECT-002/CHECKPOINT.md) 候选 `76fba93` 仅完成内联提交/预审/退回/管理员终审切片，主跑、独立复跑及 23 项受影响回归已有证据。共享材料固定版本、失权等待与恢复仍须实现和真实验证；T01/T02 整单元与 A31 尚未收口，P08 的日评分等 SCORE-001。
- 相较 11 月 20 日的续接起点，READ-002/003、SEARCH-001、LIB-006、SHARE-001、NOTE-001/002/003、LEARN-004、PROJECT-001、REPO-001 共 11 个单元新增通过，已经体现在工作目录及各单元证据中。
- [FND-005 最新预检](../evidence/FND-005/native-host-egress-20261122.json) 的隔离原生 Host 零出站负例通过；真实推理为 0，正向 Messages 许可、原生凭据及真实读写独立验收仍待完成。Windows 交付未验收，CHECK-004 未开始。

后续从 PROJECT-002 恢复，按[实施计划第 8 节](../plan/06_IMPLEMENTATION_PLAN.md#8-从-project-002-检查点继续推进)持续推进。以下按日期保留既有阶段记录，不作为新的激活指令。

2026-11-21：LIB-006 候选 `680b868` [已验收](../evidence/LIB-006/acceptance.json)。Windows 上以真实 DSH Host、Chrome 和 SQLite，分别对 664 页 / 48,299,547 字节及 939 页 / 56,261,511 字节的 OpenStax 教材完成主跑及独立复核。整本和分章原件一致，物理页码不变；第 59 页跨页代码缩进恢复，第 67、350 页明确区分提取文本和原页版式。113 项受影响测试及 A07、A09 真实 Host 回归通过。[P02](../evidence/LIB-006/P02.json) 与 [A06](../evidence/LIB-006/A06.json) 绑定实际集成候选；F05、F06 verified，F07 仍待 A45。下一就绪单元 NOTE-001。

2026-11-21：SEARCH-001 已验收，[单元](../evidence/SEARCH-001/acceptance.json)及[完整 A09](../evidence/SEARCH-001/A09.json)绑定候选 `5483832`。LIB-006 在新候选上重跑 A09，不改写历史证据。

2026-11-21：SEARCH-001 已开始，[开发检查点](../evidence/SEARCH-001/checkpoint.json) `447c1211`。现有 PDF 已解析页和 Markdown/纯文本段落可在当前权限内检索。v18 仅追加；35 项专项与受影响回归、真实 Host/Chrome/SQLite 冒烟通过。完整查询集、项目撤权实跑、重启后的书签批注及独立验收未完成；SEARCH-001 不关单，A09 保持 NOT_RUN。

2026-11-21：READ-003 [已验收](../evidence/READ-003/acceptance.json)。候选 `1ce6e4f3` 在真实 DSH Host、Chrome 和 SQLite 完成主跑及独立复核。原生 Chrome 同窗口实测普通切换、待返回的 409/200 和撤权；此前的两次草稿丢失已记录并修复。28 项阅读回归、146 项规划门禁正反例通过；后者不是产品验收。下个就绪单元 SEARCH-001；A09、P03、A46 保持 NOT_RUN。

2026-11-20：READ-002 候选 `08889f9` 的 [T01/T02](../evidence/READ-002/acceptance.json) 同一冻结构建主跑与独立复核均通过。两类原始目录、个人书签、重启恢复、旧版与 Word 转换隔离、撤权清屏、并发冲突和 v16 回滚均有实测；先前独立发现的 PDF 未解析跳转和多行标题缺陷已修复。P03、A09 仍为 NOT_RUN；下个就绪单元 READ-003。

2026-11-20：READ-001 候选 `fdac3b0` 的 T01/T02 经[主运行](../evidence/READ-001/word-main-fdac3b0.md)和[独立复核](../evidence/READ-001/independent-fdac3b0.json)均通过。Word 引用按源段落定位，页内高亮继续绑定固定转换；翻页重试和真实撤权清屏已复验。P02/A09/A45 整场景不提前验收。下一单元 READ-002。

2026-11-20：READ-001 仍在开发。[第二轮独立复核](../evidence/READ-001/independent-35f4545.md) 确认撤权清屏和 v15 迁移通过，但 Word 源段落定位及浏览器翻页重试未通过。后续 `653fd9b` 已修复翻页重试，10 项 Chrome 夹具测试和[真实 Host 复验](../evidence/READ-001/retry-run.json)通过。继续修复 Word 后再冻结候选和独立复核；本单元及 P02/A09/A45 不提前放行。详见[交接检查点](../evidence/READ-001/checkpoint.json)。

2026-11-20：LIB-005 与完整场景 [A05](../evidence/LIB-005/A05.json) 在 `4675aa7` 通过主运行与[独立复核](../evidence/LIB-005/independent.json)。真实 Host、Chrome、SQLite 验证选择导入、原件回读、隔离及重试。F05 还依赖 P02，不标为 verified。下个依赖就绪单元是 READ-001。

2026-11-20：LIB-004 与完整场景 [A08](../evidence/LIB-004/A08.json) 在 `9196b1495ec040f6a00ec818c915424a0c1971ae` 通过主运行和[独立复核](../evidence/LIB-004/independent.json)。两组真实 Host 测试与 41 项专项测试均通过。原件、转换 PDF 和逐页反馈在原 Session 释放和 Host 重启后均可读；失败、取消、换版不会覆盖已有结果。F08 已验证，F05 尚待 ZIP 等验收，不把参考版式与转换版式视为完全相同。下一单元 LIB-005。

2026-11-20：LIB-004 进行中，起点 `58cea367`；`7cbed4c3cc1cd9ead3cc3361fca6e57c03ac4ad7` 为中间检查点，不是验收候选。v10/v11 迁移、授权 Word 原件、转换任务与租约、版本绑定 PDF、逐页反馈和 Word 界面已合入。42 项相关回归通过，含真实 SQLite 回滚和晚到回调、HTTP 权限与 Chrome 合成 API 界面测试。原生 Office 引擎已在隔离 DSH Host 单独验证；此提交还没有把引擎 worker 接入产品。恢复时先核对工作分支，整合 worker，构建并冻结候选，再执行真实 Host T02 竞态、T01/A08 Session 释放及独立复验；这三项仍为 NOT_RUN。测试预期见 [LIB-004 验收计划](../../scripts/lib004/acceptance-plan.md)。

2026-11-20：LIB-003 在 `0e9f37e` 通过 [T01、T02](../evidence/LIB-003/acceptance.json) 和[独立复核](../evidence/LIB-003/independent.json)。两次隔离运行均验证编码错误不发布、原件字节、版本定位、权限拒绝和重启回读；12 项专项测试通过。旧候选测试器失败已保留。F05、F07 仍在实现，A05 未作整体验收。下一单元 LIB-004。

2026-11-19：LIB-002 和完整场景 [A07](../evidence/LIB-002/A07.json) 在 `971f6bd14f6d12e4ab508091180b4eba0473a7e7` 上通过主运行与[独立复核](../evidence/LIB-002/independent.json)。真实 DSH 与 Chrome 在第 3 页处理中断，租约过期后从第 3 页接管；单页故障持久化，解除后只重试第 4 页，保留其余页状态。17 项配套回归分别通过，另外两个场景 P02/A06 没有运行；F06/F07/F42 不作整体通过声明。下一单元 LIB-003。

2026-11-19：LIB-001 在 `5d9dc58866d518c496677b3e85ba60c217323291` 通过 T01～T06。主运行和独立复核分别实测 Host、Chrome 与 SQLite，并各通过 24 项配套测试。详见[单元验收](../evidence/LIB-001/acceptance.json)和[独立复核](../evidence/LIB-001/independent.json)。A05、A45 不变。下一单元 LIB-002。FND-005 仍缺隔离 Host 上的授权 DeepSeek 路由，本轮实际推理为零。CHECK-004 未运行。

2026-11-19：持续协议迁移起点：FND-001～004、006 历史 passed；FND-005 保持 blocked，等待新候选真实 DeepSeek 复验。 当前证据见 [FND-006](../evidence/FND-006/REPORT.md)。

## 历史记录

2026-11-19 协议 v4.0.0：通过 SSH fetch 与远端回读确认接手提交 `2329f9d8f37aa985c51efe8365889ff2934bb5f1`。对照该提交，76 单元依赖、测试义务、状态、证据归属及 44 需求 / 66 场景矩阵未变。工作分支 `codex/knowledgeos-autonomous-20261119`。`node scripts/verify-plan.mjs` 通过；`node scripts/test-verify-plan.mjs` 80 项正反例通过；`node --test scripts/test-unit-queue.mjs` 4 项通过。`node scripts/unit-queue.mjs` 返回 FND-005 blocked，LIB-001、REPO-001 就绪。这些结果仅证明调度和证据门禁，不是产品验收。

更新：2026-11-17（Asia/Shanghai）。唯一 `CODEX_START.md` v3.2.0；执行器 Codex；active_unit=FND-004；auto_advance=false；unit_state=awaiting_user。FND-003 保持 passed，基线提交为 `5621f3d0e40dc11bcd2062687a9ad3087f8c4442`。

FND-004 已完成 v3 对象/项目/成员/grant 迁移、统一授权入口、个人对象隔离、项目动作差异、到期撤销和精确共享路由注册。T01–T07、类型检查、构建、FND-002/FND-003 范围回归及独立复核均 PASS；完整 A02/A34/A46 的搜索、AI、导出、邀请码和缓存部分保持 NOT_RUN。

FND-003 最终候选 `fnd003-candidate-20261117-r21` 已冻结。主运行 `docs/evidence/FND-003/runs/fnd003-candidate-20261117-r21/summary.json` 的 T01–T12 全部真实 PASS；独立运行 `docs/evidence/FND-003/runs/independent-20261117-r13/summary.json` 的受控适配器与实际 Host 生命周期检查全部 PASS。FND003-R1 至 R6 已关闭，FND-003 标记 `passed / test_result_status=PASS / independent_review_status=PASS / retest_status=PASS`。

本轮新增证据明确区分：实际固定版本 DSH Host 的正常、停止后不可用、重启恢复；受控适配器的非 loopback、Connection 缺失/停用/恢复；真实 Chrome 空库初始化；完整安装副本只篡改 `lib/index.js` 的 SHA-256 负例。历史 r16、r9 及更早结果保留，不改写。

FND-004 已冻结并通过本单元门槛，当前停在 FND-004 等待用户下一条指令；完整产品审查没有激活，不自动开始 FND-005、FND-006 或资料导入。
