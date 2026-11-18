# FND-005 开发与修复记录

日期：2026-11-18；提示词 3.3.0。全部账号、对象和正文均为合成夹具。真实 GPT 调用数为 0，未替换用户模型。

开始时工作树干净，已验收远端 FND-004 HEAD 为 `4282b9231a4ac38b0eb87145c337b811aec033e4`，从该点建立 FND-005。先替换唯一指令、同步哈希与执行单元，通过计划检查后才编码。FND-001～004 的验收历史与完整需求矩阵保留。

开发阶段保留失败而不覆盖为 PASS：

| 阶段 | 实际失败 | 修复与复验 |
|---|---|---|
| 初次 Host 加载 | 输出 schema 使用不受支持的 `type: json`，工具注册失败 | 改用 JSON Schema object；实际 Host 加载与原生无上下文拒绝通过 |
| 初次模型夹具目录 | 缺少固定 API 要求的 model.provider，INVALID_CATALOG | 依固定源码补齐；未修改上游 |
| 初次原生读取 | 领域对象的 undefined 可选字段不是 lossless JSON | 在受控工具边界投影为 JSON；原生 read/update 通过 |
| integration | 比较了 camelCase 领域对象与 snake_case HTTP 投影的整对象 | 对共同业务字段及时间作明确投影；数据并未不一致 |
| integration-r2 | 夹具价格设为 1，长测试提前触发保守预算上限 | 将明确的夹具价格改为 .001；另建独立预算拒绝用例，真实模型价格不使用此值 |
| integration-r3 | Windows signal 退出时 exitCode 为 null，测试错误地认为 Host 未停 | 同时核对 signalCode，实际停止/新 PID/重启持久回放通过 |
| integration-r4 | FND-002 回归用了不符合既有契约的非 UUID 幂等键 | 回归使用 UUID，保留原校验 |
| 独立预审 | R1 发布前权限缺口；R2 执行等待取消；R3 原生取消码丢失；R4 结构化凭据分类；R5 UI 迟到响应 | 修复后使用真实原生 pre/post 策略屏障、真实 HTTP/SQLite、真实 Chrome 响应延迟重验，见 final-barriers、final-configuration、final-ui |
| 固定上游构建 | 系统 Git 路径故障；复制的构建目录继承外层 Git 元数据 | 使用 bundled Git，显式固定元数据重建，再核对 14524 份运行源码与固定上游一致，8 个产物构建门及 2 个聚合检查门通过 |

最终候选复核中另完成两项修复：

- 实际固定 pi-ai 在缺凭据时返回空模型目录，旧候选误判模型不存在。空目录交由固定适配器的确切模型/凭据校验处理，新增实际 pi-ai 配合网络陷阱检查，分别得到 503 CREDENTIALS_MISSING、404 MODEL_NOT_FOUND，均无外部网络请求。配置检查由 19 项扩展为 21 项。
- 独立 Chrome U02 复现目标从 A 切为 B 后，A 的迟到读取覆盖 B 的显示及 revision。切换目标或修改草稿现在增加请求代次、取消旧准备、清空旧显示并保留所选 B 的版本；显式重读 B 与 SQLite 一致。基础 UI 扩展至八项，另有四项独立迟到响应/草稿检查。

旧候选 `FND-005-572a5b58a7b46671` 及其独立首轮结果已保留到 `candidates/`、`independent/round1/`。独立附加测试首轮还包含测试预期过窄：Host 已在业务 JSON 包装前拒绝跨域请求，HTTP 403 正确，测试却要求特定业务错误码。失败记录未改写，最终检查仍要求拒绝、无模型调用及无副作用。候选变化后中断的运行明确为 NOT_RUN，不作为产品失败或通过。

`runs/integration*`、`runs/ui*` 和旧 `runs/final-*` 保留各自实际版本。最终验收以 `candidate.json` 的 `FND-005-d0ec209b8161e14e` 及 `independent/` 最新完整复验为准，旧失败不覆盖为 PASS。原始 Host 日志只存在忽略的 `.cache`，含 owner 入口能力，未复制到证据或 Git。构建日志只保留无敏感信息的门结果摘要。

当前只新增本轮最小 SQLite 幂等表，无上游模型循环修改、通用 jobs/outbox、PDF 导入或后续单元开发。实际 GPT、其 UI 与独立提供方验收仍因无已授权可用 GPT API 阻塞。
