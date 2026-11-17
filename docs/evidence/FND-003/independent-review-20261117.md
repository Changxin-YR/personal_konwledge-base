# FND-003 独立复核

更新：2026-11-17（Asia/Shanghai）  
最终候选：`fnd003-candidate-20261117-r21`  
主运行：`docs/evidence/FND-003/runs/fnd003-candidate-20261117-r21/summary.json`  
独立运行：`docs/evidence/FND-003/runs/independent-20261117-r13/summary.json`

主运行 T01–T12 全部 PASS，独立补充检查全部 PASS。独立复核把实际固定版本 Host 与受控适配器分开记录：真实 Host 覆盖身份接口正常、Host/Connection 停止后的不可用和重启恢复；受控适配器覆盖生产 loopback 地址解析、非 loopback、Connection 缺失/停用/恢复。T11 从空数据库通过真实 Chrome 创建管理员并核对恰有一个管理员；T12 先复制完整有效安装目录，再只篡改 `lib/index.js`，实际加载校验器非零退出且唯一报告该文件 SHA-256 不一致。FND-002 status/records 回归通过。

任何失败、异常或缺项都会使脚本返回非零；本次没有此类结果。新摘要与报告已脱敏，历史 r16、r9 及更早结果保持原样。
