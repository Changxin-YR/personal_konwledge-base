# FND-002 独立复核结论

复核角色：独立测试/验收路径；候选：`codex-takeover-20261116-r2`；分支：`codex/knowledgeos-takeover`。

## 结果

- 主验收 `run-all.mjs`：T01–T09 **9/9 PASS**，新 summary 开始/结束时间非空。
- `check-db.mjs`：**73/73 PASS**，独立只读连接核对真实 SQLite 数据、schema、账本、约束、重启、幂等、生命周期和 profile 加载哈希。
- `boundary.mjs`：**59/59 PASS**，独立启动固定上游 Host，核对认证、来源、输入、双进程并发、关闭/重开和旧 profile。
- `view-objects.mjs`：**11/11 PASS**；对象扫描使用完整 `sqlite_master` 加字面 `startsWith('sqlite_')`，不复用旧 LIKE 判据。
- `regression-sqlite-prefix.mjs`：当前 `lib/storage.js` **6/6 PASS**；冻结旧 baseline A–D **4 项失败**，证明回归能区分旧候选与修复候选。
- T09 加载产物 checker：profile 实际 `lib/index.js`、`lib/storage.js`、`lib/client.js` 与冻结 manifest 逐项匹配；临时篡改副本退出码 1，被正确拒绝。
- 脱敏/卫生扫描：PASS；无原始 token、Cookie、数据库、WAL/SHM 或私有绝对路径。

## 证据路径

`docs/evidence/FND-002/runs/codex-takeover-20261116-r2/` 保存主结果、独立脚本、输出、Host 日志、浏览器截图和脱敏报告；`docs/evidence/FND-002/runs/codex-takeover-r1/r1-regression.json` 保存 R1 当前候选回归；旧 `runs/1b99e39/`、`runs/d7a453d/` 和 `SUBMISSION_REVIEW_20261116.md` 保留历史事实。

## 限制

Desktop/Electron、Windows 安装、突然断电、OS 级 fd 泄漏、Host 级迁移故障注入和回滚自身失败构造未运行或不能由本轮证明；本轮只关闭 FND-002 已实现基础内的问题。

最终结论：当前 FND-002 单元通过，状态等待用户；完整产品和 FND-003+ 仍未激活。
