# FND-005 运行与复验说明

业务入口为 `/knowledgeos/account` 登录后进入 `/knowledgeos/ai`。普通用户使用 KnowledgeOS 业务 Cookie；不需要也不会取得 DSH owner 凭据。模型只看到指令、指定对象 ID、预期版本及两个白名单工具。

可信 profile 的 `knowledgeos-host.config.ai` 使用已存在且获授权的 provider/model，字段为 `provider`、`model`、`maxCalls`、`timeoutMs`、`budgetUsd`、`inputUsdPerMillion`、`outputUsdPerMillion`。价格须为该实际路由的可信上界。默认输出上限 512 tokens、每 Host 8 次尝试、30 秒超时、0.10 USD 总预算；失败也占用预留，不自动重试。预算计数是本 Host 生命周期内的限制。缺价格禁止发起调用。配置中只保存提供方凭据引用，API Key 交由既有 DSH 凭据机制提供，不能放入这些字段、源码或 Git。

本机当前配置仍为 DeepSeek，不能据 OpenAI 兼容协议把它算作 GPT。本轮没有修改个人 provider 配置。将来有已授权 GPT 时，应先明确确认原样 provider/model 和价格，再复验真实模型；不要用默认模型或改名夹具填充证据。

`prepare` 只请求一次模型选择工具并校验结构化参数；`execute` 通过 DSH 原生受控执行器，重新核对业务会话、ACL、当前成员资格和版本。写入与幂等回执同一 SQLite 事务提交；取得锁后重取时间。原生策略等待结束后、发布正文前再次核对会话及 read ACL。执行前取消可阻止副作用；已提交写入返回 `OPERATION_ALREADY_COMPLETED`，使用同一幂等键对账，不假装撤销。重启丢弃未执行准备记录，保留已提交回执。

最小真实提供方脚本是 `scripts/fnd005/real-provider-check.mjs`，只连接显式指定的现有可信本机 Host，参数为 `--port`、`--expect-model`、`--candidate`、`--out`。业务登录名和密码仅从 `KO_FND005_LOGIN`、`KO_FND005_PASSWORD` 进程环境读取，不能记录其值。脚本会通过真实登录创建合成对象，要求模型分别选择 read/update，最多两次请求；实际 Host 仍执行配置预算与超时。没有配置时产出 BLOCKED，不能跳过认证或把客户端身份作为执行 actor。

该脚本的提供方 HTTP 成功也不会自动解锁单元：还需将同一候选、同一次实际 GPT 操作的浏览器展示、独立只读 SQL、实际工具参数/回执和独立复核关联。补足前 real-provider 总状态保持 BLOCKED；完整需求矩阵也不由此自动验收。

开发测试分别使用 `run-all.mjs`、`storage-checks.mjs`、`configuration-checks.mjs`、`barrier-checks.mjs`、`browser-checks.mjs` 与 `acl-regression.mjs`。每个运行使用隔离合成数据及 Host；模型均明确标注 controlled fixture。固定运行时来自 `.cache/build/dsh-39163dd`，构建工具、原生执行器、实际加载包和源码哈希由 `candidate.json` 绑定。原始 Host 日志不可复制发布。
