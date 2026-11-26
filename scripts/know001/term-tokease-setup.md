# KNOW-001 有界词易验收草案

当前资料适用于测试 launcher。生产 Host 和 FND-005 历史 runner 保持原边界。草案和配套离线测试没有读取凭据，也没有派送或检查供应商账单。

## 可复用和需要替换的测试层

- 沿用 FND-005 的 candidate-live-binding 校验、本机 ACL 私有临时目录、冻结 DSH runtime、candidate-live-trace 的实际组件加载校验和原生 settings/模型注册检查。沿用 candidate-live-guards 的 checkedRoute、ids、dispatch、priceApproval 和实际公开费率复核。毛坯脚本只接受程序提供的校验回调，不读取环境凭据。
- 不直接调用 FND-005 candidate-live-host.withHost 的现有硬连线。它固定加载对象用的 native hook 与 fetch preload。把两个测试模块 URL 作为测试 Host helper 的可选显式参数并默认保留旧值，或新增一个 KNOW-001 同级 launcher。避免在开旧 FND guard 环境下导入 candidate-live-native/egress；旧 egress 会安装自己的全局 fetch 过滤器。KNOW-001 native 入口只复用冷模块 guards，并保留 native route 投影的有限、脱敏输出。
- 原生 profile 明确选 provider tokease、model deepseek-v4.1-flash-1017、OpenAI-compatible endpoint https://tokease.cn/v1，调用只允许 POST /v1/chat/completions。以既有候选 setup 的授权测模型进入额度，维持原生凭据机制、正常模式零重试、SSE/HTTP、禁用浏览器其他 origin。测试 Host 子进程以系统环境允许清单启动，只有执行者确定本次允许后才按已有受控方式传入一个原生凭据别名。未经验证的缺配置启动应当零出站。
- Native hook 检查当前选择与精确路由、permit、quote、候选及顺序，再写本步骤 armed 文件。Fetch 关口要求对应一次性 permit、双层候选绑定、精确内容、响应上限和有效额度，提交时改名消耗 permit。无重定向，无自动重跑。任一步失效当即拒绝。
- 现有 pinned adapter 会在没有工具和工具历史时省略 tools 字段。当前术语业务发送两条 message，system 为实际冻结后的 termSystem，user 为 JSON.stringify({term,before,after})，没有工具或私密身份字段，maxTokens=512。不得把任意模型文本、链接、附加工具或其他项目内容塞进派送清单。若冻结候选实际 wire 发生变化，先确认差异来源并更新当次测试许可，不扩大可接受报文字段。

## 报文绑定与校准

1. 用合成 fixture 做禁止出站的 dry run。运行真实 Host 的 terms/explain 编排，安装本地 test-only intercept，在 native transport 交给真实网络前记录或返回受控响应。干跑中只用合成哨兵配置，无真实凭据。根据冻结 termSystem 和 Reader 中实际合成文本、UTF-16 选区独立计算期望 before/after。候选实际 context window 目前为选区前后各 220 UTF-16 单元，避免拆代理对。核对 dry-run 输出的两个 user 文本和独立预期相等，再固化每个语境的原始 wire SHA-256。
2. 用冻结 commit、bundle SHA、真实 profile 公开的精确路由、合成源文件 SHA、system SHA、两份 user SHA 和两份 wire SHA 形成 term-manifest.json。approved.json 绑定当次有效审核报价，保留原字节哈希；清单 hash 通过 launch 参数传入 Host 与 runner。将本次 private scratch 权限范围绑定本机操作人。不要从一次已允许外发的报文反过来签发白名单。
3. 控制两个业务调用。每步只在选择已核对的固定段落后新建 step permit。permit 包含 unit、candidate、entry_sha256、manifest_sha256、step、stage、expires_at，TTL 最多 30 秒。首步数据库索引，次步数组索引。可先确认两个 payload 后再分别运行真实浏览器证据。保存/关闭只走本地业务，不应消耗新的 permit。
4. Guard 强制置信控制。只接受两条单文本 message、精确模型、一次 completion、stream=true、1–512 token 约束，禁止 tools、tool_choice、图像、文件、历史、额外字段和重定向。只记录步骤、请求 SHA 和 token 上限。公开报告另可记录响应耗时、状态、脱敏用量和角色/业务结果。不保存原始凭据、请求头、浏览器 profile 或数据库。
5. 同候选主跑、独立复跑各用新 Host/browser/data 和自己的两次 permit。源不足、无模型、ACL、迟到响应和有害/无效模型输出使用独立离线夹具，不消耗真实派送许可。失败不应在无新许可的情况下重放请求。

## 随附测试组件

- term-egress.mjs 提供纯 manifest 和 payload 检验及受控 fetch 包装，导入本身不修改全局。期望精确原始 wire SHA，额外校验两个文本和无工具。由未来 launcher 显式注入价格校验和授权匹配回调。
- term-native-gate.mjs 是 test-only 原生钩子安装器。它以先验 redacted route getter 和现有 FND helpers 注入，关联单次 native 预检与两个 arm/consume。用现有 native projection 的脱敏路径初始化 getter。
- term-egress.test.mjs 用假 fetch 验证边界和两个 permit。只检查客户端拒绝和消费，测试代码没有外部调用。等冻结候选后仍需做真实 Host 无网络干跑校准及正式业务运行。
