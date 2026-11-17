# FND-003 独立复核收口

更新：2026-11-17（Asia/Shanghai）  
最终候选：`fnd003-candidate-20261117-r21`  
主运行：`docs/evidence/FND-003/runs/fnd003-candidate-20261117-r21/summary.json`  
独立运行：`docs/evidence/FND-003/runs/independent-20261117-r13/summary.json`

独立复核 r13 全部 PASS，并把实际 Host 与受控适配器分开记录：

- `T01-adapter` 调用生产 `isLoopbackAddress()`，覆盖 IPv4、IPv6、mapped IPv6、括号、非法 IPv4 和非 loopback 反例。
- `T02-connection-adapter` 调用生产 `isIdentityRuntimeAvailable()`，覆盖正常、Connection 缺失、browser Peer 停止、非 loopback listener 和恢复。
- `T02-connection-host` 使用固定版本 DSH Host 的隔离 profile，记录身份接口运行时 200、Host/Connection 停止后不可用且无匿名回退、重启后恢复 200。
- 其余 gap checks 覆盖 session 边界、来源拒绝、私人空间隔离、DTO/UTF-8、伪 v2、重复注册、取消 KDF 和迟到 `/me` 响应。

主运行 T01–T12 全部 PASS。T11 通过真实 Chrome 从空数据库初始化管理员并核对单管理员；T12 通过完整有效安装副本后只篡改 `lib/index.js`，同一加载检查器以非零退出并唯一报告该文件 SHA-256 不一致。新摘要仅保留相对路径、状态和哈希；历史运行结果未改写。任何失败、异常或缺项都会使独立脚本返回非零，本次没有此类结果。
