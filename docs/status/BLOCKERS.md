# 阻塞与待验证条件

更新：2026-11-16。FND-002 已在真实隔离 DSH Web Host 与真实 SQLite 上完成九项测试、独立复核和返修；当前无阻塞本单元交付的条件。

## FND-002 结果

| 项 | 状态 | 说明 |
|---|---|---|
| 独立业务 SQLite 文件 | CLOSED | `<dataDir>/knowledgeos.sqlite`，两表、归属/版本/账本、WAL/FK/FULL/250ms 均已实测 |
| 已认证 create/get | CLOSED | 真实 Host handler；201/200/409/404/405/413/415/422/503 实测 |
| 重启持久化 | CLOSED | Host 真正停止/重启后同一记录逐字节一致，独立只读 SQLite 核对 |
| 事务/迁移/归属保护 | CLOSED | 事务回滚、迁移失败、未来版本、坏 checksum、错 application_id、未知表/视图均拒绝 |
| 幂等/并发 | CLOSED | 同键同内容 200 同 ID/time；异内容 409；并发 201+200 且唯一行 |
| 打开失败/锁等待/恢复 | CLOSED | 503 STORAGE_UNAVAILABLE；503 STORAGE_BUSY retryable，351 ms；释放后恢复 |
| 连接释放/重开 | CLOSED | close 日志恰一次；重开保留数据并可写；不以 404 代替 close |
| FND-001 回归 | CLOSED | panel/status/刷新/失败恢复/旧 profile 无 dataDir 行为均保留 |

## 当前单元剩余限制（非阻塞）

| 项目 | 状态 | 说明 |
|---|---|---|
| Desktop/Electron 探针 | NOT_RUN | 最低门槛为真实 Node Web Host；未另起桌面实例 |
| Host 级迁移中途失败 | NOT_RUN | T04 用同一真实适配器/迁移代码在隔离 fixture 上执行 |
| 回滚自身失败 fail-closed | 代码审查 + 正常路径 | 未安全构造故障；不能由正常重启证明断电零丢失 |
| Windows 安装包、多人账号、真实 GPT | NOT_RUN | 范围外，后续单元 |

## 历史候选

`d7a453d` 的九项 PASS 与独立复核保留在 `docs/evidence/FND-002/runs/d7a453d/` 并标 SUPERSEDED；它把“仅 VIEW 的非空库”误判为空白，已由 `1b99e39` 修复并复测。

真实阻塞记录必须包含：当前 unit_id、失败动作与错误、时间、候选提交/指纹、影响测试、已尝试修复、最小解除条件和本单元剩余可做内容。未尝试写 NOT_CHECKED/NOT_RUN，不写 BLOCKED。FND-002 证据中的 token/Cookie 已脱敏；数据库、WAL/SHM、私有路径未进入公开证据。
