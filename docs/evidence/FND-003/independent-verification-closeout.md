# FND-003 独立复核结论

更新：2026-11-17（Asia/Shanghai）  
复核候选：fnd003-candidate-20261117-r16  
独立运行：independent-20261117-r9

独立脚本在端口 3115、固定 DSH Host 和独立业务目录中运行，退出码为 0，结果为 PASS。所有断言均通过：IPv4/IPv6 loopback、会话到期边界、客户端 session_id 拒绝、来源矩阵、跨身份空间隔离、输入边界、伪 v2 不变、重复注册回滚、真实 HTTP 取消和浏览器迟到 /me 退出竞态。

独立脚本现在在结果为空、断言失败或异常时设置非零退出码，并接受 candidate 参数。最终候选清单纳入 independent-verification.mjs 与 check-loaded-artifacts.mjs。T12 另外运行实际加载检查器，解析 profile package 的 realpath，逐个比较 source/loaded 文件的 SHA-256 与字节数，并把篡改安装副本交给同一检查器；篡改检查返回非零。

复核边界明确区分真实 Host、真实 Chrome、真实 SQLite、受控适配器和测试夹具。受控适配器只覆盖不能安全改变生产监听的地址分类/故障注入，不替代真实 Host 或浏览器。旧 r5 独立结果继续保留，r9 绑定最终候选。

结论：independent_review_status=PASS；FND003-R1 至 R6 全部关闭；没有 FAIL、BLOCKED 或 NOT_RUN 结果计入 FND-003 通过。FND-004 未开发。
