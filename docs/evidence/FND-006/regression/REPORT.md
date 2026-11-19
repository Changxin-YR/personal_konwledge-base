# 第 2 包最终候选：PASS（技术回归）

2026-11-19，Git tree（非提交）80738ce0b1705dfc15a80ac9852d76a170d7ede1，产品入口 SHA-256 239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84。运行前后产品文件与冻结 tree 一致。上游 checkout 与锁均为 39163dd30f703a79079e2d2446545cff3c453738。独立进程加载钩子 19 条记录均解析到 C:\Users\27363\Desktop\personal base\personal_konwledge-base\packages\knowledgeos-panel\lib\index.js，哈希相同。测试用回环端口 3261–3267 已无监听。没有调用真实模型；不改变 FND-005 blocked，不代签 T01–T06。

| 最终候选套件 | 检查数 | 退出码 | 观察结果 |
|---|---:|---:|---|
| browser-checks + 独立三方比对 | 11 | 0 | 同一 ID 的 HTTP、SQLite、Chrome 当前选项和详情从 revision 1 到 2；无页面错误。 |
| configuration-checks | 22 | 0 | 使用候选更新的本地 deepseek-controlled-tool-model；验证配置、缺价格、金额与调用次数预警、适配器无凭据和错误区分。两个凭据/目录探针的网络请求均为 0。 |
| 状态、记录重启、预算 | 3 | 0 | 原 status-contract 两种模式均退出 0。Host PID 46236 → 44852；同一记录 ID 和正文读回，6 条迁移账本与应用 ID 未变。低预算 0.001 USD 下两次执行成功，已知估算 0.28 USD、提醒为真；缺价格时两次成本均计为未知。两种场景都上报输入 200、输出 80 tokens。 |
| run-all 技术集成 | 14 | 0 | owner 与业务登录隔离、原生工具读写、撤权/过期拒绝、版本冲突、幂等与重启后回执通过。 |
| acl-regression | 7 | 0 | 权限矩阵、撤销后不可见、重新授权与历史、迁移回滚及高权限路由隔离通过。 |
| storage-checks | 6 | 0 | v5 注入故障仍回到 v4；恢复终态恰为 v6。事务回滚、会话锁等待、伪造结构拒绝通过。 |
| barrier-checks | 5 | 0 | 撤权/登出后不返回正文；提交前取消无写入，提交后取消保留唯一回执。 |

共 68 项套件检查，并非 68 个需求或产品验收场景。第 1 包的同树 V6 证据（independent/80738ce0b170-1795070594256/V6.json）另验带数据 v5 → 故障回滚 v5 → v6 → 再开 v6，非本包重复执行。

共享根执行：

~~~powershell
node scripts/fnd006/regression/run.mjs frozen 80738ce0b1705dfc15a80ac9852d76a170d7ede1 239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84
node scripts/fnd006/regression/supplement.mjs frozen-2026-11-19T06-40-15-290Z
~~~

两条命令均退出 0。复跑第二条时传第一条实际输出的新目录名。最终目录中的 run.json、supplement.json 含逐套件命令、退出码、输入来源、原/实际运行脚本摘要、加载证据与状态；observed.json 保留三个原始状态响应和七个 ACL 用例详情。三张截图仅作佐证。包含数据库、原始 Host 日志等的隔离工作目录被 .cache 忽略，不纳入交付。

原 v5 套件文件不变；仅在副本内把终态 5 精确改为 6，保留故障回滚到 v3/v4 等断言，不接受版本区间。浏览器断言仅增加；变更复制方式和端口用于隔离。开发期 baseline-2026-11-19T06-35-30-408Z/run.json 保留脚手架 EPERM（退出 1；未进入产品断言），不计入最终结果。已撤回的 0f612904… 未作为最终候选。
