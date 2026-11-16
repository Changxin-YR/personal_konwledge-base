# KnowledgeOS：DSH 能力核对与接入边界

核对日期：2026-11-16（Asia/Shanghai）  
核对方式：GitHub 插件只读获取官方元数据、文档、清单和关键实现文件。没有安装依赖、启动上游、调用真实模型或执行 Windows 安装验收。  
状态：**源码适配方向成立；运行可用性由对应已激活单元逐项确认。**

执行范围说明：本页是上游能力证据与全周期适配目录，不是另一份启动指令。M0 标记表示基础阶段总体义务；FND-001 单面板与 Host 只读状态已验收；当前 FND-002 只做独立业务持久化，身份、模型及发布检查仍在各自单元激活后执行。

## 1. 固定上游基线

| 项目 | 本次实证 |
|---|---|
| 官方仓库 | https://github.com/deepseek-ai/deepseek-harness.git |
| 默认分支 | `master` |
| 固定提交 | `39163dd30f703a79079e2d2446545cff3c453738` |
| 根包版本 | `0.2.2-rc.3` |
| 许可证 | 仓库 `LICENSE` 为 MIT；保留上游版权与许可文件，第三方清单另行随包处理 |
| 源码 | 存在 `apps/`、`packages/`、`docs/`、构建配置与测试，不是仅二进制发布仓库 |
| Node | 根 `package.json` 要求 `>=24.9.0` |
| 包管理器 | 根 `packageManager` 固定为 `pnpm@11.28.5` |
| 桌面技术 | `apps/desktop` 使用 Electron；本提交依赖 `electron ^44.7.0`，这不是 DSH 产品版本号 |
| 发布状态 | 最近核验的 `dsh-v0.2.2-rc.3` 为 prerelease，2026-11-13 发布，GitHub release 资产列表为空 |

上述事实见 S01–S05、S23。发布元数据独立见 [release API](https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/tags/dsh-v0.2.2-rc.3)。

**实施时固定完整 SHA，不自动追随 master 或 latest。** 官方 README 将项目标为 developer preview，明确可能发生不兼容变更。当前 DeepSeek Harness 执行者在锁定提交上建立适配验证；升级作为独立变更处理，重新跑兼容性检查。

本项目采用官方 DSH 基线，不沿用此前公司 Mandate、记忆沉淀、数字员工图编排的“已实现”结论。那些项目没有被导入，也不计入本项目进度。

## 2. 架构上可以直接复用什么

DSH 是 Cordis 插件体系。Host 插件提供服务、工具和持久化，Client 插件提供浏览器界面；Electron 承载同一 Web 应用。插件通过 profile/bundle 与 patch 组合，注册具有可清理的生命周期。官方的应用启动路径使用 `dsh` profile，不应另外修改 agent-loop 实现整套知识库。（S04、S05）

| 能力 | 可复用部分 | KnowledgeOS 新增或适配部分 | 结论 |
|---|---|---|---|
| 桌面宿主 | Electron、内嵌 Host、Web assets、窗口/原生文件能力 | 产品品牌、默认入口、KnowledgeOS 组合、安装验收 | 复用宿主 |
| 页面框架 | React renderer、typed slots、侧栏、全局主面板 | 六个工作区、最多两级导航、阅读/训练/审核页面 | 插件扩展 |
| AI 模型 | 模型提供方目录、凭据、模型能力/defaults、流式调用 | 主 Agent 与评审角色配置、预算、队列、版本化讨论 | 复用派发，新增业务编排 |
| 工具 | scoped 注册、JSON 参数、执行管线、guard、日志 | KnowledgeOS 领域工具与每次调用 ACL | 插件扩展 |
| 会话 | 事件日志、恢复、上下文构建、subagent 基础 | 讨论阶段/轮次/投票、学习证据、冻结版本 | 复用执行，新增状态机 |
| 插件管理 | 安装、启停、移除、诊断、重启状态 | 管理员限定、保护核心能力、允许列表与业务审计 | 受控适配 |
| 文件与预览 | 文件访问、附件、Office kit、PDF 预览基础 | 导入队列、全文提取、页码锚点、长文选区、永久知识资产 | 部分复用 |
| 非会话存储 | 通用 KV、SQLite JSON 后端、生命周期 | 关系模型、跨表事务、业务迁移、索引、ACL、outbox | 独立领域存储 |
| 定时任务 | 持久化任务、时区与RRULE/Cron解析、唤醒基础 | F30 强提醒、评分联动、去重账本、发送条件 | 独立策略 |
| 用户协作 | 连接认证与 RemoteAccess 扩展基础 | 注册/登录、项目成员、邀请码、对象级ACL与隐私隔离 | 必须新增 |
| 搜索/RAG | 模型与工具执行基础 | 中文全文/语义检索、可复现引用、版本与权限过滤 | 必须新增 |
| 学习训练 | 通用 UI 与模型能力 | 术语、题库、错题、遮挡、复习、能力评估 | 必须新增 |
| 笔记图谱 | 通用 UI 能力 | 笔记/大纲/脑图同源、本体类型约束与证据关系 | 必须新增 |

“可复用”代表找到受支持的源码入口，不代表无需开发或已经运行通过。

## 3. 六个工作区如何接入 DSH

### 3.1 采用原生 Client 插件

可以沿用官方 `ui-plugin-manager` 的注册形式，提供 `dsh.client` 元数据和 `exports["./client"]`，注册全局主面板与侧栏入口。实际参考：

- `packages/client/ui-layout/src/client/index.ts` 声明 root-scoped `main` keyed slot、`sidebar`、`shell.overlay` 等位置。（S06）
- `packages/client/ui-plugin-manager/src/client/index.ts` 使用 `ctx.slots.inject('main', ...)`、`ctx.slots.register({ name: 'main', key: PANEL_ID, ... }, Component)` 注册页面；通过 `sidebar.panellist` 注册入口。（S07）
- 面板通过 `ctx.layout.selectPanel(PANEL_ID)` 选择，不必创建新 Session。（S07）
- `dsh.client`、`./client` 与依赖图由 client-modules 发现与装载。（S08、S09）

KnowledgeOS 采用六个业务入口：今日计划、知识库、笔记、项目协作、智能讨论、管理与设置。页面子视图由各模块自身路由/状态管理；不能同时堆叠多层独立导航。资料内的目录/页码是阅读工具，不额外计作产品导航层级。

可先复用上游 AppFrame，在六个业务面板中完成产品布局。若原侧栏或三列框架阻碍已确认的设计，先通过可替换 slot/profile 配置调整；确需薄修改时，记录原因、文件和补丁，保持知识业务逻辑在独立包内。

### 3.2 不直接照搬概念示例

官方 extension-cookbook 明确其中片段不完整，不能原样复制后声称可用。当前 DeepSeek Harness 执行者必须以本提交的类型、实际包导出和 `ui-plugin-manager` 等运行产品的源码为参照，完成编译与真实 Host/Client 加载测试。（S25）

UI token、字体、圆角、深浅色和两级导航按本项目需求执行；上游默认外观不是本项目最终设计。

## 4. 模型、主 Agent 与多智能体讨论

### 4.1 统一模型调用路径

官方把 `ctx.llm` 定义为进入模型适配器的受支持路径。可发现模型、解析能力与默认参数，并流式调用；`prepareCall()` 绑定确切 adapter generation，避免请求准备后配置更新造成能力与派发端不一致。准备结果一次使用。（S10、S11）

KnowledgeOS 应：

1. 在实际可用提供方目录里选择 GPT 主 Agent，并显示实际模型身份；不要假定 ChatGPT 订阅自动提供 API 额度。
2. 默认继承该账户/模型已有上下文、输出和推理配置；业务预算单独显示，不把“默认配额”写成固定免费额度。
3. 每个讨论、版本、阶段、轮次、评审席位都有独立标识及会话映射；禁止通过临时修改全局模型配置给不同席位轮流切模型。
4. 调用前固化本轮方案 hash、材料版本、ACL 范围、角色与预算。完成后保存可复现输入引用、模型配置、用量和结果。
5. 按官方要求，使实际模型可见输入能从会话日志重建；不以隐藏全局 prompt 注入绕过记录。
6. 缺凭据、额度不足、提供方失败、取消与超时均记录实际状态，不能伪造赞成票，也不能静默把 GPT 主 Agent 换成其他模型。
7. 模型提供方默认不等于业务并发上限；为导入提取、练习生成、问答和评审分别设置应用队列、取消和预算。

上游 llm 服务明确不负责缓存或速率限制；重试执行由相应 retry 插件负责。KnowledgeOS 的阶段/轮次/席位状态机仍要自行处理，防止网络重试算作新投票或重复计费任务。（S11、S12）

### 4.2 上游 subagent/team 不等于评审流程

可以复用代理执行与消息能力，但不能把“subagent 完成”直接当作“正式评审通过”。至少三类记录分离：

- 运行：实际调用完成、失败、取消。
- 评审：针对固定方案版本的有效意见/投票、重大阻断。
- 业务结果：达到门槛、冻结、待修改、受阻、第五轮后待用户裁定。

全部席位必须完成有效评审，赞成票至少为 `ceil(2*N/3)`，重大阻断已处理；修改后新版本重新评审。冻结只证明设计流程完成，不证明软件修复或管理员任务已经验收。

## 5. 工具与权限边界

DSH 的工具注册有 agent scope，支持 scoped restriction 与最终 guard，相关实现位于 `core/tools/src/index.ts`。这些可以承载业务工具，也可防止政策层被后续工具 listener 放宽。（S13）

但 DSH Session、Peer、preset 或工作目录都不能直接替代 KnowledgeOS 用户身份。领域工具与 HTTP/Remote 接口必须通过相同的领域服务进行：

- 服务端认证，得到可信 actor。
- 当前对象、空间/项目与动作 ACL 校验。
- 版本前置条件和幂等处理。
- 事务写入与审计。
- 返回时按权限裁剪证据、正文与引用内容。

请求里的 `userId` 或模型提供的 `ownerId` 只能作为目标参数，不能作为已认证身份。用户登录与重连不能让助手继续使用上一个人的缓存或上下文。后台任务必须固化授权范围并在输出交付前重新检查，不把索引中的过期片段继续发给模型或前端。

## 6. 多人协作必须新增的身份体系

### 6.1 官方现成认证的实际边界

`authentication-token` 的浏览器 v1 Cookie 共享该插件的一个 Peer；`authentication-desktop` 在桌面生命周期内共享 owner access。它们证明访问的是受信任本地 Host，不提供本项目要求的十人独立账号、私有资料、项目授权或邀请码。（S19、S20）

这不表示上游没有可扩展认证接口，只表示**不能把默认运行配置当成多用户系统**。RemoteAccess 的方法级能力也不能自动推导每份资料/每个用户的对象级权限。

### 6.2 推荐接入方案（设计决定，M0 验证）

- 每位成员的 DSH 桌面 Host 保持本机访问；个人运行模式使用本机 KnowledgeOS 领域服务。
- 协作模式接入共享 KnowledgeOS 服务，使用独立账户认证与对象级 ACL；共享服务持有协作权威数据与写入事务。
- 对外仅开放 KnowledgeOS 业务接口。不得将管理员桌面的默认 DSH 全量 Web RPC、文件访问、插件管理和 shell 暴露给协作者。
- 若共享服务继续采用 DSH 插件方式，使用专用 `knowledgeos-server` profile，只组合领域 API、认证、存储及明确依赖；M0 验证最小组合与路由白名单。不能直接继承 `web-app` 的全量权限面。
- 如果最小 profile 无法满足受控暴露，再用独立业务服务承载同一领域层，并记录 ADR。上游源码薄适配与产品业务架构清楚区分。
- 十人规模优先单权威写入服务，关系型 SQLite 位于该服务本地磁盘；不让多个桌面进程通过网络盘直接共写数据库。后续扩容再评估 PostgreSQL。

私有模式与协作模式的核心规则、领域模型和验收契约一致，但“断网可编辑草稿”不等于“断网可完成正式管理员审批或延长权限”。服务端提交结果仍要重新认证、检查当前版本并对账。

## 7. 持久化：不要把会话日志当整个知识库

上游 `storage-domain` 为 schema-validated KV，读取来自进程内状态，持久写入后发出 `domain/changed`；文档明确当前没有跨表事务、二级索引、跨进程变更推送。SQLite 后端把每条记录存成 JSON，采用同步 `node:sqlite` 调用。（S17、S18）

因此：

- DSH 会话日志保留 Agent 活动与模型输入。
- KnowledgeOS 关系数据库保存账户、权限、资料版本、个人表现、任务提交/审核、评分、投票和幂等记录。
- 大文件与派生内容进入持久文件存储，以内容 hash 和版本关联；不塞进会话事件或单个超大 JSON 行。
- 搜索/向量索引为可重建派生数据；以当前授权与当前版本过滤。
- 需要一致完成的业务变更由同一数据库事务完成；跨进程外部动作走 outbox/任务队列，对不确定结果先查询再重试。
- 知识、笔记与学习记录长期保留；30 天仅属于回收站期限。不要复用临时附件或 Office 输出的生命周期作为正式知识资产规则。

## 8. F30 强提醒不能直接作为普通 schedule 任务

上游 Schedule 有可用的持久定时、时区和任务查看能力，但其约束与本项目不一致：

| 官方 Schedule 行为 | 对 KnowledgeOS 的影响 |
|---|---|
| 可以编辑、暂停、恢复、删除 | 不能把 F30 的固定启用规则直接交给该普通管理入口 |
| 管理是 Host-wide，无任务级授权 | 不能把多人个人提醒混放后开放通用列表 |
| 到期投递普通 Session follow-up | 不是本项目的应用内强提醒视图，也不等于系统推送 |
| 投递与收据分步提交，崩溃后可能重复 | 必须有独立幂等/发送账本 |
| 每次新 Session 的任务可重叠且无并发帽 | 不能靠每小时开 Agent 会话实现催促 |
| 离线错过发生时间合并处理 | 可以参考，但恢复时仍按当前评分/事项/时段重算 |

以上来自 S16，尤其“实现”和“已知限制”章节。

F30 应属于 KnowledgeOS 核心政策，不暴露停用/删除接口。用确定性规则计算连续三个已结算计划日 C/D、提醒时段和可行动事项；等待审核/争议阻断序列，休息日/批准请假跳过。执行中仅在有结束时间的有效执行时段免催促；一个任务阻塞不影响其他可行动事项。

提醒发送记录保存依据版本、实际发送时间与去重键。改判后重算；网络恢复不补发积压提醒。应用退出或系统通知被 OS 抑制时不能承诺继续显示，产品内固定启用仍成立。此界限不增加“应用内关闭”入口。

## 9. 插件管理与核心能力保护

Plugin Manager 可以复用安装/启停/移除与结果诊断，但文档和工具实现明确：

- 变更作用于整个 profile，影响使用该 profile 的所有 Session。
- Host 插件在进程内运行，位于工作目录沙箱之外。
- 安装成功、配置保存、激活成功是不同结果；`restart-required`、`overridden`、`failed` 需要真实呈现。
- 管理器自己受到保护；不能假定任意 KnowledgeOS 包天然不可关闭。
- 依赖构建许可、插件运行权限与业务对象 ACL 是不同问题。（S14、S15）

KnowledgeOS 的插件入口需要管理员能力校验；协作者不得通过通用工具管理服务器插件。自定义插件应按可信代码处理，不宣称进程内插件是可隔离恶意代码的沙箱。

F30、认证/授权、审计和迁移核心不能作为普通可选插件在产品内关掉。当前 DeepSeek Harness 执行者在 M0 验证现有管理器的保护扩展接口；若没有满足要求的声明机制，采用受控 KnowledgeOS 管理入口和最小补丁，记录补丁文件及回归用例。不以隐藏按钮代替服务端拒绝。

## 10. 资料导入、Office 转换与大 PDF

官方 Office kit 可将 Office 文档转换为 PDF、按页渲染和转换其他格式；拥有队列、取消、字节限制、源版本校验与字体缺失提示。模型工具还提供 `office_render`、`office_convert`、`office_recalculate`。（S21、S22）

需要保留的边界：

1. Office kit 产物是临时输出，会因保留期限、空间回收、Session结束或卸载清理。确认入库时必须复制/迁移到 KnowledgeOS 的持久派生资产区。
2. Office 预览或格式转换不等于 PDF 全文解析、中文检索和来源可复现。730 页/约 40 MB 验收仍需真实完整样本。
3. 不把整本 PDF 无条件塞入模型上下文。解析和索引分块、按页保留状态，前台允许阅读已经可用部分；剩余范围与待复核内容明确显示。
4. 遮挡背诵需保存资料版本、页/文本锚点、完整选区、遮挡分组与个人练习位置；上游没有提供本项目的完整学习模块。
5. OCR 为需要时的适配能力；文字型 PDF 优先原生提取。表格、图片、代码块和转换分页差异均要能回原件检查。
6. 原生 Office 引擎在 Host 进程运行。导入处理的资源和权限边界要在本项目的 worker/受控处理流程中明确，而不能声称 shell sandbox 已隔离该原生解析器。

## 11. 构建、安装包与交付

官方仓库可见的基础源码命令：

```sh
pnpm install
pnpm run build
pnpm dsh web
```

开发和桌面命令存在于根 package：

- `pnpm run dev:web`、`pnpm run dev:desktop`
- `pnpm run build:artifacts`，随后 `pnpm run build:check`
- `pnpm run package:desktop:win:x64:unsigned`
- `pnpm run package:desktop:win:x64`

这些是上游可核查的入口，不是已执行记录。当前 DeepSeek Harness 执行者应先读目标提交的 `AGENTS.md`、`docs/development.md`、`apps/desktop/windows-signing/README.md`，再按目标环境实际依赖运行；签名、安装、升级、回滚与卸载结果分别报告。不能把“源码能编译”“打包生成 exe”“Windows 安装后可用”混写成同一项通过。

本次没有现成 KnowledgeOS 安装包。后续包应由已记录版本与提交构建，保留校验值、manifest、安装说明与真实验收证据，并发布到用户仓库的 Release 资产或其明确目录。不要把大型二进制直接长期塞进 Git 历史。

## 12. M0 与发布单元分期完成的适配探针

| 编号 | 验证 | 最低有效证据 |
|---|---|---|
| DSH-01 | 固定提交与依赖可准备 | remote、SHA、版本与命令退出码 |
| DSH-02 | 外部 bundle 的 Host+Client 可加载 | Web和桌面真实启动，加载诊断无失败 |
| DSH-03 | 六入口/主面板切换 | 原生 slots 注册演示，Session不被误创建或串换 |
| DSH-04 | 模型角色隔离 | 两种配置并发请求，记录各自模型/上下文；真实提供方测试单独标记 |
| DSH-05 | 工具 actor 与对象 ACL | 两用户交叉访问被拒；UI、工具、API一致 |
| DSH-06 | 固定提醒核心保护 | UI、AI工具、Remote/HTTP管理入口均不能停用；有到期执行时段 |
| DSH-07 | 专用多人服务暴露范围 | 从协作者凭据无法访问Host全局文件、Session、插件管理或shell |
| DSH-08 | 业务事务与恢复 | 崩溃后提交不丢失、不重复计分；未知结果可查 |
| DSH-09 | Office派生结果永久入库 | Session结束/插件重启后正式资料仍存在 |
| DSH-10 | Windows产物链 | 构建manifest、包校验值、真实安装/启动测试；不可用环节标阻塞 |

M0 是宏观兼容与边界验证范围，按已激活的 FND 单元逐项完成，不是一次性开工指令。每个单元通过后交接并停止；受阻时只继续该单元内独立可行部分，下一单元须由用户激活。

## 13. 证据索引

以下链接都固定到本次核验提交，避免 master 更新后引用漂移。

- **S01** [README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/README.md)：项目定位、开发预览、官方启动命令。
- **S02** [package.json](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/package.json)：版本、Node、pnpm、源码构建与桌面命令。
- **S03** [LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/LICENSE)：上游许可证。
- **S04** [AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/AGENTS.md)：源码约束与测试门槛。
- **S05** [docs/architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/architecture.md)：Cordis、profile/bundle、Host/Client、扩展点。
- **S06** [packages/client/ui-layout/src/client/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-layout/src/client/index.ts)：root/main/sidebar/shell.overlay slots。
- **S07** [packages/client/ui-plugin-manager/src/client/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-plugin-manager/src/client/index.ts)：可复用全局主面板与导航注册代码范式。
- **S08** [packages/client/ui-plugin-manager/package.json](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-plugin-manager/package.json)：dsh.client及./client导出。
- **S09** [docs/subsystems/client-modules.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/subsystems/client-modules.md)：客户端模块发现与bundle加载。
- **S10** [packages/llm/llm/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/llm/llm/src/index.ts)：registerAdapter/prepareCall/llm.stream实现。
- **S11** [packages/llm/llm/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/llm/llm/README.md)：模型调用、日志、不含限流的边界。
- **S12** [packages/llm/llm-pi-ai/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/llm/llm-pi-ai/README.md)：多提供方路由、凭据、默认参数、快照。
- **S13** [packages/core/tools/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/core/tools/src/index.ts)：scoped工具注册、restriction与最终guard。
- **S14** [packages/boot/plugin-manager/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/boot/plugin-manager/README.md)：插件生命周期、profile级影响、Host信任边界。
- **S15** [packages/boot/plugin-manager/src/tools.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/boot/plugin-manager/src/tools.ts)：模型侧插件管理真实入口与结果处理。
- **S16** [packages/schedule/schedule/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/schedule/schedule/README.md)：计划任务持久化、重复投递、Host级权限。
- **S17** [packages/storage/storage-domain/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/storage/storage-domain/README.md)：KV领域存储与无跨表事务限制。
- **S18** [packages/storage/storage-sqlite/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/storage/storage-sqlite/README.md)：同步SQLite JSON记录存储。
- **S19** [packages/host/authentication-token/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/host/authentication-token/README.md)：启动token、共享浏览器Peer。
- **S20** [packages/host/authentication-desktop/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/host/authentication-desktop/README.md)：Desktop共享owner Peer。
- **S21** [packages/document/office-kit/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/document/office-kit/README.md)：Office转换、临时输出、队列及限制。
- **S22** [packages/document/tool-office/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/document/tool-office/README.md)：模型工具转换入口与权限/输出范围。
- **S23** [apps/desktop/package.json](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/apps/desktop/package.json)：Electron、Windows打包脚本。
- **S24** [apps/desktop/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/apps/desktop/README.md)：桌面载体、共享home、签名与升级限制。
- **S25** [docs/cookbook/extension-cookbook.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/cookbook/extension-cookbook.md)：扩展方式、不得照抄概念片段。

机器可读事实与证据层级见[upstream_observations.json](../../config/upstream_observations.json)。本报告的技术建议是从上述源码边界作出的设计判断，并非上游已经提供完整 KnowledgeOS。

## 14. 外部仓库构建细节补充

### 14.1 SQLite 驱动

`packages/storage/storage-sqlite/src/schema.ts` 实际直接导入 `DatabaseSync` from `node:sqlite`。该层没有额外的 Electron 适配封装。KnowledgeOS 可采用同一运行时驱动建立自己的事务数据库，但不能把上游内部 KV schema 当成公开通用关系存储 API。

持久化单元分别在 Node 开发运行与可用实际桌面 Host 执行 SQLite 创建、跨表事务、关闭重开与回滚探针；打包后安装环境在后续发布单元复验。这些检查不属于 FND-001。若不通过，按具体失败记录选择兼容驱动，并只改领域存储实现；不能仅凭 Electron 版本号声称兼容。

### 14.2 外部 Client 包必须匹配 DSH 模块协议

Client 可以放在用户独立仓库，但产物并非任意 Vite 页面：

- manifest 声明 `dsh.client.platform: "web"`、所需 `inject`，并导出 `./client -> ./lib/client.js`。
- bundle 执行时向 DSH 模块加载器注册 closure-factory，材料化时才执行模块逻辑。
- React 等共享模块按实际 `PLATFORM_MODULES` 基线 externalize；额外非基线请求显式列入 `dsh.client.external`。
- CSS、懒加载chunk、图片资源与source map要满足模块协议；带资产时声明 `./assets/*` 导出。
- 固定提交提供 `packages/client/tsdown.client.ts::clientBundle`，它还引用仓库级 scripts，不能假定其独立 npm 包已经发布。
- 可以让本仓库构建适配器引用“固定上游缓存”中的同版 preset；或在本仓库保存最小、带来源许可的协议适配构建器。必须把真实 Host/Client 加载、重载与卸载测试作为 M0 门槛。

这支持 `config/upstream.lock.json` + `scripts/prepare-upstream.mjs` 的模式：源码缓存可重建，业务仓库保存自有源码、配置、补丁和构建适配，避免复制整份上游。

### 14.3 Bundle 安装与可重复交付

官方教程支持本地 checkout 的 `dsh plugin --profile <name> add <path>`、固定 Git commit、预构建 npm 包和 `pnpm pack` 的 tarball。关联到 Host 的 DSH/Cordis 共享实例依赖应按教程同时声明 peerDependencies 与开发依赖；普通第三方依赖独立管理。

Git 安装不会自动运行一般 `build` 命令；需要自包含 `prepare`，且 pnpm build script 许可另行管理。因此交付时优先同时提供已构建 tarball 和来源提交、校验值；不假设用户从 GitHub 安装就已经具有 `lib/client.js`。

创建新 profile 默认会引入 base bundle。专用多人服务若要排除默认全量工具/权限面，需要在 M0 验证其组合与真实导出路由；不能只改 profile 名称就认为完成隔离。

### 补充证据

- **S26** [packages/storage/storage-sqlite/src/schema.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/storage/storage-sqlite/src/schema.ts)：node:sqlite真实驱动与schema初始化。
- **S27** [packages/client/modules/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/modules/README.md)：外部Client构建/装载协议。
- **S28** [packages/client/tsdown.client.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/tsdown.client.ts)：closure-factory构建preset。
- **S29** [docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/user/develop/basic/publish.md)：外部bundle/profile及源码/预构建安装方式。

## 15. FND-002 写路由与可信配置补核

以下是固定提交的源码事实和本轮设计依据，不是新产品测试通过声明。

- [WebServer 源码](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/host/webserver/src/index.ts) 的 resource 仅接 GET/HEAD；写路由使用实际 handler(req, res, peer?)。上游先授权再调用 handler；应用处理方法/body/业务错误，不借进程内 readResource 证明 HTTP 鉴权。
- [来源策略](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/connection/src/api-request-trust.ts) 校验 Host 和附带的 Origin/Fetch Metadata；外站/null Origin 与 cross-site 被拒，缺 Origin 的可信 CLI 继续认证。[连接准入](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/connection/src/rpc-host.ts) 在凭据检查前执行来源策略，不能只调用底层 authenticate 而绕过该层。
- [插件配置说明](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/user/develop/basic/config.md) 使用 Config 类型、同名 Schemastery validator 和 apply(ctx, config)。本轮可信 dataDir 由 Host row config 注入；导入真实 schema 库时声明依赖并验证运行，不仅修改类型 shim。
- 固定上游 SQLite backend 的内部 KV 表与 schema helper 不是通用业务迁移 API；本项目另建自己的文件和迁移运行器。已有库的归属/未来版本保护必须先于修改性配置，不能机械照抄上游初始化顺序。
- [Node v24.22.0 SQLite 文档](https://github.com/nodejs/node/blob/v24.22.0/doc/api/sqlite.md) 区分同步 DatabaseSync、忙等待、只读打开、连接状态与各 API 新增版本。本轮保持 DSH 的 >=24.9.0 API 基线；statement.close 等后续能力不能无条件依赖。实际 Node 和可用 Desktop 证据分别记录。
