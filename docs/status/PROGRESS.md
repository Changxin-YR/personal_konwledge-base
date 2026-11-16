# 实际进度

更新：2026-11-16（Asia/Shanghai）。唯一指令CODEX_START.md v3.1.0，执行器Codex，当前FND-003 ready / planned，auto_advance=false。

## 已完成基础

FND-001已验收。FND-002修复提交a03c9e3及交接头3535f16已复核接受：11个候选哈希匹配，T01–T09有113条通过断言，独立SQLite 73/73、Host/HTTP 59/59、对象11/11记录一致；本次另实跑R1新6/6、旧反例4失败及R2哈希比较正反对照。见 [验收复核](../evidence/FND-002/ACCEPTANCE_REVIEW_20261116.md)。完整Host记录由原执行机产生，本次没有重跑整套Windows Host验收。

## 当前仅激活FND-003

工作分支codex/knowledgeos-fnd-003，从3535f16接续。范围是本机初始化、注册登录/退出、业务会话、本人方向目标/个人空间、账号页与必要v2迁移。只准备了执行契约和十二项测试义务，产品源码尚未实施，本轮测试全部NOT_RUN。

| 范围 | 当前状态 |
|---|---|
| FND-001 | passed |
| FND-002 | passed，R1/R2 CLOSED，历史证据保留 |
| FND-003 | ready / planned；产品测试、独立运行NOT_RUN |
| FND-004及以后 | planned，未激活 |
| 44项完整需求与66个完整场景 | 未提前verified/PASS |
| 完整产品审查、Desktop/Windows安装、真实模型 | 未启动或未运行 |

Codex依唯一入口逐项开发和测试，完成后停在FND-003等待下一次用户指令。旧API额度问题继续排除。
