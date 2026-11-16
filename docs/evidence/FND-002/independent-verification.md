# FND-002 独立测试与验收报告

> **历史独立验证记录：** 本文针对 1b99e39 的当时已覆盖用例。2026-11-16 后续复核发现产品与测试共有的前缀过滤漏检，当前由 Codex 按 v3.0.0 接管修正，不能继续用本文最终 PASS 覆盖新反例。见 [提交复核](SUBMISSION_REVIEW_20261116.md)；原执行者与结果保留，新结果另存。

- 角色：独立测试与验收（非实现者；未修改产品代码、测试脚本、配置或状态）
- 单元/指令：FND-002，`DSH_START.md` v2.1.0（已读 §5–§8）
- 分支：`dsh/knowledgeos-fnd-002`
- **当前产品候选：`1b99e392593ef0213f68f8dfb45f5d34a06eac1b`；证据提交：`df5ec3c52093616b85370d68e42b7d2b36982490`**
- 历史候选：`d7a453d6dfbdaee4c495b5d920086608fb9c8e1f`（证据 `8df9d70`），已被主管按 P2/P3 加固取代；
  其九项 PASS 与独立复核作为历史保留在 `runs/d7a453d/`（见 §8），**不作为本次收口依据**。
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738`（0.2.2-rc.3），运行时 `.cache/build/dsh-39163dd`
- 隔离环境：`DSH_HOME=.cache/dsh-home-fnd002`，profile `knowledgeos-storage-test`，端口 3100；
  业务库 `.cache/knowledgeos-fnd002-data/<run_id>/knowledgeos.sqlite`
- 实测环境：Windows 11 Pro、Node **v24.22.0**、`node:sqlite` SQLite **3.53.4**
- 实测时间：2026-11-16 15:18–15:37（Asia/Shanghai）；新候选运行窗口 15:31:37–15:34:34
- 桌面 DSH：PID 51900（start 10:36:09）与 GUI 端口 62739（PID 57664，start 10:36:13）全程未停止/
  未重启/未安装插件；只操作隔离 profile 与端口 3100。

---

## 1. 结论摘要（当前候选 1b99e39）

| 维度 | 结论 |
|---|---|
| 候选核对 | **PASS**：HEAD=df5ec3c、工作树干净、`git diff 1b99e39..df5ec3c -- packages scripts` 为空、11 个 SHA256 全对 |
| 主证据 `run-all.mjs` | **PASS**：exit 0，summary.result=PASS，T01–T09 全 PASS（9/9） |
| 独立真实性抽查 | **PASS**：check-db 73/73；独立只读 SQLite 与真实 HTTP 交叉一致 |
| 独立边界/生命周期 | **PASS**：boundary 59/59（双进程并发、close/reopen、旧 profile 503） |
| 新增加固专项（P2/P3） | **PASS**：view-objects 11/11；未知视图库/带视图的合法库均拒绝且不改写，合法库/空白库不受影响 |
| 构建可复现 | **PASS**：隔离副本重建 lib/{index,storage,client}.js 与候选指纹逐字节相等 |
| 证据脱敏与产物卫生 | **PASS**：14 个明文机密全部替换，0 残留；证据目录无 DB/WAL/SHM/Cookie |
| 范围/FND-001 回归 | **PASS**：仅两表、两条新路由、一个存储适配器；status/client 未改；浏览器回归 18 步 PASS |
| **最终判定** | **PASS（当前候选 1b99e39，T01–T09 全部 PASS，无已知功能缺陷）** |

候选在本次验证期间保持冻结：验证结束后再次核对 HEAD=df5ec3c、`git status --porcelain` 仅有本角色新增的
未跟踪证据文件、11 个哈希与 candidate.md 一致（快照见 `runs/1b99e39/independent/candidate-state.txt`）。

---

## 2. 候选核对（实跑，非引用主管自测）

| 检查 | 实际结果 |
|---|---|
| `git rev-parse HEAD` | `df5ec3c52093616b85370d68e42b7d2b36982490` |
| `git rev-parse --abbrev-ref HEAD` | `dsh/knowledgeos-fnd-002` |
| `git diff 1b99e39..df5ec3c -- packages scripts` | 空（证据提交只新增 `docs/evidence/FND-002/candidate.md` 更新与 `architecture-review.md`） |
| 验证结束时 `git status --porcelain` | 仅 `?? docs/evidence/FND-002/independent-verification.md`、`?? docs/evidence/FND-002/runs/`（本角色证据） |
| 11 个关键文件 SHA256 | 全部与 candidate.md 一致（下表） |
| `node scripts/verify-plan.mjs` | exit 0，status=PASS，activeUnit=FND-002，autoAdvance=false，codexReview=locked |
| `node scripts/fnd002/scope-check.mjs` | exit 0，result=PASS，allowed_tables 恰两表，runtime deps 仅 `@deepseek-ai/schemastery` |
| 插件 `tsc -p tsconfig.json`（cwd=packages/knowledgeos-panel） | exit 0（根目录无 node_modules，须用包内 `node_modules/typescript/bin/tsc`） |

| 文件 | SHA256（= candidate.md） |
|---|---|
| `packages/knowledgeos-panel/lib/index.js` | 1a32e6012e61fa73d8a7b404007e63c834b8b40b4514a702f6c7cced5a9cec2c |
| `packages/knowledgeos-panel/lib/storage.js` | 40fa07f07550d9b20cfe24b80d27844a27f40ce7ce9fd7c8c6c9a84a9e3f9d65 |
| `packages/knowledgeos-panel/lib/client.js` | f0eb568f9021f4ad4dbbd85ebb6683ea0245d44c449d4b938738caacdf9974d9 |
| `packages/knowledgeos-panel/package.json` | 48a6f24ff44437ebaee238ee53c96422fdcc7968f645582fb95b5585a52f1c55 |
| `packages/knowledgeos-panel/src/host/storage.ts` | 1f0f913f6ffb08edc86924e490c34f1e1db68226b710f00408b187355a79116e |
| `packages/knowledgeos-panel/src/host/http.ts` | a20bd13760e141314ab46886440fc7157c0640788c4f45d72cd8d2f5b02f1ce6 |
| `packages/knowledgeos-panel/src/host/records.ts` | 658553efd04345b770879ef5225da61463630fbbadf2818b2ba1ebb7373bf675 |
| `packages/knowledgeos-panel/src/host/config.ts` | 1e108b328f02e7c9ef25851577b0160d71399b05030b991b306635f7bafc76ed |
| `packages/knowledgeos-panel/src/host/index.ts` | 0e91c7cddbc19a34aa645742a5d80d9b7cf8fa0a32b3c1601288dacdf355afd7 |
| `scripts/fnd002/run-all.mjs` | 918c4385d966ccc96f97814e1e3bfc300c16fdc6d2d2421134474d369522a4e6 |
| `scripts/fnd002/scope-check.mjs` | d7e3a7aa173f7414d25deb4c439c8fdb8f02cc2c28574eafc15ab1d3eea6a68e |

profile 实际加载：`.cache/dsh-home-fnd002/profiles/knowledgeos-storage-test/package.json` 依赖
`link:C:/…/packages/knowledgeos-panel`；该路径下 `lib/index.js`、`lib/storage.js`、`lib/client.js` 的
SHA256 与 candidate.md 完全相同（独立 check-db 的 T09 项逐值比较）。

---

## 3. 环境、命令与退出码

| # | 命令（工作目录） | 退出码 | 说明 |
|---|---|---|---|
| 1 | `git rev-parse HEAD`；`git diff 1b99e39..df5ec3c -- packages scripts`（repo） | 0 | 见 §2 |
| 2 | `node scripts/verify-plan.mjs`（repo） | 0 | PASS |
| 3 | `node scripts/fnd002/scope-check.mjs`（repo） | 0 | PASS |
| 4 | `node node_modules/typescript/bin/tsc -p tsconfig.json`（packages/knowledgeos-panel） | 0 | 类型检查 |
| 5 | `node scripts/fnd002/run-all.mjs --out "docs\evidence\FND-002\runs\1b99e39" --run-id 1b99e39 --candidate 1b99e39`（repo，`DSH_HOME`=隔离 home） | **0** | 主证据，RESULT PASS |
| 6 | `node docs\evidence\FND-002\runs\1b99e39\independent\check-db.mjs 1b99e39` | **0** | 独立只读 SQLite 73 项 |
| 7 | `node docs\evidence\FND-002\runs\1b99e39\independent\boundary.mjs` | **0** | 独立真实 Host/HTTP 59 项 |
| 8 | `node docs\evidence\FND-002\runs\1b99e39\independent\view-objects.mjs` | **0** | P2 归属加固 11 项 |
| 9 | 隔离临时副本 `node build.mjs`（src+package.json+build.mjs，node_modules junction） | 0 | 构建可复现 |
| 10 | `node docs\evidence\FND-002\runs\1b99e39\independent\redact-runs.mjs` | **0** | 脱敏+泄漏扫描 |

主证据 summary：`run_id=1b99e39`、`result=PASS`、`failures=[]`、9 项全 PASS、
`finished_at=2026-11-16T07:34:34.851Z`。`started_at` 仍为 `null`（脚本取错字段，见 §7-D6），
不影响各项 JSON 的 `started/finished`。

---

## 4. T01–T09 结果与证据（当前候选 1b99e39）

证据根：`docs/evidence/FND-002/runs/1b99e39/`。结论来自本次实跑的 assertions 实际值。

| 测试 | 结果 | 关键实际值 | 证据 |
|---|---|---|---|
| **T01** 创建/读取/重启持久化 | **PASS** | POST 201、GET 200 同 id；重启 PID **59508→61400**、host_instance_id `b3ade512…`；重启后 200 且 `id/content/created_at` 逐字节一致（content=`1b99e39 中文记录 "double" 'single'\n第二行\backslash`，created_at=`2026-11-16T07:31:43.289Z`）；独立只读 SQLite 恰 1 行；`application_id=1263489841`、`user_version=1`、仅两表、账本 033dcf95…；DSH_HOME 无业务库 | `T01.json`、`t01-before.log`、`t01-after.log` |
| **T02** 事务中途失败与回滚 | **PASS** | 真实 `BEGIN IMMEDIATE` 内先成功后 PK 约束失败：`primaryCode=19`、`rolledBack=true`、失败事务 0 行；基线保留、连接可继续写；重开 2 行；HTTP `force_fail` 422 且不写 | `T02.json`、`t02-http.log` |
| **T03** 初始化/重复启动/运行时 | **PASS** | Host 实际日志 `node=24.22.0 sqlite=3.53.4 journal=wal foreign_keys=1 synchronous=2 busy_timeout=250 tables=2`（两次启动相同）；app_id/user_version/两表/账本 checksum；`sqlite_master` 用户对象恰两表（无视图/触发器）；外键真实拒绝孤儿行；重复启动账本 applied_at 不变、记录仍 1 行 | `T03.json`、`t03-first.log`、`t03-repeat.log` |
| **T04** 迁移失败/不兼容/归属 | **PASS** | 15 条断言全过。迁移中途失败无半提交；**5 类** fixture 全部拒绝且逐字段不变：future(user_version=2)、bad-checksum、wrong-app(12345)、unknown-schema、**unknown-view**（仅 view、app_id=0/uv=0 → STORAGE_INCOMPATIBLE，库仍只有 `foreign_view`）；Host 对 future 库写 503 STORAGE_INCOMPATIBLE、status 200；换有效目录恢复 201 | `T04.json`、`t04-host-future.log`、`t04-host-valid.log` |
| **T05** 幂等/重放/并发 | **PASS** | 首次 201；同键同内容 200 同 id/created_at（`ab3ebe63…` / `07:32:42.396Z`）；重启后重放 200；同键不同内容 409 IDEMPOTENCY_CONFLICT（retryable=false）旧值不变；并发 200+201；该键恰 1 行 | `T05.json`、`t05.log`、`t05-restart.log` |
| **T06** 打开失败/锁等待/恢复 | **PASS** | 父路径为文件 → 503 STORAGE_UNAVAILABLE、无回退库、status 200；独立进程持写锁 → 503 STORAGE_BUSY（retryable=true），实测 **351 ms**；释放后 201，原数据保留 | `T06.json`、`t06-invalid.log`、`t06-lock-host.log` |
| **T07** 连接释放/重开 | **PASS** | 卸载时 `knowledgeos-storage: closed` 恰 1 次、无 close failed；路由不再服务该 API（GET 404/SPA、POST 405，均无本 API `code`）且未写库；重启用后 opened 第 2 次、原记录 200、新写 201、库 2 行 | `T07.json`、`t07.log` |
| **T08** 认证/来源/输入边界 | **PASS** | 27 条断言全过。匿名 GET/POST 401、坏 Cookie 401；外站/null/cross-site 403 且不写；CLI（无 Origin）201；14 个输入用例（400/415/422×7/413/405×2/404/422）全部符合；SQL 片段文本 201 逐值保存、表结构不变；错误体仅 5 字段无路径/SQL/堆栈；计数 1→3 | `T08.json`、`t08.log` |
| **T09** 构建/范围/FND-001 回归 | **PASS** | verify-plan/scope-check/tsc 均 0；profile 链接候选包，lib 三产物哈希=候选；真实浏览器回归 18 步 PASS（含真实断连、失败/重试/恢复、禁用/恢复路由、6 张截图）；旧 profile 无 dataDir：写/读 503 STORAGE_UNAVAILABLE、status 200 KnowledgeOS、未建库 | `T09.json`、`T09-browser/`（`summary.json`、6×PNG、`host.log`、status-*.json）、`T09-old-profile.log` |

**九项：9 PASS / 0 FAIL / 0 NOT_RUN / 0 BLOCKED。**

---

## 5. 独立真实性抽查（不复用 summary 结论）

独立脚本与输出在 `runs/1b99e39/independent/`：`check-db.mjs`（+`.output.txt`）、`boundary.mjs`
（+`.output.txt`/`boundary-summary.json`/`boundary-transcript.json`/`host-phase*.log`）、`post-once.mjs`、
`view-objects.mjs`（+`.output.txt`/`.json`）、`rebuild-from-source.txt`、`candidate-state.txt`、
`redaction-report.json`。

### 5.1 独立只读 SQLite（check-db，73/73 PASS，exit 0）

- **T01**：真实文件 `.cache/knowledgeos-fnd002-data/1b99e39/t01/knowledgeos.sqlite`；恰 1 行；
  `0ff13315…`、`07:31:43.289Z`、content 与 HTTP 响应逐字节一致；`request_digest` 等于我对 content 重算的
  SHA-256；app_id/uv/两表/`journal_mode=wal`；两个 DSH_HOME（fnd002/fnd001）下无 `knowledgeos.sqlite*`。
- **T03**：从 `lib/storage.js` 提取规范 v1 SQL 字节**独立重算** SHA-256=033dcf95…（=账本=candidate.md）；
  `pragma table_info` 字段/PK/NOT NULL 与契约一致（STRICT）；`idempotency_key` 由真实 UNIQUE 索引覆盖；
  两次启动日志 PRAGMA 实际值一致；`sqlite_master` 用户对象恰两表；外键用独立连接真实拒绝；
  两次独立初始化 DDL 文本相同。
- **T05**：总 3 行、无重复键；并发内容 2 行分属 2 键；唯一索引覆盖 `idempotency_key`；状态 [200,201]。
- **T07**：库保留 2 行；日志顺序 `opened,closed,opened`，close 恰 1 次、无 close failed。
- **T08**：库中 3 行；SQL 片段逐值保存；digest=内容 SHA-256；表结构未变；14 用例齐全。
- **T02/T04/T06** 侧证：T02 仅 baseline+after；T04 五类 fixture 均在；T06 锁前后两行仍持久化。
- **T09 静态**：candidate.md 的 11 哈希；profile 链接与加载产物匹配；浏览器回归 PASS（failures=0、
  not_run=0、6 张截图）；旧 home 无业务库。

### 5.2 独立真实 Host/HTTP（boundary，59/59 PASS，exit 0）

全新 dataDir 上自行启停隔离 Host（3100，不触碰桌面进程）：

- 有效 Cookie POST 201；独立只读连接立刻看到该行（真实 SQLite，非内存/JSON/KV）。
- 匿名 GET/POST **401**、坏 Cookie **401**；有效 Cookie+外站 Origin/`Origin:null`/cross-site **403**，
  前后库计数不变；合法 CLI（无 Origin）**201**。
- 同键同内容 201→200 同 id/created_at；同键不同内容 **409**（retryable=false）旧行未被覆盖。
- **双独立进程**（`post-once.mjs`，PIDs 30328/55332）同键并发：**200+201**、恰 1 行、两响应同 id/created_at。
- 错误体 404/400 恰 5 字段、无路径/SQL/堆栈/Cookie；成功正文恰 `data+meta` 冻结子键。
- 补充输入边界（冻结脚本未覆盖，独立补齐）：缺 Content-Type 415；非法 UTF-8 400；1B 201；4096B 201；
  4096B emoji 201；4100B emoji 422；chunked >16384B 413；查询参数注入无效（201，不 500）；
  PUT/PATCH 集合 405+`Allow: POST`；DELETE 详情 405+`Allow: GET`；GET 集合 405；GET 不写。
- SQL 片段文本 201、逐字节保存、schema 仍两表。
- **生命周期**：卸载时 `closed` 恰 1 次（`db.close()` 成功后才打印）、无 close failed、1 s 后仍 1 次；
  路由不再返回本 API 信封（GET 404、POST 405，均无 `code`）且未写库；重启用后 opened 第 2 次、
  原记录 200、新写 201、库 2 行。
- **旧 profile（无 dataDir）**：POST/GET 均 **503 STORAGE_UNAVAILABLE**（retryable=false），
  `/knowledgeos/status` 200 且 product=KnowledgeOS，未创建业务库。

### 5.3 库路径/进程真实性

业务库只在 `.cache/knowledgeos-fnd002-data/**`；T01 前后 PID/实例标识变化；端口 3100 使用后无 LISTENING，
3099 无连接。

### 5.4 构建可复现（T09 补充）

把候选 `src/package.json/build.mjs/tsconfig.json` 复制到隔离临时目录（node_modules junction 到候选包依赖），
执行真实 `build.mjs`：`lib/index.js`、`lib/storage.js`、`lib/client.js` 生成 SHA-256 **逐字节等于**
candidate.md（详见 `independent/rebuild-from-source.txt`）。说明 profile 加载产物确由候选源码产生。

---

## 6. 本轮 P2/P3 加固专项验证（相对历史候选 d7a453d）

主管在架构复核后做了最小加固：未知 schema **对象**（视图/触发器）归属拒绝、rollback 失败 fail-closed、
事务探针收尾。独立验证结果：

| 加固点 | 独立验证 | 结果 |
|---|---|---|
| 未知视图归属拒绝 | `view-objects.mjs`：仅含 VIEW 的库（app_id=0/uv=0）→ 拒绝 `STORAGE_INCOMPATIBLE`，库仍只有 `foreign_view`、app_id/uv 未改；合法 v1+额外 VIEW → 同样拒绝且库不变；合法 v1 库仍可开/写/重开；真正空白目录仍正常初始化且用户对象恰两表 | **PASS（11/11）** |
| 历史缺陷对照 | 用 git archive 取出的 d7a453d 冻结 lib（SHA256 43693f03…）打开同一“仅 VIEW”库：`opened=true`，被当作空白库迁移并写入 app_id/uv/两表（见 `runs/d7a453d/independent/view-only-d7a453d.json`） | 证明历史候选确有该缺陷，新候选已修复 |
| rollback fail-closed | T02 真实失败回滚路径 PASS（rolledBack=true、0 部分写入、连接可用）；`#rollback` 返回 bool、失败即抛 STORAGE_UNAVAILABLE 的 fail-closed 分支为代码审查+正常路径验证；**未**独立触发“ROLLBACK 本身失败”（不修改产品无法安全构造） | 正常路径 **PASS**；失败分支 **部分验证（见 §9）** |
| 事务探针收尾 | T02 注入的失败确实发生（primaryCode=19），新加的“未失败则回滚并抛 INTERNAL_ERROR”分支未被触发（属防御分支） | 未触发（预期） |

---

## 7. 缺陷与差异（当前候选）

> 无功能缺陷；以下均为测试脚本/证据质量问题或口径待确认，已逐项给出实际影响。

**D2（轻·证据质量）T05 “并发同键恰 1 行”断言的 actual 取错。**
`run-all.mjs:350` 记录的是**全表**计数（2），断言比较的是按 `concurrentKey` 过滤后的 1。
断言通过但 JSON 的 `actual` 与表达式不对应；我的独立检查确认该键恰 1 行。

**D3（轻·测试严谨性）T09 加载产物哈希断言只判长度。**
`run-all.mjs:517` 仅断言 `hash.length === 64`；不过 JSON 记录的实际哈希与 candidate.md 相同，
且独立 check-db 逐文件比较包内与 profile 加载路径哈希，并在隔离副本重建复现，结论仍成立；建议改为直接比较冻结值。

**D4（中·覆盖缺口，已由独立验收补齐）冻结脚本对测试计划若干子项未覆盖：**
T01 正文无 emoji、未断言 `request_digest`；T03 未独立重算 checksum、未查 `table_info`/UNIQUE/DDL；
T05 并发是同进程两个 fetch（计划 §7 要求两个独立进程），未断言两响应同 id/created_at；
T08 未覆盖非法 UTF-8、缺 Content-Type、1B/4096B 边界、chunked >16KiB、查询参数注入、GET 集合 405、
DELETE/PATCH、成功/错误正文精确字段集；T04A“迁移失败后由 Host 起服务并 503”仅做适配器级注入。
上述缺口我都在 `check-db.mjs`/`boundary.mjs` 中独立实跑补齐，**均 PASS**；但若只提交冻结脚本，证据仍有空白。

**D5（轻·一致性）T04A 错误码与测试计划口径不同（历史遗留，未变）。**
实现把迁移失败映射为 503 `STORAGE_INCOMPATIBLE`（run-all 断言同此），test-plan T04A 写的是
503 `STORAGE_UNAVAILABLE`。两者都是 503/retryable=false/不可写；`DSH_START.md` §5.4 未点名迁移失败，
需主管确认以哪个为准。本次未因此判 FAIL。

**D6（轻·证据字段）`summary.json` 的 `started_at` 为 null。**
`results[0].started` 在 results 元素上不存在；不影响 T01–T09 各自 JSON。

**D7（观察，非缺陷）** T07 卸载后 GET 返回 404（SPA fallback）、POST 返回 405，均非本 API 信封；
close 证据来自 `knowledgeos-storage: closed` 恰一次，符合“不以 404 代替 close”。

历史候选 d7a453d 的额外缺陷（已在 1b99e39 修复并验证）：
**仅含 VIEW 的非空库被当作空白库接管迁移**（违反 §5.3.1“非空未知 schema 均拒绝”），
详见 §6 与 `runs/d7a453d/independent/view-only-d7a453d.json`。

---

## 8. 历史候选 d7a453d 记录（已作废，仅存档）

- 候选 `d7a453d`，证据提交 `8df9d70`；九项运行 15:19:46–15:22:51，运行前与 15:24 两次哈希核对均与
  candidate.md 一致；`run-all` exit 0、T01–T09 全 PASS；独立 check-db 72/72、boundary 59/59、红action通过。
  证据目录：`docs/evidence/FND-002/runs/d7a453d/`（含 `T01–T09.json`、日志、`T09-browser/`、`independent/`）。
- 作废原因：验证结束后（15:26）主管按架构复核做 P2/P3 加固，工作树随之后移；主管确认 d7a453d 作废并以
  `1b99e39`/`df5ec3c` 重新冻结。`runs/d7a453d/independent/candidate-drift.txt` 为当时工作树漂移快照，
  `SUPERSEDED.txt` 说明其历史地位。
- 历史缺陷：view-only 库被接管（本次已用冻结产物复现并留证，见 §6/§7）；该缺陷在 1b99e39 中修复。

---

## 9. 未执行项与限制（NOT_RUN / 不能证明）

| 项 | 状态 | 原因/边界 |
|---|---|---|
| Desktop/Electron 运行时探针 | **NOT_RUN** | 只承诺并实测固定 Node Web Host；桌面 DSH 未被打扰，不能把 Node 结果改写成 Electron 已验证 |
| Windows 安装/升级/卸载 | **NOT_RUN** | 后续单元，本候选无安装包 |
| Host 级迁移失败（T04A 的 Host 路径） | **NOT_RUN** | 迁移故障仅测试适配器注入；HTTP 不暴露迁移版本/故障开关（设计如此） |
| rollback 自身失败（fail-closed 失败分支） | 部分验证 | 正常回滚路径 PASS；不修改产品无法安全构造 ROLLBACK 失败，失败分支仅代码审查 |
| 突然断电/COMMIT 瞬间崩溃零丢失 | 不能证明 | 仅正常重启 + WAL/synchronous=FULL 证据 |
| OS 级 fd 泄漏 | 不能证明 | 仅驱动 close 日志与重开证据 |
| 多人账号/ACL、跨主机并发、正式业务语义 | 不在本轮范围 | FND-003+ |

---

## 10. 脱敏与产物卫生

- `redact-runs.mjs` 对 `runs/1b99e39`：发现 14 个明文机密（entry URL token、T09 summary 的 dsh-auth cookie 名）
  并全部替换为 `<redacted>`（15 个文件各 1 处）；复扫 `secrets_found_before=0`、`remaining_raw_secrets=[]`、
  未脱敏 `token=`/`dsh-auth` 均为 0、`db_or_cookie_like_files=[]`、`sqlite_header_files=[]` → **PASS**
  （`independent/redaction-report.json`）。历史 `runs/d7a453d` 已在此前完成同样脱敏。
- runs 目录中无 `.sqlite/.db/-wal/-shm/.journal`、无带 SQLite 魔数文件；数据库均在 `.cache/**`；
  17 个 JSON 证据全部可解析。
- 桌面 DSH PID 51900 启动时间仍为 10:36:09，GUI 62739 仍由 PID 57664（10:36:13）监听；3100/3099 无 LISTENING。
- 本角色仅写 `docs/evidence/FND-002/runs/d7a453d/**`、`docs/evidence/FND-002/runs/1b99e39/**`、
  `docs/evidence/FND-002/independent-verification.md`；未改任何产品代码/测试/配置/状态。

---

## 11. 复验命令（隔离环境）

```powershell
$repo = "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
cd $repo
# 0) 候选冻结核对（应无输出/与下表一致）
git rev-parse HEAD                     # 期望 df5ec3c52093616b85370d68e42b7d2b36982490
git status --porcelain                 # 期望仅本角色未跟踪证据
git diff 1b99e39..df5ec3c -- packages scripts   # 期望为空

# 1) 静态门槛
node scripts/verify-plan.mjs
node scripts/fnd002/scope-check.mjs
cd packages\knowledgeos-panel; node node_modules/typescript/bin/tsc -p tsconfig.json; cd ..\..

# 2) 主证据（自行启停隔离 Host，端口 3100；不触碰桌面 DSH）
$env:DSH_HOME = "$repo\.cache\dsh-home-fnd002"
node scripts/fnd002/run-all.mjs --out "docs\evidence\FND-002\runs\1b99e39" --run-id 1b99e39 --candidate 1b99e39

# 3) 独立复核（只读 SQLite / 真实 HTTP / 加固专项 / 脱敏）
node docs\evidence\FND-002\runs\1b99e39\independent\check-db.mjs 1b99e39
node docs\evidence\FND-002\runs\1b99e39\independent\boundary.mjs
node docs\evidence\FND-002\runs\1b99e39\independent\view-objects.mjs
node docs\evidence\FND-002\runs\1b99e39\independent\redact-runs.mjs
```

---

## 12. 最终判定

- **当前候选 `1b99e39`：PASS。** T01–T09 九项全部通过；独立只读 SQLite（73 项）、独立真实 HTTP/生命周期
  （59 项）、P2/P3 加固专项（11 项）、构建可复现、脱敏与产物卫生均通过；未发现功能缺陷。
- 相对历史候选 `d7a453d`：新增的“未知 schema 对象归属拒绝 / rollback fail-closed / 事务探针收尾”经独立验证有效，
  且未造成过度拒绝（合法库、空白库行为不变）。
- 剩余问题仅为测试脚本/证据质量问题（D2–D6，见 §7）与计划口径待确认项（D5），不影响本候选的 PASS 判定；
  建议后续脚本修订时一并处理。
- 独立验收完成，可以进入主管收口流程（更新 work_units/execution_state 等由主管执行）。
