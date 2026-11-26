# KNOW-001 阅读语境术语卡

2026-11-26，冻结候选 `4d4275ded7afecc3c4ddec2612ac5006b717308f` 的 T01、T02 主跑及独立复跑通过。两次均通过锁定的 DSH Host 和 Chrome，将「索引」分别解释为数据库的检索结构与数组的元素位置。真实路由为用户指定的 `deepseek-v4.1-flash-1017` 和 `https://tokease.cn/v1`。 [主跑](runs/main.json) · [独立复跑](independent.json)

- 临时解释不创建永久术语或引用。显式保存生成私人记录，重放保持一条，其他账号有资料阅读权也看不到该记录。放弃第二次解释后阅读位置不变。服务重启并导入新版后，保存的条目仍定位到 V1 选中的那个「索引」。 [数据库索引](runs/main-database-term.png) · [数组索引](runs/main-array-term.png) · [原文](runs/main-term-fixed-source-return.png)
- 真实邀请被撤销后，受控响应没有发布解释或保存凭据，SQLite 保持原状。类型、构建、v36 迁移回滚、阅读位置及受控 AI 工具回归均通过。撤权和工具回归使用与最终候选一致的产品构建。 [撤权](runs/held.json) · [工具回归](runs/ai_regression.json)
- 早期请求的上限为 512 tokens，脱敏诊断验证词易返回 HTTP 200、推理内容及零正文，即使请求已带关闭思考的参数。最终上限为 1536，保持原生模型更低的已配置上限；派送清单只允许两段合成资料且每个阶段一次。最终四个成功请求共报告 860 个输入和 2224 个输出 tokens。按公开默认组审核上限估算，本次成功验收约 0.0076 美元，以供应商账单为准。 [初次问题](runs/512-token-diagnostic.jsonl) · [干跑校准](runs/term-calibration.json) · [费率上限](price-approval.json) · [主跑传输](runs/main-transport.jsonl) · [独立传输](runs/independent-transport.jsonl)

P03 和 A10 的练习、首次作答与阅读闭环由后续单元验收。 [单元验收](acceptance.json)
