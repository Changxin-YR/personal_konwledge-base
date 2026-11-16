# FND-002 架构与最小契约记录

> **当前补充：** 既有层次、两表和 API 保留。v2.1.1 仅修正内部对象的字面 sqlite_ 前缀判断和证据检查；正文中的 sqlite_% 描述不能按未转义的 LIKE 模式实现。见 [提交复核](SUBMISSION_REVIEW_20261116.md)。

- unit: FND-002，instruction_revision 2.1.0
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）
- 运行环境：Windows 11 Pro、Node `24.22.0`、SQLite `3.53.4`（`node:sqlite`）
- 分支：`dsh/knowledgeos-fnd-002`
- 范围：真实已认证 HTTP → Host handler → 应用用例/端口 → 独立 SQLite 文件 → Host 重启后读取；不进入 FND-003。

## 1. 固定源码依据

| 能力 | 实际接口 | 依据 |
|---|---|---|
| 插件可信配置 | `Config` 类型 + 同名 Schemastery schema；`apply(ctx, config)` | `docs/user/develop/basic/config.md` |
| 写路由 | `webServer.register({ kind:'exact', path, auth:'required', handler(req,res,peer?) })`；handler 自行处理方法/正文/响应 | `packages/host/webserver/src/index.ts:117-125` |
| 只读 GET | 同一 handler 机制；不使用 `resource`（其只接受 GET/HEAD） | 同上 |
| 来源/认证 | 上游 Connection 先校验 Host/Origin，再验证 Cookie；`auth:'required'` | `packages/client/connection/src/api-request-trust.ts`、`authentication-token` |
| SQLite 驱动 | `node:sqlite` `DatabaseSync`；真实事务 `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` | `packages/storage/storage-sqlite/src/{index,schema}.ts` 与本地运行时探针 |
| 发布/安装 | out-of-tree bundle；`dsh plugin --profile <name> add <path>` | `docs/user/develop/basic/publish.md` |

## 2. 文件落点

```text
packages/knowledgeos-panel/
  src/host/config.ts        # Config schema + 绝对路径校验
  src/host/storage.ts       # SQLite 适配器、归属/版本预检、v1 迁移、事务、关闭
  src/host/records.ts       # 内层存储端口 + create/get 应用用例（不导入 HTTP/DSH/SQLite）
  src/host/http.ts          # body/JSON/字段/错误映射与响应
  src/host/index.ts         # 组合根：配置、storage、路由、在途请求、释放
  src/host/test-support.ts  # 仅测试导入的事务/迁移故障入口，不注册路由
scripts/fnd002/             # 真实 Host/HTTP/SQLite 测试与范围检查
```

Host 半继续编译为 `lib/index.js`；`lib/storage.js` 与 `lib/test-support.js` 仅给测试进程直接导入，不暴露 HTTP 入口。

## 3. 数据契约

数据库文件：`<dataDir>/knowledgeos.sqlite`（`dataDir` 必须来自 profile 中 `knowledgeos-host` row 的可信 config，绝对路径；缺省时存储不可用）。

- `PRAGMA application_id = 0x4B4F5331`（1263489841），`PRAGMA user_version = 1`。
- 仅两张应用表：
  - `schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`
  - `storage_probe_records(id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, request_digest TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)`
- 连接配置：`journal_mode=WAL`、`foreign_keys=ON`、`synchronous=FULL`、`busy_timeout=250`；均在事务外设置。
- v1 迁移 DDL 与账本、`application_id`、`user_version` 在同一个 `BEGIN IMMEDIATE` 事务提交；校验和为规范 SQL 字节的 SHA-256，运行时导出 `MIGRATION_V1_CHECKSUM`。
- 已存在库先只读预检：application_id、user_version、用户表集合、账本版本/校验和；未来版本、归属不符、校验和不匹配、非空未知 schema 均拒绝，不降级/不清空/不换路径。
- 空白判定必须同时满足 application_id=0、user_version=0、无用户表；仅有 `user_version=0` 不视为空白。

## 4. HTTP 契约

| 方法/路径 | 行为 |
|---|---|
| `POST /knowledgeos/foundation/records` | `auth: required`；`Idempotency-Key` 规范小写 UUID；`Content-Type: application/json`；正文 `{content}`；首次 201，同键同内容 200，同键不同内容 409 |
| `GET /knowledgeos/foundation/records/{id}` | `auth: required`；UUID 路径；200 或 404 |

成功正文：`{ data:{ id, content, created_at }, meta:{ request_id, schema_version:1 } }`。

错误正文：`{ code, message, request_id, retryable, safe_details }`。映射：400 INVALID_JSON、422 INPUT_INVALID、413 PAYLOAD_TOO_LARGE、415 UNSUPPORTED_MEDIA_TYPE、405 METHOD_NOT_ALLOWED（带 Allow）、404 NOT_FOUND、409 IDEMPOTENCY_CONFLICT、503 STORAGE_BUSY（retryable true）、503 STORAGE_UNAVAILABLE、503 STORAGE_INCOMPATIBLE、500 INTERNAL_ERROR。

输入：正文实际读取上限 16384 字节；严格 UTF-8；content 为非空字符串、UTF-8 1–4096 字节、`isWellFormed()`；拒绝未知字段/错误类型/孤立代理项；不 trim、不归一化。SQL 全部参数化。

## 5. 幂等与事务

- 摘要为 content 原值 UTF-8 的 SHA-256；`Idempotency-Key` 不是身份。
- 适配器在单个 `BEGIN IMMEDIATE` 事务内按 `idempotency_key` 查询、比较摘要、插入；唯一约束兜底并发。冲突回滚后返回 409；同内容重放返回原 `id/content/created_at`。
- 提交抛错时尝试 `ROLLBACK`；回滚失败/状态不明则标记存储不可写并返回 503/500，绝不返回成功。
- 重启、重装和禁用行不得删除数据库；关闭只释放连接。

## 6. 生命周期与关闭

`apply` 打开存储失败时保留 Host 可达，存储进入 `unavailable`/`incompatible`，写/读接口返回 503；`/knowledgeos/status` 语义不变。

释放顺序：设置 closing → 撤销两条路由 → 等待已接收请求结束（有界）→ `DatabaseSync.close()` 一次 → 记录 `knowledgeos-storage: closed`。关闭后不得使用句柄；再次挂载重新打开同一文件。测试通过 profile 行禁用/恢复触发真实插件卸载/重载，并以 Host 日志与数据读取证明关闭/重开。

## 7. 测试故障入口边界

T02/T04/T06 的受控故障只在测试进程内通过 `lib/storage.js`/`lib/test-support.js` 或独立 SQLite 连接注入；HTTP 不接受 SQL、路径、迁移版本、force_fail、db_path 或身份字段。故障作用于真实 SQLite 文件，不引入内存/JSON 回退。

两个实现边界决定：

- **配置错误 fail loud**：`dataDir` 缺省是受支持模式（status 可用、持久化 503）；显式但为空或相对路径属于插件配置错误，在 Loader 装载时拒绝，不注册半可用实例。打开/归属/迁移失败则保留 Host 可达并让持久化接口返回 503。
- **测试钩子不可路由**：`ProbeStorage` 的迁移覆盖与事务故障方法仅由测试脚本直接导入 `lib/storage.js`/`lib/test-support.js`；`index.ts` 不引用它们，HTTP 的未知字段会被 422 拒绝。迁移账本、视图/触发器等全部非 `sqlite_%` schema 对象参与空白判定与归属校验。

## 8. 本轮不实现

账号/对象权限、正式知识实体、资料解析、RAG、产品模型、jobs/outbox、协作服务、数据库管理 UI、备份恢复、Windows 安装包、FND-003。
