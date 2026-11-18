# FND-005 独立验收结论

2026-11-18，Asia/Shanghai。冻结候选：**FND-005-d0ec209b8161e14e**。

**约定技术范围 PASS；FND-005 总体 BLOCKED。** 独立角色已实际完成九组套件，82 个具名技术检查全部 PASS、退出码均为 0；35 项计划门禁回归 PASS，类型检查与计划一致性检查通过。没有待处理的新产品缺陷。真实 GPT 调用 **0 次**，T01、T02、T08 的真实 GPT 闭环仍 BLOCKED，不得将单元设置为 passed/awaiting_user。

## 已完成结果

| 套件 | PASS 数 | 实际证据范围 |
|---|---:|---|
| integration | 14 | 受控模型，真实 DSH 原生工具、登录、HTTP、SQLite |
| storage | 6 | 真实 SQLite，受控故障及生命周期设置 |
| barriers | 5 | 真实原生 pre/post 策略、HTTP、SQLite，受控模型与屏障 |
| ui | 8 | 真实 Chrome、HTTP、SQLite，模型夹具 |
| configuration | 21 | 6 项 HTTP 配置、13 项分类夹具、2 项实际固定 pi-ai 零网络检查 |
| acl | 7 | FND-004 受影响的真实 HTTP/SQLite 回归 |
| additional | 11 | 独立追加真实 HTTP/native/SQLite 断言 |
| ui-additional | 4 | 独立真实浏览器竞态检查 |
| service-additional | 6 | 直接服务端口与终态 stream 错误夹具 |

35 项计划门禁与 82 项技术检查分别计数，不相加冒充产品场景。计划门禁的临时合成完成记录不是真实 GPT 证据。全部命令、退出码、时间、脚本哈希及检查事实在 `command-*.json`、各套件 `summary.json` 和本目录总表 `summary.json`。

## 关闭项

- **R1**：原生 body 完成后、发布前重新验证 actor、会话和 read ACL；撤权/登出/实际会话到期均抑制受保护结果，已提交 receipt 保留。
- **R2**：原生前置等待期间取消不写入；提交后取消明确返回 OPERATION_ALREADY_COMPLETED，保留唯一提交结果。
- **R3**：真实原生 ABORTED_BEFORE_DISPATCH 分类通过；服务夹具补充 ABORTED 与 TOOL_TIMEOUT 映射。后者只证明分类，不声称实际原生工具 deadline 已测。
- **R4**：NO_CREDENTIAL_STORE 与结构化 AUTH 优先分类通过，quota/billing 文本不再误导分类。
- **R5**：取消及真实账号切换后的迟到响应不能恢复旧 prepared 或泄露旧展示。
- **旧 U02 产品缺陷**：切换至 B 后释放 A 的迟到读取，未显示 A，B 的 ID/revision 保持；随后显式读取 B，与独立只读 SQL 一致。没有弱化旧响应不得覆盖新目标的要求。U03/U04 的草稿变更失效也通过。
- **pi-ai 空目录误分类**：实际固定适配器经真实 HTTP 返回缺凭据 503 CREDENTIALS_MISSING、未知模型 404 MODEL_NOT_FOUND；本地网络陷阱均为 0 请求。

独立追加检查还覆盖跨 actor 相同原生 call ID/幂等键隔离、不同参数并发冲突、edit-only 不能偷读、grant/membership 自然到期、真实 SQLite 锁等待后撤权、提交后丢响应及后续编辑后的精确原结果重放、账号停用和发布前会话到期。身份由服务端可信上下文绑定，模型不能提供 actor 或冒充 DSH owner。

## 旧失败完整保留

`round1/` 保持原样；旧失败不回填为 PASS。

1. 更早的 additional 辅助函数对空 204 读取 `.code`，属于独立探针错误。
2. 用户指出的首次完整 additional 为 **08:57:43.964–08:58:15.333 UTC，exit 1**。I01–I10 PASS；I11 已获得外层 Host 安全 403，但探针过严要求业务 JSON 的 CSRF_REJECTED，属于预期断言错误。保留 `round1/command-additional-attempt-2.json` 与 `round1/additional/attempt-2-summary.json`。新候选仍要求 403、无数据和零模型尝试，已通过。
3. 后一次旧候选 additional 的顶层 summary 被 setup/hash 失败覆盖：主线程已重建 bundle，未执行业务检查。这是候选漂移；原先完整失败已另存，不能据覆盖记录删除或误判首次原因。
4. **旧 U02 是另一个真实产品 FAIL**，原 summary 和 `target-switch-delayed-read.png` 保留；新候选完成修复复测。

## 完整结论与边界

`candidate-before.json`、`candidate-after.json`、`final-audit.json` 均 PASS。50 项候选文件和 13 项运行文件哈希一致；固定上游 14,524 份源码全部匹配、零差异。实际插件 SHA-256 为 `5c48af614b4d53a06a15e3abdb5126494677e731341137d5b9c7b9d11b4c16cc`。v1–v4 迁移 SQL/checksum 保持，隔离 Host 已停止、端口释放，证据中未发现数据库、原始日志或凭据形状 JSON 字段。审计时间和具体范围以审计记录为准。

**T03–T06 可通过；T07、T09 在详细报告所列技术范围内可通过；T01/T02/T08 仍 BLOCKED。** 真实 HTTP/SQLite、真实浏览器、受控模型/错误夹具和静态证据均分开标记。上游构建 8 gates/check 2 gates 是实施者证据，本角色核对来源与运行哈希，没有重跑冻结 artifacts 构建。真实提供方归一化、真实 GPT 选择工具及 UI 闭环未完成；历史 Connection-only recovery BLOCKED、旧 v1-only checker FAIL、完整产品和 Windows 发布边界不因本次技术通过而解除。

本角色只在 `docs/evidence/FND-005/independent/` 收尾证据，未修改冻结产品/测试、状态、分支或进行网络 Git 操作。不再扩大测试范围。详细事实见 `REPORT.md`，机器汇总见 `summary.json`，文件哈希见 `evidence-index.json`。最终门禁、交付、提交推送由主线程负责；独立技术复核工作已结束，单元总体验收保持 **BLOCKED（真实 GPT 0 次）**。
