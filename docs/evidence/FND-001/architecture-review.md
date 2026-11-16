# FND-001 架构与契约审查记录

- unit_id: FND-001
- instruction_revision: 2.0.0
- 上游固定提交: `39163dd30f703a79079e2d2446545cff3c453738`（package version `0.2.2-rc.3`）
- 审查对象: 锁定源码 `.cache/build/dsh-39163dd`（由 `.cache/upstream/deepseek-harness` 复制）与仓库内候选 `packages/knowledgeos-panel`
- 角色执行说明: 原计划的独立架构子角色在长时间读取后未能收口并已终止，**未产生独立架构结论**；本记录由主管基于锁定源码逐项复核后完成。该独立复核缺口在最终报告中如实保留，不据此声称独立架构验收通过。

## 1. 结论表

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| 1 | Client bundle 的装载协议 | 已证实。bundle 执行时调用 `window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports } })`；`meta` 可选；入口 URL 与 boot graph 由 Host 扫描 `dsh.client` 生成 | `packages/client/tsdown.client.ts:1148-1155`（banner/intro/footer）、`packages/util/package-manifest/src/client-module.ts:37-42`（`DshClientModuleManifest`）、`packages/client/modules/src/client/manifest.ts:375-392`（`__ModuleLoader__` 门面） |
| 2 | shared module 表 | 已证实。基线含 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client` 等；bundle 只能通过 factory 的 `require` 取得 | `packages/client/web/src/platform.ts:10-16` |
| 3 | 主面板注册 | 已证实。`ctx.slots.inject('main', function*(){ yield ctx.slots.register({ name:'main', key: PANEL_ID }, Component) })`；main 是 root-scoped keyed slot，owner props 为空对象 | `packages/client/ui-layout/src/client/index.ts:72-75`（slot 声明）、`packages/client/ui-layout/src/client/AppFrame.tsx:46-49`（渲染点）、`packages/client/ui-plugin-manager/src/client/index.ts:129-149`（同类注册范例） |
| 4 | 侧栏入口 | 已证实。`sidebar.panellist` 是 root list slot；注册项需要 `id`、`order`、`label`（可为 `() => string`）；侧栏行是 `button[aria-label=label]`，点击调用 `selectPanel(id)` | `packages/client/ui-sidebar/src/client/index.ts:56-84`、`packages/client/ui-sidebar/src/client/SidebarRoot.tsx:78-95`、`packages/client/ui-slots/src/index.ts:793-933`（`SlotLabel`/`resolveSlotLabel`） |
| 5 | Host 只读路由 | 已证实。`ctx.webServer.register({ kind:'exact', path, auth:'required', resource })`；resource 只接受 GET/HEAD，其余 405；未认证为 401，路由拒绝带 `no-store` | `packages/host/webserver/src/index.ts:114-150`（路由类型）、`packages/host/webserver/src/index.ts:515-530`（register）；`packages/host/webserver/README.md` §Registering routes |
| 6 | 浏览器到 Host 的同源认证 | 已证实。浏览器使用页面 Cookie 经现有 Connection 认证；`/knowledgeos/status` 是命名 exact 路由，不需要新增 RPC/Typert 生成物；`/api` 路由不与 `/knowledgeos` 冲突 | `packages/client/connection/README.md`（browser authentication）、`packages/host/webserver/src/index.ts` 匹配顺序；路由字符串检索未发现 `/knowledgeos` 既有占用 |
| 7 | 运行版本/提交来源 | 已证实（含重要限制）。`ctx.clientModules.graph().release` 给出 `{ version, commit? }`；源码启动的 Host 从 `process.env.DSH_CLIENT_COMMIT_HASH` 读取提交，npm 构建则把它固化在产物中。锁定 npm 包的固化提交为 `6b729fe`，**不等于**锁文件 SHA，因此不能用 npm 包冒充固定上游 | `packages/client/modules/src/index.ts:650-676`；npm `dsh-client-modules@0.2.2-rc.3/lib/index.js` 中 `const commit = "6b729fe"` |
| 8 | bundle 清单与安装 | 已证实。out-of-tree bundle 需 `main`、`exports["./client"]`、`dsh.bundle.patch`、`dsh.client.platform='web'`；`dsh plugin add <path>` 以 link 方式写入 profile 依赖和 bundle 列表；`engines.dsh` 不满足时拒绝启动 | `docs/user/develop/basic/publish.md:18-118`；`packages/boot/app-boot/README.md`（profiles 段） |
| 9 | 生命周期释放 | 已证实。`ctx.effect(effect)` 返回的 disposer 在插件卸载时执行；`ctx.slots.inject` 的贡献随声明塌陷和 fiber 卸载移除；`webServer.register` 返回删除该路由的 disposer | `docs/user/develop/framework/index.md:41-63`；`packages/host/webserver/src/index.ts:515-530` |
| 10 | 最小层次 | 已证实当前功能只需要:Host 查询函数（无 Cordis/文件/网络依赖）、Host 注册适配、Client 读取/校验、Client 面板与图标、一个 bundle 清单/批次配置。不需要数据库、领域实体、仓储、迁移或未来模块空壳 | 本仓库 `docs/plan/03_ARCHITECTURE.md` §1.3、§8；候选文件清单 |

## 2. 本单元接口决定

- 路由: `GET /knowledgeos/status`，exact，`auth: 'required'`，`cache-control: no-store`。
- 响应字段（10 个）:
  - `schema_version`（1）
  - `product`（`KnowledgeOS`）
  - `upstream_commit`（运行 Host 记录的提交）
  - `upstream_version`（运行 Host 的版本）
  - `expected_upstream_commit`（本仓库锁定提交）
  - `upstream_commit_verified`（`true` / `false` / `null`）
  - `host_instance_id`（本插件实例随机不透明 id，重启必变）
  - `started_at`、`checked_at`（ISO 8601，服务端时刻）
  - `status`（本单元固定 `ok`，只表示本只读服务可用）
- 增加 `expected_upstream_commit` / `upstream_commit_verified` 的理由: DSH_START 允许按真实接口调整字段，但必须保留“固定提交是否被真实核验”的可验证含义；把不一致塞进 `status` 会混淆“服务不可用”和“构建不是锁定版本”。
- 不返回: 密钥、Cookie、环境变量、绝对路径、文件、账户、会话正文、堆栈。
- Client 不轮询；只在挂载和用户点击刷新/重试时请求。卸载时 abort 在途请求。

## 3. 风险与未证实项

1. **源码启动的提交来源**: 源码启动的 Host 从 `DSH_CLIENT_COMMIT_HASH` 读取提交，必须由启动脚本按检出 SHA 注入；若未注入则返回 `unknown`，UI 显示“无法核验”，不得算 T01 通过。候选脚本已注入锁定 SHA，并在 T01 断言页面显示该值。
2. **HMR 是否重载 profile patch**: 文档称 profile 的 `cordis.patch.yml` 支持热重载，但本单元需实测“禁用 Host 行后路由 404、恢复后 200”。若环境不重载，则 T04 的该子项记 NOT_RUN/FAIL，不用重启冒充热重载。
3. **面板卸载后的定时器**: 代码静态上无 interval/timeout（仅 fetch 超时，且在 finally 清理）；运行证据以“离开面板 15 秒内无新状态请求”与 DOM 数量为限，不能证明浏览器内部所有定时器。
4. **构建产物的实际加载一致性**: 需比对 profile 链接的 `lib/index.js`/`lib/client.js` 哈希与候选清单一致；仅“构建成功”不构成加载证据。
5. **桌面形态**: 本单元最低门槛为 Web profile；Desktop 冒烟 NOT_RUN。未验证 Electron 转发与打包路径。

## 4. 对实现的约束清单

1. 只能有一个新面板和一个侧栏入口；不得生成第二套应用外壳或额外导航。
2. Host 路由必须使用现有 `webServer` 与现有连接认证；不得新开公网/局域网监听，不得绕过 `auth`。
3. Client 只能通过 `window.__ModuleLoader__.load` 的 closure-factory 形式装载，不得把 Vite 页面或静态 HTML 当作插件。
4. 成功状态只能来自 2xx 且通过形状校验的响应；失败必须显示错误，已有旧数据必须标记失去实时性。
5. `upstream_commit` 必须来自运行 Host 的构建元数据，不能由前端常量伪造；不一致或未知必须可见。
6. 所有注册必须可释放；卸载后不得重复入口、重复路由或遗留请求。
7. 不引入数据库、登录、权限、RAG、模型调用、未来工作区或安装包依赖。
