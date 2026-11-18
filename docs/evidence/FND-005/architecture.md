# FND-005 架构与执行契约

版本 3.3.0；基线 4282b9231a4ac38b0eb87145c337b811aec033e4；固定 DSH 39163dd30f703a79079e2d2446545cff3c453738。

## 调用路径

真实业务 Cookie → POST `/knowledge/v1/ai/prepare` → 固定 `ctx.llm.stream` 单次调用 → 仅两个工具的结构化调用 → 有限时的服务端准备记录 → POST `/knowledge/v1/ai/execute` → `ctx.tools.execute` 原生执行器 → 业务用例 → SQLite 事务 → UI 结果 → GET 对象重新验证。准备和执行分开使撤权竞态可被真实 HTTP 检验；不实现通用 Agent 循环。

仅传入用户指定的测试对象 ID、版本、自然语言指令和服务端生成的工具 schema。不把无权对象内容发送给提供方。模型输出不作为授权和成功依据；仅接受一个白名单工具调用、受限 JSON 参数，拒绝身份、SQL、路径和 Shell 字段。

工具注册在插件生命周期中；执行时使用 AsyncLocalStorage 绑定服务端业务上下文，且检查服务端指定的 callId、工具名、参数摘要。DSH 的其他 owner/session/Agent 调用缺少上下文时拒绝；普通业务账号仍只拥有 KnowledgeOS Cookie。

## 提交与幂等

SQLite v5 只增加 `ai_tool_mutations`。v1–v4 SQL 与 checksum 保持。键按 `(service_id,user_id,idempotency_key)` 隔离；摘要包括工具、object_id、expected_revision 与规范化补丁。`BEGIN IMMEDIATE` 内重新检查仍有效的原始业务会话、当前 ACL、成员资格和版本，再同时更新对象并记录原始成功结果。重放先重新判权，再比较摘要；同摘要重放原始结果，不重复加版本；不同摘要 409。未授权与冲突不得写入幂等记录。

准备记录仅在内存中，有总数/每用户并发上限、两分钟有效期，绑定服务端 sessionId。重启后准备失效，已提交修改通过持久幂等记录对账。没有通用 jobs、队列或 outbox。

## 模型预算与状态

显式 provider/model 来自可信插件配置，客户端不能改路由。每次请求最多一次提供方调用、一次工具执行，无自动重试或替换。默认最多 8 次提供方尝试/Host、每次输出 512 tokens、输入 2000 字符、超时 30 秒。费用预算需通过可信配置声明单次输入/输出每百万 token 的上限单价并据保守 UTF-8 字节估算预留；未知价格时禁用调用且报告配置缺失。默认总预算 0.10 USD，预留不可因不明失败退回以防超支；真实用量若可得另显示，未知不冒充零费用。上述均为本轮技术默认值。

错误区分 MODEL_NOT_CONFIGURED、MODEL_NOT_FOUND、CREDENTIALS_MISSING、CREDENTIALS_INVALID、QUOTA_EXHAUSTED、PROVIDER_PERMISSION_DENIED、MODEL_TIMEOUT、CANCELLED、MODEL_FAILED、TOOL_NOT_ALLOWED、AUTH_REQUIRED、NOT_FOUND、REVISION_CONFLICT 与 IDEMPOTENCY_CONFLICT。提供方原始错误消息只用于内存分类，不写日志或返回，以防凭据回显。

## 验收范围

真实 GPT 的 T01/T02/T08、真实 HTTP/SQLite、受控提供方夹具与静态检查分别留证。真实提供方不能调用时相应条目标 BLOCKED；独立复核通过夹具也不提升真实模型状态。完整需求矩阵不自动标 PASS。
