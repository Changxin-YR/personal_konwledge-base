---
instruction_revision: "3.2.1"
execution_phase: "codex_foundation"
executor: "codex"
active_unit: "FND-004"
auto_advance: false
---

# 当前执行指令：Codex · FND-004 对象权限与共享入口边界

本文件是仓库唯一当前可执行提示词。FND-003 已在提交 `5621f3d0e40dc11bcd2062687a9ad3087f8c4442` 通过并保持历史证据；FND-004 因上一候选存在未关闭的权限问题，按本修订重新置为 `in_progress`，上一轮 FND-004 PASS 不得直接放行下一单元。本轮只完成 FND-004；FND-005 只能记录设计，禁止激活或编码。不得自动开始 FND-006、资料导入或完整产品审查。

## 1. 基线和边界

| 项目 | 约定 |
|---|---|
| 仓库 | `https://github.com/Changxin-YR/personal_konwledge-base.git` |
| 分支 | `codex/knowledgeos-fnd-004` |
| 基础提交 | `5621f3d0e40dc11bcd2062687a9ad3087f8c4442` |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738`，DSH `0.2.2-rc.3` |
| 执行器 | Codex；DSH 继续作为真实产品 Host |
| 状态 | FND-003 `passed`；FND-004 唯一 `active_unit`；`auto_advance=false` |
| 架构 | HTTP/API → 身份与权限用例 → 领域授权规则 → SQLite 存储端口/适配器 |

先阅读 `AGENTS.md`、执行状态、工作单元、FND-003 验收报告以及 `docs/plan/01_REQUIREMENTS_BASELINE.md`、`03_ARCHITECTURE.md`、`04_DATA_AND_STATE_CONTRACTS.md`、`05_API_AND_AI_CONTRACTS.md`、`07_ACCEPTANCE_MATRIX.md`、`11_AGENT_AND_PROMPT_PROTOCOL.md`。保留用户修改；不 `reset --hard`、不 force push、不过写历史迁移校验值。

## 2. 本轮目标

建立统一的真实对象授权入口。每次对象操作都必须使用服务端生成的 `actor`、`service_id`、空间/对象归属、动作、服务器当前时间、授权的生效/到期/撤销状态。动作固定为 `read`、`comment`、`edit`、`export`、`manage_share`、`delete`、`review`、`view_learning_records`。默认拒绝；`edit` 不蕴含 `delete` 或 `manage_share`；`now >= expires_at` 拒绝；撤销后下一次读取立即重新判权。

最小真实模型包括：个人/项目知识对象、项目、项目成员资格、逐动作资源授权记录。个人对象默认仅所有者可用；管理员标签不自动获得他人私人正文或学习记录；项目成员资格不自动公开个人训练记录。列表、直接 URL、修改、删除、动作检查和后续衍生读取都经过同一授权判断，不先取全量再由前端过滤。跨 service、跨 space、伪造 actor/owner/user/role 字段一律拒绝，未知或无权对象使用安全的 404/403 且不泄露标题、正文或存在性。

## 3. 迁移和接口

保留 v1/v2 表、数据和 checksum，新增原子版本化 v3 迁移并在启动时核对真实 schema、外键、CHECK、唯一约束、允许对象和三条迁移账本。失败回滚不得留下半迁移；重启保持 service、成员、对象、授权状态。

本轮允许的最小业务路由：

- `GET/POST /knowledge/v1/objects`：仅返回/创建当前 actor 允许的对象；创建默认个人对象。
- `GET/PATCH/DELETE /knowledge/v1/objects/:id`：每次调用重新检查 `read`、`edit` 或 `delete`。
- `POST /knowledge/v1/objects/:id/action`：对八类动作执行同一授权判断，不能替换 actor。
- `POST /knowledge/v1/projects`、`POST /knowledge/v1/projects/:id/memberships`：创建最小项目与成员有效期。
- `POST /knowledge/v1/grants`、`POST /knowledge/v1/grants/revoke`：对象所有者在 `manage_share` 授权下创建/撤销逐动作记录。

共享端实际注册路由必须精确列出并留证：既有 `/knowledgeos/status`、`/knowledgeos/account`、`/knowledgeos/setup`、`/knowledge/v1/auth/*`、`/knowledge/v1/me*`、`/knowledge/v1/spaces`，以及本轮对象/项目/授权路由。普通业务 Cookie 不得成为 DSH owner；原生 RPC、插件管理、Shell、Session 附件、任意文件读取和非白名单接口必须拒绝或不存在。不能只隐藏前端按钮宣称安全。Host 仅在隔离 loopback 环境运行；Connection 停用/恢复的真实能力和上游限制分开记录。

## 4. 逐项开发顺序

1. 领域动作判定、默认拒绝和时间边界；先跑纯规则反例。
2. 个人对象真实存储、列表/直接读取和跨用户隔离。
3. 项目、成员资格和最小逐动作授权；编辑不含删除/分享管理。
4. 到期、撤销、再次读取和重启保持。
5. 共享 profile 路由白名单、高权限接口阻断与身份分离。
6. FND-001 至 FND-003 受影响回归、构建和独立复核。

同一时刻只有一名生产代码写入者。每完成一个行为立即测试；失败先修当前行为。测试可使用真实固定版本 DSH Host、真实业务 SQLite 和合成管理员/成员甲/成员乙身份；夹具、受控故障、纯规则测试和真实运行结果必须分开标注。

## 5. FND-004 验收义务

- `FND-004-T01`：管理员、甲、乙真实会话；个人对象创建、列表、直接 URL、猜测 ID、actor/user/role 替换；只能读取本人，不能泄露对方标题/正文。
- `FND-004-T02`：read/comment/edit/export/manage_share/delete/review/view_learning_records 矩阵；编辑者尝试删除和管理分享均拒绝；未明确授权默认拒绝。
- `FND-004-T03`：项目成员与逐动作 grant；只读与编辑差异；成员资格不自动开放个人学习记录；跨项目和跨 service 拒绝。
- `FND-004-T04`：`valid_from` 前、到期边界 `now == expires_at`、撤销后再次读取/列表/动作均拒绝；新 grant 才恢复。
- `FND-004-T05`：真实 SQLite v3 迁移、重启、失败回滚，v1/v2 checksum 和数据保持；未知/伪造 schema 在修改前拒绝。
- `FND-004-T06`：实际共享路由清单；业务 Cookie 探测 DSH owner/RPC/file/plugin/session/shell/非白名单路径；Connection 停用/恢复按真实 Host 能力记录。
- `FND-004-T07`：FND-001、FND-002、FND-003 相关回归、类型检查、构建和候选产物哈希。

## 5.1 本次 3.2.1 定点修复与复验要求

1. 项目对象创建必须由服务端真实登录会话生成 actor，并检查目标 `project_id` 属于当前 `service_id`、项目有效且 actor 具有当前时刻有效的项目成员关系和创建权限；非成员不能借创建对象自动获得项目对象授权，跨项目和跨 service 必须拒绝。
2. `POST /knowledge/v1/grants/revoke` 的请求体必须接受合法 `grant_id`（兼容既有 `id` 仅在契约明确记录时允许），先核对目标 grant 所属对象和当前 actor 的 `manage_share`，撤权后下一次真实 HTTP 读取、列表和 action 立即重新判权。
3. T01–T04 必须使用固定 DSH Host、真实登录和三个隔离 Cookie 上下文；不得用手工 actor 或静态源码包含检查替代 HTTP 证据。
4. T05 必须覆盖 v3 迁移失败、事务回滚、伪造/未知 schema 拒绝和故障解除后的正常恢复，并比较真实 schema、版本、账本和数据。
5. T06 必须实际探测业务 Cookie 对 DSH owner、RPC、Shell、文件、插件和 Session 附件的权限，分别记录本机 Host 与专用共享 profile；共享 profile 未完成最小装配时对应项只能 `BLOCKED` 或 `NOT_RUN`。
6. 修改对象的 `expected_revision` 冲突必须返回 HTTP 409；同时验证无权列表、错误输入、非法项目标识和撤权竞态负例。
7. 冻结新候选后执行类型检查、构建、T01–T07、独立复核和 FND-001～003 受影响回归；保存真实命令、退出码、候选指纹和运行证据。只有本修订全部要求实际验证通过，才可重新标记 FND-004 为 `passed`、`awaiting_user`。

完整 A02、A34、A46 只有其真实范围全部覆盖才可 `PASS`。本轮搜索索引、AI 摘要/答案、文件下载、邀请码兑换、完整缓存失效和完整项目审核仍记 `NOT_RUN`，不能用基础 ACL 通过冒充完整场景通过。

## 6. 证据和交付

所有架构决定、权限矩阵、测试方案、候选哈希、运行日志摘要、独立复核和报告保存到 `docs/evidence/FND-004/`。结果只能使用 `PASS`、`FAIL`、`BLOCKED`、`NOT_RUN`。冻结候选后执行完整本轮测试，由独立测试角色复核；更新进度、阻塞和工作单元状态；提交并推送 `codex/knowledgeos-fnd-004`，回读确认远端 SHA，然后停止等待用户。

验证命令至少包括：

```text
node scripts/verify-plan.mjs
node scripts/fnd004/run-all.mjs --out docs/evidence/FND-004/runs/<candidate>
node scripts/fnd004/independent-verification.mjs --candidate <sha>
pnpm --dir packages/knowledgeos-panel typecheck
pnpm --dir packages/knowledgeos-panel build
```

不要调用外部模型 API 作为本轮必要条件，不开放公网，不自动进入下一单元。
