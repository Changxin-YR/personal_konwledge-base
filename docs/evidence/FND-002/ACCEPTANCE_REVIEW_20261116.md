# FND-002 接管修复验收复核 · 2026-11-16

## 结论与范围

接受当前FND-002修复，可以按用户下一步指令准备FND-003。复核头为3535f16b1a429d32cd2c80f6c1462ce556fcb509，实际修复提交a03c9e3312707bd146e29953c2cf8153e498dd40，提交候选codex-takeover-20261116-r2。R1/R2关闭；本结论仅覆盖当前本地持久化切片。

本次下载的18个核心文件与29个新证据文本逐个核对Git blob SHA；候选表11个SHA-256与源码/构建/测试文件全部匹配。没有在当前Linux环境重跑完整Windows DSH Host九项验收；真实Host/浏览器结论基于已提交记录核对。独立实跑只包括下表的SQLite和比较器，均使用新合成数据。

## 核验结果

| 范围 | 结果与依据 |
|---|---|
| 新R1回归 | 6/6 PASS，exit0；[实际输出](reviews/3535f16/r1-candidate.json) |
| 旧baseline对照 | A-D四项FAIL，E/F通过，exit1；[实际输出](reviews/3535f16/r1-baseline.json) |
| R2比较器 | 临时profile三个产物全匹配exit0；仅改临时副本index.js后hash mismatch、exit1；[实际输出](reviews/3535f16/r2-comparator.json) |
| 新T01–T09 | 已提交9/9 PASS、113条断言均ok，suite与逐项时间一致；T01 PID39980→62044，同记录回读 |
| R1真实Host | T04外来sqliteX表fixture业务503 STORAGE_INCOMPATIBLE、status可达、库逻辑状态不变；正常恢复201 |
| R2证据 | T05按key计数1与断言相同；T09三产物逐值匹配、篡改副本失败，非空真实起止时间 |
| 独立记录 | SQLite73/73、真实Host/HTTP59/59、对象11/11；浏览器18步、无failures/not_run |

原始提交依据见 [候选](candidate.md)、[报告](REPORT.md)、[独立复核](independent-verification.md)、[新运行](runs/codex-takeover-20261116-r2/)。主artifact checker按manifest的link/file推导路径，泛化能力可以后续加强；本候选独立check-db实际读取profile/node_modules/knowledgeos-panel并与冻结hash比较，补足真实安装来源证据，不因此重开本轮。

v1 SQL/checksum、SCHEMA_VERSION=1、application_id和数据库名未漂移；HTTP/records/config/index、客户端和依赖保持。旧baseline文件仅BOM/换行与历史产物字节不同，归一后业务源码相同；不把其字节hash当原产物hash。

## 证据发布修正

验收前发现README等当前文档仍写R1/R2 OPEN，已同步关闭事实。T09浏览器summary的dsh_root/home和T09内嵌stdout的out共3处私人Windows路径已替换为占位符；保留所有断言、时间、业务值和候选hash。原文件字节可追溯3535f16的Git历史，当前脱敏不宣称重新运行测试。

远端没有T01引用的t01-before.log、t01-after.log和T04引用的t04-host-future.log、t04-host-valid.log。它们是原执行机日志引用，当前公开的是已存在JSON/文本摘要，不能宣称原始日志已发布或根据摘要重建。独立输出中其他.log引用也按同一范围解释；原执行机是否仍保留完整日志未在本次核实。

## 剩余限制

Desktop/Electron、Windows安装、突然断电零丢失、OS级fd泄漏、Host级迁移故障注入及回滚自身失败构造未由本轮证明。它们不新增为本次收口条件。F03身份功能、完整A02/A03、共享ACL与模型仍需各自单元新证据。

FND-002保持passed；下一步只激活FND-003，完成后仍等待用户，不自动推进。
