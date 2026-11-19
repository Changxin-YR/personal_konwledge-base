# FND-006 交付与验收

2026-11-19，Asia/Shanghai。**FND-006 T01–T08 全部通过，状态为 passed / awaiting_user。** 工作分支 `codex/knowledgeos-fnd-006`。产品候选 Git tree 为 `80738ce0b1705dfc15a80ac9852d76a170d7ede1`；完成两组独立验收后，将该树原样提交为 `5e3cc68b7182146b45ae38d8059202b23fe23d83`。后续交付记录不改变产品树。

## 验收结果

| 范围 | 实测结论 | 证据 |
|---|---|---|
| T01–T06，T07 的 v6 迁移部分 | 7/7 独立进程退出 0。真实 Host 强杀重启后，从 checkpoint 1 接管并只提交一次；两个进程竞争、旧令牌失效、耗尽、重复投递、两处事务故障及取消/撤权/版本变化均符合预期。v6 注入失败后 v5 数据完整，升级并重开无损。 | [独立复核](independent/review.md) |
| T07 受影响技术回归，T08 修复后 UI | 7 套件、68 项检查通过，19 条实际 Host 加载记录与候选哈希一致。真实 Chrome、HTTP、SQLite 均从 revision 1 变为 2。夹具累计估算 0.28 USD，高于 0.001 USD 阈值后只提醒；无价格记录为未知。 | [独立回归报告](regression/REPORT.md) |
| 补充检查 | `node scripts/fnd005/barrier-checks.mjs docs/evidence/FND-006/barriers` 退出 0，5 项通过；与独立回归有重叠，不重复计数。`node scripts/fnd005/provider-evidence-check.mjs` 本地 HTTP 模拟三项退出 0，仅验证证据工具。 | [权限屏障](barriers/summary.json) |

首轮 T06 夹具没有建立项目成员资格，入队被正确拒绝；修正夹具后在同一产品树完整重跑，不拼接结果。回归脚手架首次复制 Windows Junction 失败，未进入产品断言；修复隔离环境后完整运行。失败及重试记录均保留。

精确命令、退出码、候选 SHA、数据库前后状态见上表和[机器可读验收索引](acceptance.json)。`node scripts/fnd006/check-candidate.mjs 80738ce0b1705dfc15a80ac9852d76a170d7ede1` 退出 0，35 个产品文件与冻结树一致，v1～v5 SQL 字节和加载产物的 checksum 逐一匹配基线。FND-005 继续 blocked；完成本单元后停止，无后续单元被激活。

## 安全切换与范围

`git status --short --branch` 核对干净工作树；`git remote -v` 显示 origin 和 ssh-origin 指向同一仓库。`git ls-remote --heads origin` 退出 1（本机 Git 缺少 remote-https helper），`git ls-remote --heads ssh-origin` 退出 0：开发头 `c03ec437b2c648b16449598f89ac289bf307ccd2` 与本地一致，无远端 006。`git switch -c codex/knowledgeos-fnd-006 c03ec437b2c648b16449598f89ac289bf307ccd2` 退出 0。未改 main、未清除既有文件。

正式前置是 [已通过的 FND-004](../FND-004/REPORT.md)，绑定前置提交 `4282b9231a4ac38b0eb87145c337b811aec033e4`。继承 v5 迁移、业务会话及 ACL、受控模型工具、幂等写入与 UI 版本修复，存在迁移归属、运行时路由和旧版回归断言风险。[旧 GPT 验收](../FND-005/REPORT.md)未完成；[历史 HS14 实测](../FND-005/live-hs14-Oaxv9B/REPORT.md)针对 UI 修复前产物，两次真实调用不能取代当前候选的独立模型验收。本轮没有向模型提供方发起推理请求。

## 实现

SQLite v6 只追加任务、尝试记录、结果、事务事件和消费回执。`POST /knowledge/v1/jobs` 使用业务会话，按用户与幂等键去重；GET 按用户和当前对象权限返回任务状态、尝试记录与投递状态；取消同样要求当前业务身份。探针只记录输入版本，不复制正文，不修改对象。检查点和每次尝试的起始位置持久保存。

固定 Host 每 500ms 执行一次短步骤，租期 3 秒，最多三次尝试。取得 SQLite 写锁后用新时间核验令牌、会话、对象 ACL 和版本。正常完成一次性提交结果、成功事件和任务终态；消费者唯一键阻止重复处理。消费失败时回滚回执，在同一事务记录错误与下一次重试时间，三次失败后停止自动投递。

模型端复用已配置的 DSH provider 和模型标识，未知或非 DeepSeek 路由不发起请求；地址和凭据由适配器解析。每次请求一次尝试，保留超时和并发控制；未知价格/超过费用或次数阈值不拒绝请求。用量与已知单价只作估计，不是供应商账单。

## 候选边界

第一轮结构门禁、类型检查和构建通过。中间候选 `0f6129042f85530ad000059c33d460b43378c82c` 经契约复查发现消费者失败未持久记录；补充失败计数、退避和耗尽后重新冻结，旧候选不得代替最终结果。最终 Host 入口 SHA-256 `239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84`。范围不含真实模型验收、PDF、自动提醒、完整产品验收和 Windows 安装。
