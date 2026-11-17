# 实际进度

更新：2026-11-17（Asia/Shanghai）。唯一 `CODEX_START.md` v3.2.0；执行器 Codex；active_unit=FND-004；auto_advance=false；unit_state=awaiting_user。FND-003 保持 passed，基线提交为 `5621f3d0e40dc11bcd2062687a9ad3087f8c4442`。

FND-004 已完成 v3 对象/项目/成员/grant 迁移、统一授权入口、个人对象隔离、项目动作差异、到期撤销和精确共享路由注册。T01–T07、类型检查、构建、FND-002/FND-003 范围回归及独立复核均 PASS；完整 A02/A34/A46 的搜索、AI、导出、邀请码和缓存部分保持 NOT_RUN。

FND-003 最终候选 `fnd003-candidate-20261117-r21` 已冻结。主运行 `docs/evidence/FND-003/runs/fnd003-candidate-20261117-r21/summary.json` 的 T01–T12 全部真实 PASS；独立运行 `docs/evidence/FND-003/runs/independent-20261117-r13/summary.json` 的受控适配器与实际 Host 生命周期检查全部 PASS。FND003-R1 至 R6 已关闭，FND-003 标记 `passed / test_result_status=PASS / independent_review_status=PASS / retest_status=PASS`。

本轮新增证据明确区分：实际固定版本 DSH Host 的正常、停止后不可用、重启恢复；受控适配器的非 loopback、Connection 缺失/停用/恢复；真实 Chrome 空库初始化；完整安装副本只篡改 `lib/index.js` 的 SHA-256 负例。历史 r16、r9 及更早结果保留，不改写。

FND-004 已冻结并通过本单元门槛，当前停在 FND-004 等待用户下一条指令；完整产品审查没有激活，不自动开始 FND-005、FND-006 或资料导入。
