# EXPLAIN-002 模块讲解验收记录

2026-11-27，单元验收 **BLOCKED**。两次真实运行都在生成模块讲解时失败。每次供应商返回 HTTP 200，正文为 0 字符，业务页面收到 `502 MODEL_OUTPUT_EMPTY`。两次均在事实回读前停止。T01、T02 和完整场景 A20 记为 `NOT_RUN`。[主跑记录](acceptance.json) · [独立复跑](independent.json)

| 同一冻结候选上的运行 | 结果 | 真实调用 | 实际观察 |
| --- | --- | ---: | --- |
| [主跑 dry](runs/main-dry/summary.json) | PASS | 0 | 逐条回读三条夹具事实，刷新、跨用户拒绝及重启后回读通过 |
| [独立 dry](runs/independent-dry/summary.json) | PASS | 0 | detached checkout、新数据库与浏览器会话完成相同操作 |
| [主跑 live](runs/main-live/summary.json) | FAIL | 1 | 950 输入、1,536 输出 tokens，6,200 个推理字符，正文为空 |
| [独立 live](runs/independent-live/summary.json) | FAIL | 1 | 950 输入、1,536 输出 tokens，3,973 个推理字符，正文为空 |

两次真实派送均使用 `tokease / deepseek-v4.1-flash-1017`。每次都达到 1,536 个输出 token 的上限，供应商报告 `finish=stop`。流观测记录保存响应摘要和字符数。失败使真实答复、真实引用及其页面恢复缺少可验收的结果。[主跑流观测](runs/main-live/stream-metadata.json) · [独立流观测](runs/independent-live/stream-metadata.json)

## 固定输入与复现

候选提交为 `1d22a7f5b8d6393c01a7f7b248c950d48255fe2e`，构建入口 SHA-256 为 `9fac44aa8ecc4b53547c5555f924dacb39f151a0bdbec10a220b805b4984abee`。主跑和独立复跑使用同一请求哈希、不同的 Host、账号会话与 SQLite。三份合成订单源码分别覆盖入口、服务与存储，README 仅作为树中的结构信息。两次 dry 生成字节相同的校准文件。[校准](runs/calibration.json) · [冻结清单](runs/manifest.json)

可在该提交运行 `node scripts/explain002/host.mjs <候选SHA> <入口SHA-256> main dry`。独立运行使用 detached checkout 和 `independent dry`，通过 `KO_TEST_CACHE` 指向已校验的 Host 与浏览器依赖。两次运行分别生成截图、夹具答复和所有固定引用。[验收预期](../../../scripts/explain002/acceptance-plan.md) · [早期 dry 失败与修复](runs/prior-dry-attempts.json)

## 费用与恢复条件

主跑和独立复跑各消耗一次性名额。供应商合计报告 1,900 输入和 3,072 输出 tokens。按本次审核的上限估算，两次共 0.011116 美元，实际金额以账单为准。下一次真实验收需要新的授权名额和能在批准限制内返回正文的模型路由。[当次费率依据](runs/price-basis.json) · [审核上限](runs/price-approval.json)

F16、F17 保留已实现待验状态。依赖此单元的工程诊断与架构训练等待验收。队列可先处理 PLAN-001。技术检查结果记录在单独文件。[技术检查](runs/technical.json) · [单元汇总](summary.json)
