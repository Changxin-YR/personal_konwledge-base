# 原生 DeepSeek 离线派送预检

`node scripts/fnd005/native-egress-preflight.mjs` 在干净子进程中加载已锁定的 DSH 原生 API-key provider、Messages 适配器、扩展注册表及 LLM 服务。脚本校验 4 个构建产物的 SHA-256，执行前截获 `fetch`，仅允许合成 `/models` 响应，不执行任何网络派送。没有读取个人配置、原生凭据存储或真实密钥。

实测退出 0：没有凭据时目录为空，目录、Messages 和 Files 均无派送尝试；以合成 key 执行默认目录下的 `prepareCall`，在 Messages 开始前尝试 `GET /models`；使用固定目录时，Messages 注册表中的贡献者抛错，仍观察到 `POST /anthropic/v1/messages` 试图进入传输层，由探针拒绝。文本路径未触发 Files；不等同于对文件上传闸门的验收。

本次只有离线适配器证据，实际网络派送 0、业务模型请求 0，没有跑真实读写、独立验收或带凭据的隔离 web Host。先前的隔离 profile 没有产生兼容路由，并不能判断真实 API、凭据或额度有效性。原有 `llm-pi-ai/request-headers` 不覆盖这个原生路径，贡献者异常也不能作为发送闸门。

下一步：在隔离 web Host 里绑定可信、可重验的原生目录与传输闸门，把未经许可的目录、Messages、Files 请求分别验证为拒绝；允许的 Messages 必须消费绑定候选、provider、model、预算与请求正文形状的一次性许可，且无重试。不要为了填充证据而给默认模型或个人 profile 发请求。完成本地守门验证后，再确认隔离 profile 的非秘密 provider/model 和原生凭据引用；缺用户控制绑定时只请求经原生安全入口完成绑定，不收集密钥。FND-005 继续 `BLOCKED`。
