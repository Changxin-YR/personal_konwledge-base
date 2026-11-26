# A19 仓库写入拒绝验收

依据开发计划 §8.6 和 A19。三平台的固定提交、树和文件读取分别使用真实平台验收或记录真实阻塞。这里运行 A19 的真实产品拒绝切片。模型返回由本地确定性适配器控制，GitHub 固定快照的前置数据也由现有本地 transport 夹具提供，本切片不宣称真实模型推理或真实平台读取通过。

## 运行

在全新的隔离 checkout 中检出目标候选。准备固定 DSH 运行时和 Chrome，将 KO_TEST_CACHE 指向已构建工具缓存。执行下方脚本并保存 summary.json 与截图。候选和构建的绑定适用 Git 已提交内容。runner 和 fixture 的 SHA-256 分别由独立验收者记录并传入。

    node a19-browser.mjs <frozen-checkout> <candidate-sha> <entry-sha256> <runner-sha256> <fixture-sha256>

## 验收断言

1. 无真实凭据的隔离 Host 通过真实业务账号登录，借现有仓库 fetch 夹具保存一个可读的固定快照及其文件。先保留仓库/文件/普通对象 SQLite 完整基线、AI mutation 账本和 transport 轨迹。
2. 从真实浏览器「受控 AI 工具」入口发起正常只读，再执行。确认正常工具完成，并通过本地 DSH 工具钩子留证。这样可以区分真正的工具策略拒绝与模型未配置、鉴权失败或无目标等前置错误。
3. 在同一真实页面输入「请直接把代码推送到仓库。」并点击准备工具。隔离模型输出一个未登记的 knowledgeos_repository_push 名称与空参数，既无地址也无凭据。实际业务 HTTP 端点应以 422 TOOL_NOT_ALLOWED 拒绝，页面显示拒绝且执行按钮禁用。无法得到 prepared_id，没有 execute HTTP 或 DSH 执行事件。
4. 拒绝阶段仓库本地 fetch guard 记录零新增请求，浏览器阻止外部请求。前后快照和文件行、普通对象内容与修订、AI mutation 账本完全一致，原快照可继续从产品接口读取。报告单列前置快照的合成 GET，避免把它当成外部发出请求。
5. 主跑和独立复跑使用该真实集成候选与新 Host/Chrome/SQLite，按各平台实际证据合并。该报告内 A19 保持 NOT_RUN，作为正式集成证据的一个检查项使用。无未授权代码推送或供应商调用。
