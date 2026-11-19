# FND-006 第 1 包独立技术复核

结论：PASS（本包 7/7，最终完整运行退出 0）。不代表 T07/T08、真实模型或整个单元的验收。

- 冻结 Git tree：80738ce0b1705dfc15a80ac9852d76a170d7ede1（非提交 SHA）。实际 Host 插件入口 SHA-256：239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84。
- 实际命令：node scripts/fnd006/independent/run.mjs 80738ce0b1705dfc15a80ac9852d76a170d7ede1 239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84
- 最终 [summary.json](./80738ce0b170-1795070594256/summary.json) 含前后身份核验及逐进程命令、退出码。Windows、Node v24.22.0，回环 Host、每项独立进程和临时 SQLite 库；没有配置模型路由或调用外部模型。未提交、未推送。

|证据|独立观察|
|---|---|
|[T01](./80738ce0b170-1795070594256/T01.json)|Host PID 76716 在 checkpoint=1、无结果/事件时强杀。新 PID 72076 从同一目录和检查点接管；原尝试 LEASE_EXPIRED，第二次成功，结果/事件各一。|
|[T02](./80738ce0b170-1795070594256/T02.json)|并发同键返回同一 ID；换对象 409 IDEMPOTENCY_CONFLICT。正常重复投递仅一回执。event:after-receipt 一次失败后可恢复一次；连续三次失败无回执，越过重试窗口后无法再领取或直接消费。重启 GET 可见 failures=3、last_error=CONSUMER_FAILED、delivered_at=null。|
|[T03](./80738ce0b170-1795070594256/T03.json)|PID 62960、69676 同毫秒开始 claim，仅前者获得有效令牌。到期接管后旧令牌不能续租、写检查点或提交；新令牌成功。|
|[T04](./80738ce0b170-1795070594256/T04.json)|续租越过原截止点未被抢占；自然过期与显式 worker 错误各连续三次，分别记录 LEASE_EXPIRED、WORKER_ERROR；耗尽后不复活。|
|[T05](./80738ce0b170-1795070594256/T05.json)|两个提交故障点均从异常原因链识别；独立连接读取的故障前后快照相同。原令牌重试成功，各一份结果和事件。|
|[T06](./80738ce0b170-1795070594256/T06.json)|正常对照成功。checkpoint=1 后分别取消、改版本、撤销对象权限、注销会话，各自均为零结果、零事件，运行历史分别为 CANCELLED、REVISION_CONFLICT、AUTH_REVOKED、AUTH_REVOKED。|
|[V6](./80738ce0b170-1795070594256/V6.json)|用固定 c03ec437 基线构建生成带用户、会话、知识对象的 v5 库。v6:after-schema 回滚后版本、账本、schema 和逐表内容摘要完全一致；正常升级到账本第 6 条，再次重开快照一致。|

技术复核：核对了 JobStore 的写事务、令牌/截止时间检查、提交时业务会话与对象版本复核、消费者保存点和 v6 迁移事务；上述结果来自实际 Host/SQLite 行为，不使用模型或替代存储。本包未发现阻断产品缺陷。未测试任意断电、海量积压或多机时钟差异，不作这些保证。

首轮 [summary.json](./80738ce0b170-1795070438501/summary.json) 原样保留，退出 1。T06 的 Bob 只有对象授权，没有项目成员资格，入队按预期返回 404，未进入 ACL 撤权子例。仅修正测试前置，补充 GET 200 正向断言，撤销后仍要求 404；随后在同一产品树完整复跑。两轮结果没有拼接。

本角色新增文件：scripts/fnd006/independent 下的 run.mjs、case.mjs、common.mjs、host-cases.mjs、storage-cases.mjs、claim-child.mjs、migration.mjs、migration-child.mjs；docs/evidence/FND-006/independent 下的 contract.md、本报告，以及两轮各自的 summary.json、T01.json 至 T06.json、V6.json。数据库、凭据和原始 Host 启动日志不进证据目录。
