# FND-002 当前进度

更新：2026-11-16。Codex 已接管 `codex/knowledgeos-takeover`，完成已有项目理解、R1/R2 修复、新候选真实复测和独立复核。当前单元为 `awaiting_user`，`auto_advance=false`。

FND-002 已实现本地 SQLite 持久化探针：可信 dataDir、两表 v1 迁移、归属/版本/对象预检、真实认证 Host create/get、幂等、事务回滚、有限锁等待、重启读取和连接释放。架构落点见 `packages/knowledgeos-panel/src/host/{index,http,records,storage,config}.ts`。

本轮关闭：

- R1：以完整 `sqlite_master` 枚举后按字面 `startsWith('sqlite_')` 过滤，预检和打开后校验一致；`sqliteX_*` 表/视图/索引/触发器均拒绝且库不改，空白库与真实 `sqlite_autoindex_*` 对照继续可用。
- R2：T05 证据保存按幂等键过滤的计数；T09 比较 profile 实际加载产物与冻结 manifest 的 SHA-256，并通过篡改副本负例；summary 使用真实套件开始时间；负例临时文件不进入证据目录。

新候选证据：`docs/evidence/FND-002/runs/codex-takeover-20261116-r2/`。主 T01–T09 为 9/9 PASS；独立 SQLite 73/73、真实 Host/HTTP 59/59、对象回归 11/11、构建/类型/范围/浏览器回归和脱敏检查均 PASS。旧候选结果仍保留在历史目录，不能替代本轮结果。

FND-001 保持 passed。FND-003 及后续功能、正式业务实体、账号/ACL、多用户、模型/RAG、jobs/outbox、安装包和 Desktop/Electron 未激活或未运行。
