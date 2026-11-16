# FND-002 提交复核 · 2026-11-16

## 当前结论

**需要修正，继续 FND-002；暂不激活 FND-003。** 第二部分主体实现与多数已覆盖行为有真实证据，但一个真实磁盘 SQLite 反例推翻了 T04 的完整通过结论。当前执行状态重新登记为 in_progress，唯一提示词更新为 v2.1.1，R1/R2 待处理。

- 复核提交：`cba39e4808fd41e6d7b076c3fbf080577c8b1114`。
- 产品候选：`1b99e392593ef0213f68f8dfb45f5d34a06eac1b`。
- 原证据：`docs/evidence/FND-002/runs/1b99e39/`。
- 本次实际复现：[root-prefix-result.json](reviews/cba39e4/root-prefix-result.json)，结果 FAIL、退出码 1。
- 可重跑脚本：[repro-sqlite-name-prefix.mjs](reviews/cba39e4/repro-sqlite-name-prefix.mjs)。脚本元数据绑定此次被审候选；新修复验证另记录新候选。

## 1. 已确认的有效成果

candidate.md 中 11 个关键文件 SHA-256 与实际提交文件逐值匹配。T01–T09 共 109 条断言有实际值和逐项时间；记录涵盖真实 HTTP、Host 重启（PID 59508→61400）、同记录回读、独立 SQL、事务回滚、有限忙锁、连接释放和面板回归。独立 check-db 73/73、boundary 59/59、view-objects 11/11 也有实际脚本、日志与结果。

这些历史记录保留其覆盖价值，不能被新反例全部改写为“未测试”；它们也不能证明未覆盖边界正确。当前环境重新运行计划检查和本轮范围检查均 exit 0/PASS，这两项只说明结构/范围符合，不能发现本次归属缺陷。

## 2. R1：内部对象过滤漏掉合法用户对象（阻止收口）

位置：`packages/knowledgeos-panel/src/host/storage.ts` 的 readDatabaseFacts（原候选第 109 行）、空白判断（第 187 行）、#verify（第 265 行）。两处查询使用：

```sql
WHERE name NOT LIKE 'sqlite_%'
```

SQLite LIKE 中 `_` 是单字符通配符，所以合法用户对象 sqliteX_foreign_private 也被排除。官方语义见 [SQLite 表达式说明](https://www.sqlite.org/lang_expr.html#like)；schema 包含表、索引、视图和触发器，见 [Schema table](https://www.sqlite.org/schematab.html)。

在新的合成磁盘库中创建该表及一条哨兵记录，再用提交的 lib/storage.js 打开，真实结果如下：

| 属性 | 打开前 | 打开后 |
|---|---|---|
| 应用归属 application_id | 0 | 1263489841（KOS1） |
| 应用版本 user_version | 0 | 1 |
| journal_mode | delete | wal |
| schema | 一张外来用户表 | 外来表仍在，另新增本项目两表及自动索引 |
| 原记录 | foreign existing data | 仍保留 |
| 适配器判断 | 应拒绝 | available=true，无错误 |

**没有观察到原记录删除；观察到的是外部非空库的归属、版本、日志模式与结构被修改。** 这直接违反当前契约“未知非空数据库在修改性配置与迁移前拒绝”。

复现环境为 Node v24.22.1 / SQLite 3.53.4，加载的 lib/storage.js SHA-256 为 `40fa07f07550d9b20cfe24b80d27844a27f40ce7ce9fd7c8c6c9a84a9e3f9d65`。代码审查角色和主复核各在自己的合成临时库复现；均未修改产品或用户数据。

最小修复是准确识别字面 sqlite_ 前缀，同时覆盖两处生产查询，保留所有用户对象类型。不需要新 schema 版本、改旧迁移 checksum、删库或新架构。正常空白库及含 sqlite_autoindex_* 的合法 v1 库必须继续可用。

## 3. 原独立检查的共同盲区

`runs/1b99e39/independent/check-db.mjs` 原第 48、107、127、298 行和 `view-objects.mjs` 第 45 行同样使用错误 LIKE 过滤；主脚本也依赖产品 readDatabaseFacts。因此角色虽独立运行，归属判据却复用了同一错误。

新增回归要直接获取完整 sqlite_master type/name/sql、PRAGMA 与原数据，再以独立判据识别字面前缀。外来表、仅视图、合法库多出索引/触发器各覆盖必要反例，另保留正常库/内部自动索引对照。至少一项在真实隔离 Host 上验证拒绝和 Host 可达；不能只靠适配器测试替代全部网络证据。

旧 runs 原文件保留，不事后修成“当时已覆盖”。新的独立脚本、候选和真实结果写入新目录。

## 4. R2：本轮证据脚本与状态收尾

| 位置（原 run-all.mjs） | 实际问题 | 最小处理 |
|---|---|---|
| 第 354 行，T05 | 断言按 key 计数，但 actual 记录全表计数 | 用同一个过滤后值断言并留证 |
| 第 517–521 行，T09 | 固定读仓库路径、只判断 hash.length===64 | 从实际 profile 解析产物，与冻结候选 SHA-256 逐值比较；临时副本负例必须拒绝 |
| 第 153/554 行 | results 不含 started，summary.started_at 为 null | 保存真实开始/结束时间并验证顺序 |
| evidence README | 同时保留“已通过”与“实现/测试尚未开始” | 当前状态统一为待修；历史结果有版本标注 |

旧候选的实际加载路径和产物一致性已有独立报告补足；D2/D6 也不证明产品本身失效。将这些已知问题随本轮回归修正，以保证下一候选验收记录可靠。

## 5. 当前审查项

| ID | 状态 | 关闭依据 |
|---|---|---|
| R1 | OPEN | 前缀识别修复；真实反例拒绝且逻辑元数据保留；正常库可用；真实 Host 拒绝对照 |
| R2 | OPEN | 计数/真实加载指纹/时间修正；哈希不一致负例被拒绝；新候选测试与状态一致 |

新候选改变数据库初始化路径和验收脚本，按唯一提示词在当前功能范围复跑九项测试并独立复核；不新增 Desktop、安装包、未来账号/模型等门槛。完成前继续 in_progress，FND-001 通过状态保留，Codex locked。

## 6. 本次检查的限制与修改边界

本次完成了提交源码/证据核对、11 个候选哈希比对、计划/范围检查，以及真实磁盘 SQLite 反例；没有重新启动完整 Windows DSH Host，没有重新执行全部九项原验收，也没有验证 Desktop 或安装包。

本次仓库修改仅为复核记录、失败复现证据、唯一修正提示词和状态/文档同步。产品源码、构建产物和原测试脚本未改；R1 修复及新候选运行仍由 DSH 执行。原有任何完整 F 需求与 A/P 验收状态均未升级为通过。
