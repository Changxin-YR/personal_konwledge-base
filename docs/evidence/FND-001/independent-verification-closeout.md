# FND-001 独立测试与验收报告（收尾轮，R1–R4）

> 本文件由独立测试与验收角色在固定候选上实际运行后写入。所有结论绑定候选、命令、退出码与证据路径；未执行项不计 PASS，夹具与真实链路分开。测试者未修改产品、测试脚本、配置或状态文件；唯一写入范围为 `docs/evidence/FND-001/runs/2774b18/**` 与本文件。

- 日期：2026-11-16（Asia/Shanghai）
- 产品候选：`2774b185ab75bfe38b6a36a07aa735d5ed4f559b`
- 测试脚本候选：`c2a6d4335a3947546815543cdc17ef992c8d74ae`（closeout harness v4，`scripts/fnd001/closeout-e2e.mjs` = `31c27235…`）
- 文档/证据提交：`2e546968…`，随后 `f25726fc7e4314ac6b385bc7976c0014203a28f6`（只补 `architecture-review-closeout.md` 末尾换行）
- 验收时工作树 HEAD：`f25726fc7e4314ac6b385bc7976c0014203a28f6`；工作树另有主管未提交的 `REPORT.md` 修订（本轮并行更新），以及本轮 `runs/2774b18/` 与本报告未跟踪证据
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738` / `0.2.2-rc.3`
- 运行时：`.cache\build\dsh-39163dd`；隔离 home `.cache\dsh-home-fnd001`；profile `knowledgeos-test`；端口 `127.0.0.1:3099`
- 桌面 DSH：PID `51900`（启动时间 `2026-11-16T10:36:09.525+08:00`）与 GUI 端口 `62739`（监听进程 PID `57664`，启动时间 `10:36:13.083`）全程未停止、未重启、未安装插件；启动时间前后一致
- 浏览器：系统 Chrome（Playwright `.cache\panel-builder\node_modules\playwright`），非 Electron、非独立假页面

## 0. 结论摘要

| 项 | 结论 | 说明 |
|---|---|---|
| R1 生命周期 | **PASS** | 5 次重载、10 次进出、每次 1 请求、60 秒 0 请求/0 pageerror、真实 CLI remove/reinstall、卸载后路由 404 且 Host/认证有效、入口/面板消失、重装后各 1；定时器运行期计数为 NOT_RUN 局限 |
| R2 刷新状态 | **PASS** | 受控 F2 延迟下 loading 显示“刷新中/正在刷新·显示上次结果”，无“失败”；随后取得更新成功；真实断连/恢复由 browser-e2e 复测 |
| R3 PowerShell 变量 | **PASS** | 全新 Windows PowerShell 进程：`$HOME` 前后不变，`DSH_HOME` 指向隔离目录，`$home` 赋值被只读拒绝；本机无 PowerShell 7，已如实记录 |
| R4 启动说明 | **PASS** | candidate/README/REPORT 三处运行命令与 `summary.r4.launch_argv` 一致；无 `web` 位置参数；初始化命令仅首次使用并已注明；独立真实启动 argv 复核通过 |
| T01–T07 | **PASS（含 2 项 NOT_RUN 局限）** | 逐项映射见 §8；T04 运行期定时器计数、T06 上游 build:artifacts 重跑为 NOT_RUN（计划允许的局限/历史复用），未计入相应子项 |
| 最终 | **PASS（产品 2774b18）** | 未发现未修复的产品缺陷；测试脚本/文档缺陷分别由 `c2a6d43`、`2e54696`、`f25726f` 修复并复验 |

## 1. 候选与范围核对

### 1.1 提交与差异

| 检查 | 结果 | 证据 |
|---|---|---|
| `git rev-parse HEAD`（开始） | `e970f603…` | `runs/2774b18/_preflight/baseline.json` |
| `git rev-parse HEAD`（最终） | `f25726fc…` | `runs/2774b18/final-checks/git-head.txt` |
| `git diff 2774b18..e970f60 -- packages scripts` | 空（证据提交只改 candidate.md） | `runs/2774b18/final-checks/preflight-diff.txt` |
| `git diff 2774b18..f25726f --name-only -- packages` | 仅 `packages/knowledgeos-panel/README.md` | `runs/2774b18/final-checks/preflight-diff.txt`、`packages-diff-names.txt` |
| 产品 lib/src/package.json/build.mjs/cordis.patch.yml 在 `2774b18..f25726f` 的差异 | 0 行 | `runs/2774b18/final-checks/product-diff-stat.txt`、`preflight-diff.txt` |
| `git diff c2a6d43..f25726f -- packages scripts` | 0 行（只改 docs） | `runs/2774b18/final-checks/preflight-diff.txt` |

### 1.2 四个 SHA256（按 candidate.md）

| 文件 | 实测 SHA256 | candidate.md | 结果 |
|---|---|---|---|
| `packages/knowledgeos-panel/lib/index.js` | `22757b15ec4352d9a26d848320dc31b3a96aba86446fb70fa51fc94ce2d26c6a` | 同 | 一致 |
| `packages/knowledgeos-panel/lib/client.js` | `f0eb568f9021f4ad4dbbd85ebb6683ea0245d44c449d4b938738caacdf9974d9` | 同 | 一致 |
| `packages/knowledgeos-panel/src/client/Panel.tsx` | `e3aee6dd8c8e6ccc1b2e55a37020cfda5296446f496651d36b848855adc0ef13` | 同 | 一致 |
| `scripts/fnd001/closeout-e2e.mjs` | `31c272358bef58e03100767e5bd6336441db3d643d2bb7717e65b0faa2fc4f67` | 同 | 一致 |

证据：`runs/2774b18/final-checks/candidate-hashes.txt`。

> 说明：`candidate.md` 在 `f3aa05f` 时仍写旧 closeout 哈希（`1e0d6bd…`），已在 `2e54696` 同步为 `31c27235…`；最终 `f25726f` 无脚本/产品变化。

### 1.3 固定源码树

独立运行 `node scripts/fnd001/source-tree-hash.mjs`：

```json
{"result":"PASS","upstream_files":13912,"build_files":13912,
 "upstream_tree":"2a2a46c81b8fb33643aff308efc5ebdd34ecdf0c813ef8fcb2237c270398abbd",
 "build_tree":"2a2a46c81b8fb33643aff308efc5ebdd34ecdf0c813ef8fcb2237c270398abbd"}
```

证据：`runs/2774b18/final-checks/source-tree-hash.log`。固定源码构建与锁定上游逐文件一致（排除 `node_modules/lib/dist/.dsh-build/.git/coverage`）。

### 1.4 计划与范围检查

| 命令 | 最终 HEAD `f25726f` | 证据 |
|---|---|---|
| `node scripts/verify-plan.mjs` | **exit 0 / PASS**（44 需求、66 验收场景、32 markdown，含本报告） | `runs/2774b18/final-checks/verify-plan-final3.log`、`.exit.txt` |
| `node scripts/fnd001/scope-check.mjs .` | **exit 0 / PASS**（11 包文件、7 脚本，无越界） | `runs/2774b18/final-checks/scope-check-final3.log`、`.exit.txt` |

> 复验过程：本轮开始时在 `e970f60` 上两命令运行时均为 exit 0（当时输出；正式归档以最终 HEAD 为准）；在 `2e54696` 上 `verify-plan` 曾因 `architecture-review-closeout.md` 末尾缺换行 exit 1（见 §9-D2）；`f25726f` 修复后复跑 exit 0；加入本报告后再跑仍 exit 0（32 markdown）。

## 2. 执行总览

| # | 测试 | 命令/操作 | 退出码 | 结果 | 证据目录 |
|---|---|---|---|---|---|
| 1 | 候选/范围预检 | `git`、4×SHA256、verify-plan、scope-check、source-tree-hash | 0 | PASS | `runs/2774b18/_preflight/`、`final-checks/` |
| 2 | R2 真实断连回归 | `node scripts/fnd001/browser-e2e.mjs … --out runs/2774b18/browser-v3` | 0 | 18/18 PASS | `runs/2774b18/browser-v3/` |
| 3 | R1/R2 主证据 | `node scripts/fnd001/closeout-e2e.mjs … --plugin "packages\knowledgeos-panel" --out runs/2774b18/closeout-v3` | 0 | 23/23 PASS | `runs/2774b18/closeout-v3/` |
| 3b | 冻结 v2 脚本交叉复跑 | `closeout-e2e.mjs`（`e970f60`，SHA256 `1e0d6bd…`，副本哈希已复核） | 0 | 20/20 PASS | `runs/2774b18/closeout/`、`tools/closeout-e2e.e970f60.mjs` |
| 4 | Host 契约 | `node scripts/fnd001/host-contract-run.mjs … --out runs/2774b18/host-contract` | 0 | PASS（同实例/重启两模式） | `runs/2774b18/host-contract/` |
| 5 | R3 变量复验 | 全新 `powershell.exe -NoProfile -File R3-home-variable-check.ps1` | 0 | PASS | `runs/2774b18/R3/` |
| 6 | R4 命令一致性 | `R4-doc-check.json` | 0 | PASS | `runs/2774b18/R4-doc-check/` |
| 6b | R4 独立真实启动 | `R4-launch.ps1`（文档命令启动一次，CIM 记录 argv） | 0 | PASS | `runs/2774b18/R4-launch/` |
| 7 | 卸载认证有效性 | 独立 `remove-auth-probe.mjs`（真实 remove/reinstall + 会话对照） | 0 | 13/13 PASS | `runs/2774b18/remove-auth-probe/` |
| 8 | 脱敏/环境 | `redact-scan.mjs`、PID/端口核对 | 0 | CLEAN / PASS | `runs/2774b18/redaction-*.json`、`final-environment.json` |

首次 `browser-e2e`（`e970f60` 脚本）同样 18/18 PASS，保存在 `runs/2774b18/browser/`；`browser-v3` 使用当前树脚本（仅 `host.log` 写入时脱敏差异），结果一致。

## 3. R1：真实卸载、恢复与生命周期

### 3.1 5 次重载 / 10 次进出 / 单请求

`closeout-v3` summary 实测（`runs/2774b18/closeout-v3/summary.json`）：

- 5 次整页重载：每次入口 `entries=1`、面板 `panels=1`。
- 10 次“切到插件 → 返回知识库”：每次入口 1、面板 1；每轮新增 `/knowledgeos/status` 请求恰为 1（10 轮全为 `requests=1`）。
- 无重复入口、无叠层面板。

### 3.2 60 秒静默

- 离开面板后真实等待 60 秒：`requests=0`、`pageErrors=0`（`r1.idle={"seconds":60,"requests":0,"pageErrors":0}`）。
- 触发时间窗由 `Date.now()` 与 Playwright `request`/`pageerror` 计数，不是短窗口外推。

### 3.3 定时器基线（NOT_RUN，局限）

- 本轮未用 `addInitScript` 包裹 `setInterval/clearInterval` 做运行期定时器计数，故 **T04-D4 运行期计数为 NOT_RUN**，不伪造为 PASS。
- 可替代的代码级检查：`Panel.tsx` 的 `useEffect` 返回 `activeController.current?.abort()` 清理；客户端无轮询定时器；`status-client.ts` 的请求超时 `setTimeout` 在 `finally` 中 `clearTimeout`，`abort` 监听为 `{ once: true }`。这只证明可观测的请求/错误与静态清理，不替代运行期定时器归因。
- 60 秒 0 请求、0 pageerror 已实测。

### 3.4 真实 CLI 卸载与 Host 状态

- 命令：`node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-test remove knowledgeos-panel`（固定源码 CLI），`exit 0`。
- profile 结果：依赖移除；bundles 变为 `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]`（无 `knowledgeos-panel`）。
- 按真实规则重启测试 Host 后：
  - `/knowledgeos/status` 返回 **404**，`content-type=null`，无 KnowledgeOS JSON 内容。
  - 关键反证（`remove-auth-probe`）：重启后新入口 URL 换取的 cookie 在仍存在的 `/` 上返回 **200**，匿名 `/` 返回 **401**；说明 Host 可达且会话有效，404 不是“服务器未启动/端口不可达/Cookie 失效”被误判为卸载成功。
- DOM：入口 `entries=0`、面板 `panels=0`；DSH 既有导航按钮 `navButtons=4` 仍渲染；页面截图与 HTML 已保存（`R1-after-remove.png/.html`）。

### 3.5 重装同一候选

- 命令：`node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-test add "packages\knowledgeos-panel"`，`exit 0`。
- profile 依赖：`link:C:/…/personal_konwledge-base/packages/knowledgeos-panel`；bundles 恢复含 `knowledgeos-panel`。
- 同一候选证明：
  - 卸载前 `lib/index.js=22757b15…`、`lib/client.js=f0eb568f…`；
  - 重装后两文件哈希完全相同，均等于产品候选 `2774b18`；
  - 安装记录为仓库 checkout 的 `link:`，不是别的 tarball/ASAR。
- 重装后：入口 1、面板 1、`data-state=ready`；`/knowledgeos/status` 200；面板显示 `0.2.2-rc.3`、`39163dd30f70`、新实例与时间。

### 3.6 R1 结论

**PASS**，证据：`runs/2774b18/closeout-v3/`（主）、`runs/2774b18/closeout/`（v2 交叉复跑）、`runs/2774b18/remove-auth-probe/`（认证有效性反证）。定时器运行期计数为 NOT_RUN 局限。

## 4. R2：正常刷新不能显示“连接失败”

### 4.1 行为断言（受控 F2 延迟）

`closeout-v3` 在 R2 前登记 `FIXTURE F2: controlled-3s-status-delay`，仅延迟一次 `/knowledgeos/status` 响应 3 秒；随后：

- loading 期间：`status` chip = **“刷新中”**；`kos-connection` = **“正在刷新 · 显示上次结果”**（不含“失败”）；`kos-refreshing` 可见。
- loading 期间仍显示上次成功数据，但明确标注为上次结果，不冒充当前连接。
- 延迟结束后进入 ready，`checked_at` 严格变新（`05:22:35.749Z → 05:22:38.848Z`）；该次刷新只发 1 个状态请求。
- 结果：`summary.r2` 全部断言 PASS，`summary.fixtures` 明确标 F2。

### 4.2 真实断连/恢复（非夹具）

`browser-v3` 18/18 PASS，其中：

- 真实杀掉测试 Host → 页面刷新出现错误与 `kos-stale`，旧版本数据保留并标“已失去实时性”；
- 断连中点击面板自身重试仍失败；
- 同一候选重启 Host 后重试恢复 ready，`host_instance_id` 变化（`5f08247c… → b5172045…`）；
- 另外的 HTTP 500 为 `FIXTURE F1: route-interception-500`，明确标注，不计入真实断连结论。

### 4.3 产品变更审查（R2 修复是否越界/伪造成功）

`git diff 37ac57a..2774b18 -- packages` 仅涉及：

- `packages/knowledgeos-panel/src/client/Panel.tsx`（`+19/−2`）
- `packages/knowledgeos-panel/lib/client.js`（重建产物，`+6/−2`）
- `packages/knowledgeos-panel/README.md`（运行说明）
- Host 半、`src/client/index.ts`、`status-client.ts`、`contracts.ts`、`icon.tsx`、`package.json`、`build.mjs`、`cordis.patch.yml` 均 0 差异。

Panel 变更只增加/调整展示分支：

- `chipText`：loading 且有旧数据时为“刷新中”，无数据时为“连接中”；error/ready 语义不变。
- `connectionText`：loading+旧数据为“正在刷新 · 显示上次结果”；loading 无数据为“正在连接”；error+旧数据仍为“旧数据（连接失败）”。
- 新增 `kos-refreshing` 提示行。
- 未改 `refresh()`、`loadStatus()`、请求路径、状态机或数据校验。

不存在乐观伪造成功：`ready` 只在 `loadStatus(...).then` 成功后写入；失败只在 `.catch` 写入 error 并保留旧数据；loading 不会被标记为 ready。结论：修复范围最小，仅影响 loading/ready/error 展示，未越界、未伪造成功。

## 5. R3：PowerShell 复验变量

- 本机未安装 PowerShell 7（`pwsh` 不在 PATH，`C:\Program Files\PowerShell\7\pwsh.exe` 不存在），因此“全新 pwsh”按“全新 PowerShell 进程”执行：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File R3-home-variable-check.ps1`，Windows PowerShell `5.1.26100.9818`，退出码 0。
- 实测：
  - `$HOME` 前/后均为 `C:\Users\27363`，`home_unchanged=true`；变量选项 `ReadOnly, AllScope`。
  - `$home` 与 `$HOME` 为同一自动变量（大小写不敏感），`$home` 赋值负例返回 `Cannot overwrite variable HOME because it is read-only or constant.`
  - `$env:DSH_HOME` = `C:\Users\27363\Desktop\personal base\personal_konwledge-base\.cache\dsh-home-fnd001`，等于 `$dshTestHome`，位于仓库下且存在。
  - 候选/README 可复制命令使用 `$dshTestHome`，无 `$home` 赋值。
- 证据：`runs/2774b18/R3/R3-output.json`、`R3-readonly-assignment.txt`、`command.txt`、`pwsh-availability.txt`。

**PASS**（附“无 pwsh 7”环境局限）。

## 6. R4：统一固定源码启动说明

### 6.1 文档与 summary 一致性

独立解析三份文档中的启动行（`R4-doc-check.json`；REPORT 的收尾修订版由主管在本轮并行更新，启动命令仍是同一行，检查记录其采样行号）：

| 来源 | 启动命令 | 与 `summary.r4.launch_argv` |
|---|---|---|
| `candidate.md:67` | `node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open` | 一致 |
| `packages/knowledgeos-panel/README.md:77` | 同上 | 一致 |
| `REPORT.md`（收尾修订版启动命令段） | 同上 | 一致 |

- `summary.r4.launch_argv = ["--import","tsx/esm","apps/cli/src/bin.ts","--profile","knowledgeos-test","--port","3099","--no-open"]`，`contains_web_positional=false`，`init_used_in_this_run=false`，`cli_version_exit=0`，`cli_version=0.2.2-rc.3`。
- 三处启动行均不含 `web` 位置参数，均不含 `--from-default-profile`。
- 初始化命令 `--from-default-profile web --dump-config` 仅出现在 README，且紧邻注释“First creation only / Do not repeat”；candidate.md 亦注明仅首次创建 profile 使用，继续复验不得重复。REPORT 不含初始化参数。
- 结论：`--from-default-profile web` 未在运行命令中使用。

### 6.2 独立真实启动一次

按文档命令在隔离环境真实启动一次（`R4-launch.json`）：

- 实际进程命令行：`node.exe --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open`；`actual_argv_contains_web_positional=false`，`actual_argv_contains_init_flag=false`。
- 入口：`http://127.0.0.1:3099/?token=<redacted>`（token 已脱敏）。
- CLI 版本：`node --import tsx/esm apps/cli/src/bin.ts -V` → `status=0`，`stdout=0.2.2-rc.3`，`stderr=""`。
- 入口 303 换取 cookie 后 `/knowledgeos/status` 返回 **200**，JSON 含固定提交与 `product=KnowledgeOS`。
- 启动后由探针停止该隔离 Host，3099 监听数回到 0。

**PASS**。

## 7. 脱敏、环境与桌面保护

- 脱敏工具：`runs/2774b18/tools/redact-scan.mjs`；匹配长 token 与 `dsh-auth-…` 材料，替换为 `<redacted>`。
- 处理：`R4-launch/host.stdout.log` 中 1 处原始启动 token → 已替换；其余日志/摘要读取时已脱敏。
- 最终扫描：`files_scanned_total` 覆盖全部证据文件，`files_scanned=0`（无命中）、`remaining=[]`、`result=CLEAN`，exit 0。
- 证据：`redaction-scan-before.json`、`redaction-apply.json`、`redaction-scan-after.json`、`redaction-scan-final.json`、`redaction-scan-final4.json`。
- 桌面保护：
  - PID `51900` 启动时间 `2026-11-16T10:36:09.5251834+08:00`，前后一致；
  - GUI 端口 `62739` 监听 PID `57664`，启动时间 `10:36:13.0828573+08:00`，前后一致；
  - 未对桌面 profile 执行 remove/add，未重启、未停止。
- 测试端口 3099：最终无监听连接（`port_3099_listening=0`，非 TIME_WAIT 计数 0）。
- 证据：`runs/2774b18/final-checks/final-environment.json`、`_preflight/baseline-readable.txt`。

## 8. T01–T07 映射

| ID | 结果 | 本轮独立依据 | 证据 |
|---|---|---|---|
| T01 固定 DSH 真实加载 Host 与 Client | **PASS** | 运行时为 `.cache\build\dsh-39163dd`；源码树 13912 文件与上游锁定树摘要一致；页面 origin `127.0.0.1:3099`；面板显示 `0.2.2-rc.3` / 提交前缀 `39163dd30f70`；侧栏入口 DOM=1；截图非空 | `final-checks/source-tree-hash.log`、`browser-v3/01–03*.png`、`browser-v3/summary.json` |
| T02 页面到 Host 真实只读往返 | **PASS** | `host-contract`：同实例两次 200、`host_instance_id`/`started_at` 不变、`checked_at` 前进；重启后实例变化、`started_at` 变晚；页面刷新 `checked_at` 变新；前端无硬编码成功 | `host-contract/`、`browser-v3/summary.json`、`status-*.json` |
| T03 失败与重试 | **PASS** | 真实断连：错误 + “旧数据已失去实时性”；断连中重试仍失败；同候选重启后重试恢复；F1 500 为夹具并明确标注 | `browser-v3/04–06*.png`、`summary.json`（fixtures） |
| T04 面板和插件生命周期 | **PASS** | 5 次重载、10 次进出、入口/面板恒 1、每次刷新 1 请求、60 秒 0 请求/0 pageerror；真实 CLI remove 后 404 + 认证有效性反证 + 入口/面板消失；reinstall 后各 1；无重复注册异常。运行期定时器计数 NOT_RUN（局限） | `closeout-v3/`、`remove-auth-probe/`、`browser-v3/summary.json` |
| T05 最小回归与范围 | **PASS** | 浏览器回归：既有“插件/自动化任务/更多”页面均可打开（文本长度 107/109/215）；只有一个新面板；`scope-check` exit 0；`verify-plan` 最终 HEAD exit 0；无 DB/登录/模型/RAG/导入 | `browser-v3/summary.json`、`final-checks/scope-check-final3.log`、`verify-plan-final3.log` |
| T06 构建与类型 | **PASS（限定）** | 插件 `tsc -p tsconfig.json`（`noEmit`）exit 0；加载产物 `lib/index.js`/`lib/client.js` 哈希与候选一致，并在重装前后一致；上游 `build:artifacts` 本轮未重跑（复用历史构建证据），`build:check` 未运行不阻断 | `final-checks/typecheck.log`、`candidate-hashes.txt`、`build-evidence.md`（历史） |
| T07 状态接口数据边界 | **PASS** | 匿名 401、无效 cookie 401、有效 cookie 200、POST 405（历史契约）；响应恰好 10 字段且 `status=ok`、`upstream_commit_verified=true`；无 token/Cookie/环境变量/绝对路径/会话；仅 loopback；卸载后匿名/有效会话均为 404 且无 KnowledgeOS 载荷 | `host-contract/`、`browser-v3/status-*.json`、`remove-auth-probe/`、`runs/37ac57a/T07/`（历史契约字段） |

## 9. 缺陷、差异与复测

| ID | 类型 | 事实 | 处理/复测 |
|---|---|---|---|
| D1 | 测试脚本（harness v3 `f3aa05f`） | `closeout-e2e.mjs` 在 R2 调用 `summary.fixtures.push`，但 summary 无 `fixtures` 字段 → `TypeError`，exit 1，R1/R2 未执行 | 已由主管在 `c2a6d43` 增加 `fixtures: []`；同一命令在 harness v4 复跑 23/23 PASS。失败目录保留：`runs/2774b18/closeout-v2/` |
| D2 | 文档（证据提交 `2e54696`） | `docs/evidence/FND-001/architecture-review-closeout.md` 末尾缺换行，`node scripts/verify-plan.mjs` exit 1 | 已由主管在 `f25726f` 修复；在 `f25726f` 复跑 verify-plan exit 0。证据：`final-checks/verify-plan.log`（失败）与 `verify-plan-final3.log`（通过） |
| D3 | 文档一致性（`f3aa05f` 时） | `candidate.md` 的 closeout hash 仍为旧值 `1e0d6bd…`，与实际 `31c27235…` 不一致 | 已在 `2e54696` 同步；最终 4 哈希全部一致 |
| D4 | 说明/环境 | 测试计划 §6.4 写“桌面 62739 PID”，实际 62739 是 GUI 端口，监听 PID `57664`；桌面 DSH PID 为 `51900` | 按实际归属核对：两者启动时间前后均未变；未操作桌面实例 |
| D5 | 证据强度（closeout v4） | “removal was verified with a valid authenticated session” 本身只断言 `status !== 401/403`；单看 404 不能排除“Cookie 失效但路由不存在” | 独立 `remove-auth-probe` 增加反证：重启后 `/` 有效 cookie=200、匿名=401，随后 `/knowledgeos/status`=404；重装后 200。结论不受影响 |
| D6 | 证据强度（R4） | `summary.r4.launch_argv` 是脚本内常量，不是从进程捕获 | 独立 `R4-launch` 用 CIM 捕获真实 `CommandLine`，确认无 `web`、无 `--from-default-profile`，CLI `-V` 0.2.2-rc.3 |
| D7 | 环境 | 本机无 PowerShell 7（`pwsh`），无法按字面“全新 pwsh”执行 | 在全新 Windows PowerShell 5.1 进程复验 R3；行为与只读自动变量规则一致，已在报告标注 |
| D8 | 测试者包装脚本（非产品） | 第一版 R4 包装脚本因 `-V` 使用错误工作目录触发 NativeCommandError，且未在异常路径清理测试 Host，曾 exit 1 | 已停止该隔离 Host（3099 释放），改用 Node `spawnSync` 版本并加 `try/finally` 重做；R4 产品结论以重做结果为准 |

未发现产品代码缺陷；`2774b18` 的 R2 修复未引入乐观成功、未改 Host、未越界。

## 10. 实际执行与未执行

### 已实际执行（本轮）

- 候选核对：HEAD、`2774b18..e970f60` 差异为空、4×SHA256、`verify-plan`、`scope-check`、`source-tree-hash`。
- 浏览器：`browser-e2e` 两次（`e970f60` 与当前树），均 exit 0、18/18 PASS。
- 生命周期：`closeout-e2e` v4（`c2a6d43`）exit 0、23/23 PASS；冻结 v2 脚本交叉复跑 exit 0、20/20 PASS。
- Host 契约：`host-contract-run` exit 0；同实例与重启两模式契约校验 exit 0。
- 卸载/重装独立反证：`remove-auth-probe` 13/13 PASS。
- R3 全新 PowerShell 进程；R4 文档一致性与独立真实启动。
- 插件 `tsc` 类型检查 exit 0。
- 脱敏扫描、桌面 PID/端口核对、最终 `verify-plan`/`scope-check`。

### 未执行（不计 PASS）

- T04-D4 运行期定时器注入计数（仅有请求/错误窗口与静态清理检查）——**NOT_RUN（局限）**。
- 上游 `build:artifacts` 本轮重跑、`build:check`、全仓测试——**未执行**；复用历史构建证据，固定源码树已独立核对。
- 逐像素/人工视觉验收、桌面 Electron 冒烟、Windows 安装包、全局定时器归因、真实 GPT 业务调用——**NOT_RUN / 范围外**。
- 未对桌面 profile 或桌面 DSH 做任何安装/卸载/重启。

## 11. 最终判定

- **产品候选 `2774b18`：R1–R4 全部 PASS**（在独立执行的证据范围内）。
- **T01–T07：均具备 PASS 依据**；T04 的运行期定时器计数、T06 的上游 `build:artifacts` 重跑为明确 NOT_RUN/历史复用，未计入相应子项。
- **当前工作树 `f25726f`：预检 PASS**（4 哈希一致、verify-plan exit 0、scope-check exit 0、产品差异仅 README）。
- **最终：PASS**。无未修复的产品缺陷；测试脚本与文档缺陷 D1/D2/D3 已分别由 `c2a6d43`、`f25726f`、`2e54696` 修复并复验。
- 本结论不把 FND-001 通过升级为 F01/F04/A01/A50 的完整需求或完整场景通过；Codex 全面审查仍 locked。

## 12. 复验入口

```powershell
cd "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
node scripts/verify-plan.mjs
node scripts/fnd001/scope-check.mjs .
node scripts/fnd001/source-tree-hash.mjs
node scripts/fnd001/host-contract-run.mjs --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --out "docs\evidence\FND-001\runs\2774b18\host-contract"
node scripts/fnd001/browser-e2e.mjs --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --playwright ".cache\panel-builder\node_modules\playwright" --out "docs\evidence\FND-001\runs\2774b18\browser-v3"
node scripts/fnd001/closeout-e2e.mjs --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --playwright ".cache\panel-builder\node_modules\playwright" --plugin "packages\knowledgeos-panel" --out "docs\evidence\FND-001\runs\2774b18\closeout-v3"
node "docs\evidence\FND-001\runs\2774b18\tools\remove-auth-probe.mjs" --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --plugin "packages\knowledgeos-panel" --out "docs\evidence\FND-001\runs\2774b18\remove-auth-probe"
```

证据根目录：[`runs/2774b18/`](runs/2774b18/)；机器可读汇总：[`summary-extract.json`](runs/2774b18/summary-extract.json)；脱敏状态：[`redaction-scan-final.json`](runs/2774b18/redaction-scan-final.json)。
