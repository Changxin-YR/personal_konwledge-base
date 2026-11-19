# 第 2 包：技术回归判据

开发基线 c03ec437b2c648b16449598f89ac289bf307ccd2。冻结前运行不作验收；冻结后按指定候选重跑，运行期间产品变化不签发通过。只用回环 Host、合成账号及确定性本地 provider 夹具，不作模型验收。

| 范围 | 操作与失败条件 |
|---|---|
| FND-001 | 两次 owner GET 后以同目录重启，分别运行原 status-contract 的 same-instance、restart 模式，严格字段集、固定上游、时间和实例均须成立。 |
| FND-002/003 | 新建基础记录经第二个真实 Host 读取，同 ID、同正文、前后台账及应用标识不变。真实业务登录、陈旧偏好写冲突、登出后拒绝原 cookie；业务身份不能调用 owner 状态。 |
| FND-004/005 | 复用 ACL 矩阵、原生工具与 HTTP/SQLite 回归；覆盖跨用户、过期/撤权、重新判权、拒绝不写、幂等和重启。旧终态恰为 5，新终态恰为 6，不接受范围；历史迁移错误回滚点不变。带数据 v5 升级、失败回滚和重开由第 1 包提供独立证据，不以新库冒充。 |
| 预算 | 缺价格仍可执行，费用未知不冒充 0；已知夹具用量照实返回。低预算/历史调用数阈值下仍可连续成功并应给出金额超限提醒。历史配置测试的 429/503 保留在原文件，但不是新功能的正确结果。真正服务配额、超时不是预算提醒。 |
| T08 | UI 修复后 browser-checks 全流程：真实 Chrome 登录、写、重读，同一对象的业务 GET、SQLite、当前 option 的 value、data-revision、文本、revision 输入及界面详情一致（1 → 2）。保留超时、取消、冲突、草稿失效、切换账号、无配置等原断言。 |

固定 Host：共享根 .cache/build/dsh-39163dd/apps/cli/src/bin.ts；上游 checkout HEAD 与锁为 39163dd30f703a79079e2d2446545cff3c453738。build 缓存本身不是独立 Git checkout。模板 .cache/dsh-home-fnd003/profiles/knowledgeos-identity-test/node_modules/knowledgeos-panel 是 Junction，目标为 C:\Users\27363\Desktop\personal base\personal_konwledge-base\packages\knowledgeos-panel。包入口为 lib/index.js；client 导出为 lib/client.js，不代表 Host 直接加载了 client。每次独立记录产品树摘要及实际包入口。
