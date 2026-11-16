# FND-002 最终报告

> **当前状态（v3.0.0 Codex 接管）：FND-002 仍为 in_progress，R1/R2 OPEN。** 以下正文保留 cba39e4 对 1b99e39 的历史提交结论；新的真实数据库前缀反例使整体 PASS 不再成立。参见 [提交复核](SUBMISSION_REVIEW_20261116.md)。原始运行记录不修改，修复与新候选复测尚未完成；历史正文的 DSH 执行者与 Codex locked 不适用于当前接管。

- `unit_id`: **FND-002**
- `instruction_revision`: **2.1.0**
- `executor`: **DeepSeek Harness**
- `result`: **PASS**（本单元切片；T01–T09 实际通过，独立复核完成）
- 产品候选：`1b99e392593ef0213f68f8dfb45f5d34a06eac1b`
- 证据提交：`df5ec3c52093616b85370d68e42b7d2b36982490`
- 工作分支：`dsh/knowledgeos-fnd-002`
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）
- 继承基线：FND-001 passed，`ce3a00ccd7c8cc46eaae6e660144730109cf93a0`
- 独立结论：[independent-verification.md](independent-verification.md)；证据：`runs/1b99e39/`

## 1. 实际功能与架构落点

```text
已认证 HTTP
  → Host WebServer handler (auth:'required')
  → 应用用例 / 内层存储端口
  → SQLite 适配器（node:sqlite, 独立磁盘文件）
  → Host 停止并重启
  → 再次读取同一记录
```

| 层 | 文件 | 责任 |
|---|---|---|
| Host 组合根/传输入口 | `src/host/index.ts` | 可信配置、路由注册、在途请求、释放顺序 |
| 应用用例/端口 | `src/host/records.ts` | create/get、内容摘要、稳定错误词汇；不导入 DSH/HTTP/React/SQLite |
| SQLite 适配 | `src/host/storage.ts` | 连接、归属/版本预检、v1 迁移、参数化 SQL、事务、关闭 |
| HTTP 映射 | `src/host/http.ts` | 方法/媒体类型/UUID/body/UTF-8/字段校验、错误映射 |
| 可信配置 | `src/host/config.ts` | Schemastery `Config.dataDir`，绝对路径校验 |
| 测试钩子 | `src/host/test-support.ts` + `lib/storage.js` | 仅测试直接导入；不注册路由 |

新增两个真实路由，沿用上游认证与来源保护：

- `POST /knowledgeos/foundation/records`（201 首次 / 200 重放 / 409 冲突）
- `GET /knowledgeos/foundation/records/{id}`（200 / 404）

FND-001 的 `/knowledgeos/status` 与面板不变；缺少 `dataDir` 的旧 profile 仍可读 status，持久化接口返回 503 `STORAGE_UNAVAILABLE`。

## 2. 数据库契约

- 文件：`<dataDir>/knowledgeos.sqlite`；`dataDir` 只来自 profile 的可信 `knowledgeos-host` config。
- `application_id=0x4B4F5331`（1263489841）、`user_version=1`。
- 仅两表：`schema_migrations`、`storage_probe_records`；`STRICT`。
- `journal_mode=WAL`、`foreign_keys=ON`、`synchronous=FULL`、`busy_timeout=250` ms。
- v1 DDL + 账本 + 应用归属/版本同一事务；账本 checksum 为规范 SQL 的 SHA-256 `033dcf95cd9e7c6e4fa964804de7944c1b99daa4b4acd5b92708555cb15dc84a`。
- 已存在库先只读预检全部非 `sqlite_%` schema 对象；未来版本、错 application_id、坏 checksum、未知表/视图/触发器均拒绝，不删库、不改账本、不换路径。
- 幂等键与摘要随记录同事务持久化；唯一约束兜底并发；同键异内容 409，旧记录不变。
- 关闭幂等、只释放句柄、不删除文件；日志 `knowledgeos-storage: closed` 恰一次。

## 3. 九项测试结果（当前候选）

| ID | 结果 | 关键实际值 | 证据 |
|---|---|---|---|
| T01 | **PASS** | 201 创建、GET 200；PID `59508→61400`、Host 实例变化；重启后 id/content/created_at 逐字节一致；独立只读 SQLite 恰 1 行；DSH_HOME 无业务库 | `runs/1b99e39/T01.json`、`t01-*.log` |
| T02 | **PASS** | `BEGIN IMMEDIATE` 内先成功后 PK 冲突：primaryCode=19、rolledBack=true、部分写入 0；基线保留；连接可继续写；HTTP `force_fail` 422 且不写 | `T02.json` |
| T03 | **PASS** | node `24.22.0`、SQLite `3.53.4`；WAL/fk=1/sync=2/busy=250；app_id=1263489841、uv=1；用户对象恰两表；账本 checksum 一致；重复启动不变；外键真实拒绝 | `T03.json`、`t03-*.log` |
| T04 | **PASS** | 迁移中途失败无半提交；future / bad-checksum / wrong-app / unknown-schema / **unknown-view** 全部拒绝且库逐字段不变；Host 对 future 503、status 200；恢复 201 | `T04.json`、`t04-*.log` |
| T05 | **PASS** | 201→200 同 id/created_at；重启后重放 200；同键异内容 409 旧值不变；并发 200+201；该键恰 1 行 | `T05.json` |
| T06 | **PASS** | 父路径为文件：503 `STORAGE_UNAVAILABLE`、无回退库、status 200；外部写锁：503 `STORAGE_BUSY` retryable、实测 351 ms（<2 s）；释放后 201 且原数据保留 | `T06.json` |
| T07 | **PASS** | `closed` 恰 1 次、无 close failed；路由不再返回本 API 信封（GET 404 / POST 405）且未写；重用后 opened 第 2 次、原记录 200、新写 201、库 2 行 | `T07.json`、`t07.log` |
| T08 | **PASS** | 27 断言；匿名/坏 Cookie 401、外站/null/cross-site 403 均不写；无 Origin CLI 201；14 个输入用例；SQL 文本逐值保存；错误体 5 字段无路径/SQL/堆栈 | `T08.json` |
| T09 | **PASS** | verify-plan/scope-check/tsc exit 0；profile 加载 lib 哈希=候选；FND-001 浏览器回归 18 步 PASS；旧 profile 无 dataDir：写读 503、status 200、未建库 | `T09.json`、`T09-browser/` |

独立角色另跑：`check-db 73/73`、`boundary 59/59`、`view-objects 11/11`、构建可复现、脱敏扫描 PASS；未发现功能缺陷。

## 4. 缺陷、作废候选与复测

- **D0（真实缺陷，已修复）**：原候选 `d7a453d` 只用用户表判断空白库，仅含 VIEW 的非空库会被当作空白接管。独立角色用冻结产物复现；新候选 `1b99e39` 改为检查全部非 `sqlite_%` schema 对象（表/视图/触发器），并新增 `unknown-view` fixture；专项 11/11 PASS。`d7a453d` 九项 PASS 保留为历史并标 SUPERSEDED，不作为收口依据。
- **P3（已加固）**：回滚失败现在 `fail-closed`，不再继续重查/返回 replay；事务探针始终结束事务。
- **D2（脚本可读性）**：T05 并发断言 `actual` 记录全表计数（2）而非过滤后 1；断言本身使用过滤计数且正确。独立脚本已核真值；不改产品。
- **D3（脚本强度）**：T09 的 lib 哈希断言只判长度；独立角色已逐值比较并隔离重建产物。记为脚本覆盖缺口。
- **D5（口径）**：迁移失败/归属不兼容统一映射 `503 STORAGE_INCOMPATIBLE`（均不可写）；test-plan 的 `STORAGE_UNAVAILABLE` 字样按“打开/路径不可用”区分，不改产品。
- **D6（脚本字段）**：`summary.started_at` 为 null（取值路径错误）；不影响九项断言与产品结论，记为证据脚本瑕疵。

## 5. NOT_RUN 与剩余限制

- Desktop/Electron 探针：NOT_RUN（最低门槛为真实 Node Web Host）。
- Host 级迁移中途失败：NOT_RUN（T04 用同一真实适配器/迁移代码在隔离 fixture 上执行）。
- 回滚自身失败的 fail-closed 分支：代码审查 + 正常路径验证，未安全构造故障。
- 突然断电零丢失：不可由本单元正常重启测试证明。
- Windows 安装包、多人账号、真实 GPT、RAG/知识实体：范围外。
- 本轮仅形成 F01/F42、A07/A49 的前置局部证据，不标完整需求/场景通过。

## 6. 隔离启动与复验

```powershell
$knowledgeosRepo = "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
$dshRoot = "$knowledgeosRepo\.cache\build\dsh-39163dd"
$dshTestHome = "$knowledgeosRepo\.cache\dsh-home-fnd002"
$knowledgeosDataDir = "$knowledgeosRepo\.cache\knowledgeos-fnd002-data\manual"
$env:DSH_HOME = $dshTestHome
$env:DSH_CLIENT_COMMIT_HASH = "39163dd30f703a79079e2d2446545cff3c453738"

# 首次创建 profile 才使用；继续运行不要重置
# node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --from-default-profile web --dump-config

cd $dshRoot
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --port 3100 --no-open
```

profile `cordis.patch.yml`：

```yaml
- id: knowledgeos-host
  config:
    dataDir: "C:/Users/27363/Desktop/personal base/personal_konwledge-base/.cache/knowledgeos-fnd002-data/manual"
```

复验：

```powershell
cd $knowledgeosRepo
node scripts/fnd002/run-all.mjs --out ".cache\fnd002-runs\manual" --run-id manual
node scripts/fnd002/scope-check.mjs
```

## 7. 停止状态

FND-002 已完成并停止。`active_unit=FND-002`、`unit_state=awaiting_user`、`auto_advance=false`、Codex locked；未激活 FND-003，未合并 main。FND-001 代码、面板、`/knowledgeos/status` 及历史证据均保留。
