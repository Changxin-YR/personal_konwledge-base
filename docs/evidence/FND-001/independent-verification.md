# FND-001 独立测试与验收报告

| 项目 | 值 |
|---|---|
| `unit_id` | FND-001 |
| `instruction_revision` | 2.0.0 |
| `role` / `executor` | independent-tester / independent-tester（`self_test=false`） |
| 产品候选 | `37ac57af64b6741d82ffa2663b43dc244529c567`，树 `899a018f7bb87af83603a877e8a810dedbeb7bb5` |
| 证据脚本版本 | harness v2：`22e7be2ffc1b1db6fe8247bb223e69ec6c7ecb5d`（仅测试/证据文件；产品目录 diff 为空） |
| 固定上游 | `39163dd30f703a79079e2d2446545cff3c453738` / `0.2.2-rc.3` |
| 证据根目录 | `docs/evidence/FND-001/runs/37ac57a/` |
| 执行时间 | 2026-11-16 11:59–12:27（Asia/Shanghai） |
| 结论摘要 | 产品候选 37ac57a 的 T01–T07 实际断言 **PASS**；冻结在 37ac57a 内的 v1 `browser-e2e.mjs` 存在测试脚本缺陷 G1（已由 22e7be2 修复并复测 PASS）。 |

> 本报告只依据我在冻结候选及修复后测试脚本上的实际运行。主管自测、静态文案、截图存在本身均未作为通过依据。所有证据路径相对于仓库根 `C:\Users\27363\Desktop\personal base\personal_konwledge-base`。

---

## 1. 候选核对

### 1.1 提交、树与工作树

| 检查 | 实际结果 | 证据 |
|---|---|---|
| 开始运行时 `git rev-parse HEAD` | `37ac57af64b6741d82ffa2663b43dc244529c567` | `runs/37ac57a/candidate-commit.txt` |
| `git rev-parse HEAD^{tree}` | `899a018f7bb87af83603a877e8a810dedbeb7bb5` | `runs/37ac57a/candidate-tree.txt` |
| 开始时 `git status --short` | `?? docs/evidence/FND-001/candidate.md`；无产品文件修改 | `runs/37ac57a/candidate-dirty.txt` |
| 产品目录 diff `37ac57a..22e7be2` | 空（12 个产品文件均未变） | `git diff --name-status` 实测，见 §1.4 |
| 全部运行结束后工作树 | `?? docs/evidence/FND-001/runs/` 与 `?? docs/evidence/FND-001/independent-verification.md`（本报告）；产品文件仍无修改 | 实测 `git status --short` |

**差异 D1（非产品问题）**：`candidate.md` 声称“工作树：干净（`git status --short` 无输出）”，但该文件自身在开始时是未跟踪文件，因此严格意义上“无输出”不可复现。产品文件与候选提交一致；该差异只影响候选记录的自述，不影响产品哈希。主管随后在 `22e7be2` 提交了 `candidate.md` 与构建证据。

### 1.2 12 个关键文件 SHA256

逐个实测；**12/12 与 `candidate.md` 完全一致**，运行前后一致。

| 文件 | 实测 SHA256（前 16 位） | 与候选记录 |
|---|---|---|
| `packages/knowledgeos-panel/lib/index.js` | `22757b15ec4352d9…` | 一致 |
| `packages/knowledgeos-panel/lib/client.js` | `ff99f29f1415651c…` | 一致 |
| `packages/knowledgeos-panel/package.json` | `edfc8936b9bcabaa…` | 一致 |
| `packages/knowledgeos-panel/cordis.patch.yml` | `2133c93965bc9b5e…` | 一致 |
| `packages/knowledgeos-panel/src/host/index.ts` | `9b09cd6e2b43ed7c…` | 一致 |
| `packages/knowledgeos-panel/src/host/status.ts` | `33e6a9a4b05153e9…` | 一致 |
| `packages/knowledgeos-panel/src/client/index.ts` | `acd8e12c152e561d…` | 一致 |
| `packages/knowledgeos-panel/src/client/Panel.tsx` | `0f615f7298a512b4…` | 一致 |
| `packages/knowledgeos-panel/src/client/status-client.ts` | `2dc80b975edd2291…` | 一致 |
| `packages/knowledgeos-panel/src/client/icon.tsx` | `539022c192d37f40…` | 一致 |
| `packages/knowledgeos-panel/src/client/contracts.ts` | `bb3aae37264d1efa…` | 一致 |
| `packages/knowledgeos-panel/build.mjs` | `a4df7ffa691236cc…` | 一致 |

完整哈希见 `runs/37ac57a/T06/lib-hashes-before.txt`、`runs/37ac57a/T06/lib-hashes-after.txt`、`runs/37ac57a/T06/lib-hashes-v2.txt`。

### 1.3 `verify-plan.mjs`

| 运行 | 命令 | 退出码 | 时间 | 证据 |
|---|---|---|---|---|
| 候选 37ac57a | `node scripts/verify-plan.mjs` | **0** | 11:59:30.417 → 11:59:31.056 | `runs/37ac57a/T05/verify-plan.log`、`.exit.txt` |
| harness v2 | 同上 | **0** | 12:25:55.933 → 12:25:56.375 | `runs/37ac57a/T05/verify-plan-v2.log`、`.exit.txt` |

JSON 输出关键字段：`status=PASS`、`activeUnit=FND-001`、`upstreamCommit=39163dd…`、`productTestsExecuted=0`、`implementationVerifiedByThisCheck=false`。该脚本只证明计划结构/可追溯性，**不证明**产品行为。

写入本报告后再次运行：退出码 **0**，`markdownFiles=28`，`status=PASS`（`T05/verify-plan-final.log`、`T05/verify-plan-final.exit.txt`）。

### 1.4 harness v2 的独立性核对

`git diff --name-status 37ac57a..22e7be2` 实测仅：

```text
A docs/evidence/FND-001/build-evidence.md
A docs/evidence/FND-001/candidate.md
M scripts/fnd001/browser-e2e.mjs
A scripts/fnd001/source-tree-hash.mjs
```

- `git diff 37ac57a..22e7be2 -- packages/knowledgeos-panel` 为空。
- 12 个产品文件 SHA256 在 v2 前后均与 `candidate.md` 一致。
- v2 的 `browser-e2e.mjs` 变更只涉及恢复点击的定位器与 `recoverPanel()`，没有放宽断言或改写产品行为（逐行 diff 已检查，见 `scripts/fnd001/browser-e2e.mjs`）。

因此本报告的通过结论绑定：**产品候选 37ac57a + 测试脚本 22e7be2**；产品没有因修复而改变。

---

## 2. 环境与命令

### 2.1 环境

| 项目 | 值 | 核对方式 |
|---|---|---|
| OS | Windows 11 Pro | 候选记录；本次未另做 OS 版本断言 |
| Node | `v24.22.0` | `node --version` |
| pnpm（运行时自带） | `11.28.5` | `node .cache/build/dsh-39163dd/node_modules/pnpm/bin/pnpm.cjs --version` |
| pnpm（全局） | `11.22.0` | `cmd /c pnpm --version`；本次未用全局 pnpm 执行检查 |
| 固定运行时 | `.cache/build/dsh-39163dd`，版本 `0.2.2-rc.3` | 读取 `package.json`、`source-tree-hash` |
| 上游检出 | `.cache/upstream/deepseek-harness`，HEAD `39163dd30f703a79079e2d2446545cff3c453738` | `git -C … rev-parse HEAD` |
| 源码树一致性 | 13,912 个文件，两树 SHA256 均为 `2a2a46c81b8fb33643aff308efc5ebdd34ecdf0c813ef8fcb2237c270398abbd`，差异 0 | `node scripts/fnd001/source-tree-hash.mjs`，退出码 **0** |
| 独立 `DSH_HOME` | `.cache/dsh-home-fnd001` | profile `knowledgeos-test` |
| 测试端口 | `3099`，仅 loopback | `Get-NetTCPConnection` |
| 浏览器 | Chrome（`channel: 'chrome'`，headless） | `C:\Program Files\Google\Chrome\Application\chrome.exe` 存在 |
| Playwright | `.cache/panel-builder/node_modules/playwright` | 实测可用 |
| 桌面基线 | PID **51900**（DeepSeek Harness），启动时间 `2026-11-16T10:36:09.5251834+08:00` | 运行前后一致 |
| 桌面端口 | `127.0.0.1:62739` 仍在监听（owner PID 57664） | 运行前后一致 |

> 固定事实中的“PID 51900 / 62739”在本机实际为：51900 是桌面进程；62739 是 Web 端口（其 owner 进程是 57664，不是 62739 号进程）。运行前后 PID 51900 的启动时间未变，62739 仍在监听。未停止、重启或向桌面 profile 安装任何插件。

### 2.2 命令、退出码与时间

| # | 命令（均在仓库根执行） | 退出码 | 开始 → 结束 | 证据 |
|---|---|---|---|---|
| 1 | `git rev-parse HEAD` / `HEAD^{tree}` / `git status --short` | 0 | 11:57 前后 | `candidate-commit.txt`、`candidate-tree.txt`、`candidate-dirty.txt` |
| 2 | `node scripts/verify-plan.mjs` | **0** | 11:59:30.417 → 11:59:31.056 | `T05/verify-plan.log` |
| 3 | `node scripts/fnd001/scope-check.mjs .` | **0** | 11:59:35.591 → 11:59:35.669 | `T05/scope-check.log` |
| 4 | `node node_modules/typescript/bin/tsc -p tsconfig.json`（在插件目录） | **0** | 11:59:40.156 → 11:59:40.827 | `T06/typecheck.log` |
| 5 | `node scripts/fnd001/host-contract-run.mjs --dsh-root … --home … --profile knowledgeos-test --port 3099 --out …` | **0** | 11:59:52.976 → 12:00:26.624 | `host-contract/` |
| 6 | `node scripts/fnd001/browser-e2e.mjs … --out …browser`（v1） | **1** | 12:00:42.940 → 12:03:40.188（177.2s） | `browser/`、`browser-e2e.console.log` |
| 7 | 独立复现：`runs/37ac57a/tools/retry-repro.mjs` | **0** | 12:05:00.825 → 12:11:04.277（363.5s） | `repro/` |
| 8 | 独立定位：`runs/37ac57a/tools/locator-probe.mjs` | **0** | 12:14:51.495 → 12:15:40.910（49.4s） | `locator-probe/` |
| 9 | 独立 T07：真实 Host + curl（匿名/无效 Cookie/认证/POST/监听/头部） | **0**（各项检查通过） | 12:16:25.047 → 12:16:43.929 | `T07/` |
| 10 | 手工 T04 禁用/恢复尝试 | 未执行到检查（启动 `EADDRINUSE`） | 12:17 前后 | `T04/host.stderr.log`；**不计入结论** |
| 11 | `node scripts/fnd001/source-tree-hash.mjs` | **0** | 12:20:34.570 → 12:23:45.062 | `T01/source-tree-hash.log` |
| 12 | `node scripts/fnd001/browser-e2e.mjs … --out …browser-rerun`（v2） | **0** | 12:23:49.992 → 12:25:18.704（88.7s） | `browser-rerun/` |
| 13 | `runs/37ac57a/tools/page-value-match.mjs` | **0** | 12:26:13.755 → 12:26:43.773（30s） | `page-match/` |
| 14 | `node scripts/verify-plan.mjs`（v2） | **0** | 12:25:55.933 → 12:25:56.375 | `T05/verify-plan-v2.log` |
| 15 | `node scripts/fnd001/scope-check.mjs .`（v2） | **0** | 12:25:56.390 → 12:25:56.615 | `T05/scope-check-v2.log` |
| 16 | `tsc -p tsconfig.json`（v2） | **0** | 12:27:23.546 → 12:27:25.404 | `T06/typecheck-v2.log` |
| 17 | 脱敏与字节级残留扫描 | **0** | 12:27 前后 | `redaction-report.json`、`redaction-verify.json` |

> 第 10 项的 `EADDRINUSE`：T07 主机停止后端口释放存在短暂竞态，手工 T04 启动失败；该尝试未修改 profile（补丁哈希仍为 `cdc61a0…`），也未产生可用结论。随后 v2 `browser-e2e` 在同一端口完成了禁用/恢复检查，故 T04 以 v2 结果为准。

---

## 3. T01–T07 逐项结论

状态定义：PASS = 真实执行且断言满足；FAIL = 执行后断言不满足；NOT_RUN = 未执行；BLOCKED = 外部条件阻止。每条均注明“不能证明什么”。

### T01 固定 DSH 真实加载 Host 与 Client — **PASS**

**实际观察**

- 运行时版本 `0.2.2-rc.3`；构建目录 `.cache/build/dsh-39163dd` 与锁定上游检出的 13,912 个源文件逐路径、逐字节一致，两树摘要均为 `2a2a46c8…`，退出码 0（12:20:34→12:23:45）。不是 `.cache/runtime-rc3`，不是桌面 ASAR。
- 测试 Host 进程命令行实测为 `node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open`，工作目录为构建根；见 `T07/process.txt`。
- 浏览器页面 origin 为 `http://127.0.0.1:3099`；侧栏“知识库”入口 DOM 计数 = 1；点击后主面板出现（`[data-testid="knowledgeos-panel"][data-state="ready"]`）。v2 summary 首步 `T01 sidebar entry visible {"count":1}` PASS。
- 面板可见标题、连接状态、DSH 版本、上游提交、提交校验、主机实例、实例启动、本次查询，以及“刷新/重新连接”操作；无 token、无调试路径。DOM 截图存在且非空：
  - `browser-rerun/01-panel-ready-1366x768.png`（50,850 B）
  - `browser-rerun/02-panel-ready-1920x1080.png`（55,317 B）
  - `browser-rerun/03-panel-ready-dark.png`（55,506 B）
- 认证响应恰好 10 字段，`schema_version=1`、`product=KnowledgeOS`、`upstream_commit=expected_upstream_commit=39163dd…`、`upstream_version=0.2.2-rc.3`、`upstream_commit_verified=true`、`status=ok`；`status-contract.mjs` 同实例退出码 **0**。
- 页面显示值与真实响应逐字段一致（`page-match/page-value-match.json`，全部 8 项比较为 `true`）：
  - 响应 `host_instance_id=824989dd-592f-4a34-8912-e0eba897e25a` = 页面实例；
  - 响应 `checked_at=2026-11-16T04:26:31.912Z` = 页面 `data-checked-at`；
  - 响应 `upstream_commit` 前 12 位、版本、校验文案、`started_at` 格式化时间均一致；HTTP 200。
- 桌面保护见 §3 末与 `T05/desktop-before.txt`、`T05/desktop-after.txt`。

**证据**：`runs/37ac57a/T01/source-tree-hash.log`、`T01/source-tree-hash.exit.txt`、`T07/process.txt`、`browser-rerun/summary.json`、`browser-rerun/0*.png`、`page-match/page-value-match.json`。

**不能证明**：客户端模块请求字节与 `lib/client.js` 的哈希一致性（未做，NOT_RUN）；桌面 Electron 冒烟（NOT_RUN）；逐像素视觉/字体/颜色目检（无图像输入，NOT_RUN，见 §4）；构建产物是否由 `build:artifacts` 在本次重新生成（T06 限制）。

### T02 页面到 Host 的真实只读往返 — **PASS**

**实际观察**

- 真实 Host 连续两次 1.5s 间隔查询：同一实例 `8078f769-917b-4c8f-abc8-b6d29f87336b`，`started_at` 不变，`checked_at` `04:00:07.733Z → 04:00:09.277Z` 严格前进；`status-contract --mode same-instance` 退出码 **0**（`host-contract/host-contract-summary.json`）。
- 停止并重启同一 Host：实例变为 `338773a5-f9a4-41d5-85da-14d9865e0574`，`started_at` `04:00:05.096Z → 04:00:23.212Z` 变晚，`checked_at >= started_at`；`--mode restart` 退出码 **0**。
- 浏览器内点击“刷新”：页面 `checked_at` 从 `04:24:17.366Z` 变为 `04:24:19.824Z`（v2 summary `T02 refresh fetched newer checked_at` PASS），不是前端本地时间。
- 真实重启后：页面实例 `8e223bde-ef13-4049-bf5b-34c5147f5a04 → f8996b1b-7955-4a51-b308-26df7ef51c33`，v2 summary `T02 host_instance_id changed after real restart` PASS；恢复点击 `attempts=0`。
- 独立 T07 的同实例校验也退出码 **0**（`T07/contract-check.log`，实例 `f3b59324-…`，`checked_at 04:16:37.414Z → 04:16:38.777Z`）。
- 页面与响应逐字段一致：`page-match` 8/8 true，`checked_at` 精确到毫秒相同（`04:26:31.912Z`）。这直接触及用户可见结果，而非仅看日志。

**证据**：`host-contract/status-same-instance-a.json`、`status-same-instance-b.json`、`status-after-restart.json`、`host-contract-summary.json`；`browser-rerun/summary.json`、`status-authenticated.json`、`status-after-restart.json`；`page-match/page-value-match.json`；`T07/auth.body`、`auth2.body`。

**不能证明**：跨机时钟正确性；并发/缓存/超时策略；页面在请求失败时不会保留旧成功（由 T03 覆盖同一候选）。

### T03 失败与重试 — **PASS（产品行为）；v1 测试脚本曾 FAIL（G1，已修复）**

**真实断连（v2，真实停止 3099 进程）**

1. 面板成功态显示版本 `0.2.2-rc.3`；停止测试 Host 后，页面点击“刷新”，出现 `kos-error` 与 `kos-stale`，旧数据被明确标为“已失去实时性”，失败时间可见；v2 步骤 `T03 real disconnect makes the Host unreachable`、`T03 error and stale marker are visible` PASS。
2. 断连期间点击面板“重试”，仍失败，无假成功（`T03 retry while still down stays failed` PASS）。
3. 用相同候选、相同命令重启 Host，认证路由恢复 200（`T03 Host restarted and route is reachable` PASS）；点击面板恢复控件后 `data-state=ready`，`attempts=0`（`T03 retry after recovery reaches ready` PASS），实例变为新值。
4. 真实断连/恢复截图：`browser-rerun/04-panel-real-disconnect.png`（66,722 B）、`05-panel-recovered.png`（52,577 B）。

**F1 夹具（明确标注，不计入真实断连）**

- v2 使用 `page.route('**/knowledgeos/status', …500…)` 注入 500，属**浏览器路由夹具**；`summary.fixtures` 记录 `{"id":"F1","kind":"route-interception-500","label":"FIXTURE: not a real disconnect"}`，截图 `06-panel-fixture-500.png`（66,046 B）。该步骤 PASS，但只证明 UI 错误分支与恢复，不证明真实 500/网络故障。
- 真实断连证据不依赖 F1；F1 只出现在 summary 的 fixture 字段与单独截图中。

**G1：v1 browser-e2e 的失败（详见 §4.1）**

- 原 `browser/` 证据保留：退出码 **1**，最后 PASS 为 `T03 Host restarted and route is reachable`（12:02:38.756），随后等待 `[data-state="ready"]` 超时 60s；失败页 `browser/failure-page.html` 显示面板 `data-state="error"`、失败时间仍为 `12:01:48`（未刷新）。
- 独立定位证明是测试脚本定位器缺陷，不是产品重试缺陷：`locator-probe` 在断连时找到 **3** 个匹配 `/重新连接|重试/` 的按钮，DOM 第一个是 DSH 全局连接指示器（`aria-label="连接中断，正在重试，点击立即重连"`，`insidePanel=false`）；`.first()` 点击它后，面板失败时间不变（`panelRefreshed=false`）。
- 独立 `retry-repro` 直接点击面板 `[data-testid="kos-error-retry"]`：状态 `loading → ready`，实例 `92217637-… → 803c7fd5-…`，真实请求/响应 200；证明产品恢复路径可用。
- v2 已把恢复点击限定为 `[data-testid="kos-error-retry"]` / `[data-testid="kos-refresh"]`，重跑 PASS（`attempts=0`）。

**证据**：`browser/summary.json`、`browser/failure-page.html`、`browser/99-failure.png`；`locator-probe/locator-probe.json`、`locator-probe/after-candidate-locator-click.png`；`repro/retry-repro.json`、`repro/after-retry-panel-retry.png`；`browser-rerun/summary.json`、`04/05/06-*.png`。

**不能证明**：DNS、半开连接、超时、3s 延迟（F3）、畸形 JSON（F2）、404（F4）等夹具分支（F2–F4 NOT_RUN）；自动重试/退避策略；生产网络环境。

### T04 面板和插件生命周期 — **PASS（用户要求的子集）**

**实际观察（v2 summary）**

| 检查 | 实际 | 证据 |
|---|---|---|
| 整页重载后入口数 | 1 | `T04 exactly one entry after reload` PASS |
| 5 次进入/退出后 | 入口 1、面板 1（`entries:1, panels:1`） | `T04 repeated enter/exit has one entry and one panel` PASS |
| 关闭面板 15 秒 | 新 `/knowledgeos/status` 请求 0（`window_ms:15000`） | `T04 no status polling while panel is closed` PASS |
| 禁用 `knowledgeos-host` 行 | 认证路由 `404` | `T04 disabling the Host row removes the route` PASS |
| 恢复该行 | 认证路由 `200` | `T04 re-enabling the Host row restores one route` PASS |

- profile `cordis.patch.yml` 在运行前后 SHA256 均为 `cdc61a089a65c7445ae206ff2686c38cddfa51085da0a7593103b3cd1ee531fb`，大小 343 字节；禁用是测试脚本的临时修改，已恢复。
- 运行中 Host 进程未重启即完成 404/200 切换，说明 profile patch 的加载/恢复在真实 Host 上生效。
- 注：手工 T04 尝试因 `EADDRINUSE` 未执行（§2.2 第 10 项），不计入；v2 已覆盖同一生命周期步骤。

**与计划的覆盖差异**：`test-plan.md` 要求 5 次重载、10 次进入/退出、60 秒静默；本次按用户指令子集实际为 1 次重载、5 次进入/退出、15 秒静默。结论只覆盖实际执行的子集。

**不能证明**：Playwright 注入的定时器/监听器计数回到基线（D4，NOT_RUN）；卸载插件后入口消失/路由 404（D5/D6，NOT_RUN，未执行 `plugin remove`）；长时间运行稳定性；HMR 语义；桌面宿主下的卸载行为。

### T05 最小回归与范围 — **PASS**

**实际观察**

- `verify-plan.mjs`（v2）退出码 **0**；`scope-check.mjs`（v2）退出码 **0**，JSON：`{"result":"PASS","failures":[],"package_files":11,"script_files":6}`。
- 变更范围：从起始提交 `6f23735` 到 `37ac57a` 只新增 `packages/knowledgeos-panel/**`、`scripts/fnd001/**` 与两份证据文档；没有修改 `config/execution_state.json`、`config/upstream.lock.json`、`DSH_START.md` 等执行状态文件（`candidate-files.txt`、`candidate-diff-stat.txt`）。
- 浏览器导航：v2 `T05 existing panels remain navigable` PASS，对侧栏 `插件`、`自动化任务`、`更多` 逐项点击，正文长度 107/109/215（>100），无白屏/错误页。仅在侧栏发现 3 个其他可用标签（本单元不要求六工作区）。
- `PANEL_ID=knowledgeos` 的入口/面板恰好 1 个（T01/T04 计数）。
- `DSH_HOME` 中无 KnowledgeOS 业务数据库/迁移/上传目录：无 `.db/.sqlite/.sqlite3`；只有上游 DSH 自身的 `sessions/<workspace>/session-2041bc2f-….v4.jsonl.zstd`（428 B）与 profile 文件。见 §2 与实测输出。
- 插件源码特征扫描未发现 `sqlite`、`prisma`、`openai`、`anthropic`、`embedding`、`pdf`、`login`、`password` 等越界依赖/功能；`scope-check` 结论一致。
- 产品文件在全部运行后仍与候选 12 哈希一致。

**证据**：`T05/verify-plan-v2.log`、`T05/scope-check-v2.log`、`T05/scope-check-v2.exit.txt`、`candidate-files.txt`、`candidate-diff-stat.txt`、`browser-rerun/summary.json`。

**不能证明**：DSH 全功能回归（模型、文件、终端、插件管理未逐项验证）；六工作区（本单元明确不实现）；Windows 安装包/多用户；完整代码审阅。

### T06 构建与类型 — **PASS（实际执行范围）**

| 检查 | 结果 | 证据 |
|---|---|---|
| `tsc -p tsconfig.json`（候选 37ac57a） | 退出码 **0**（0.67s） | `T06/typecheck.log`、`T06/typecheck.exit.txt` |
| `tsc --listFiles` 覆盖 | 包含全部 8 个 `src/**` 文件（host/index、host/status、client/index、Panel、status-client、icon、contracts、cordis.d.ts），不是空跑 | `T06/tsc-listfiles.log` |
| `tsc -p tsconfig.json`（v2） | 退出码 **0**（1.86s） | `T06/typecheck-v2.log` |
| `lib/index.js` SHA256 | `22757b15…`，与 `candidate.md` 一致 | `T06/lib-hashes-*.txt` |
| `lib/client.js` SHA256 | `ff99f29f…`，与 `candidate.md` 一致 | 同上 |
| `build.mjs` | **未运行**（按指令，避免改写候选产物） | — |
| 上游 `build:artifacts` | **未由本次独立重跑**（NOT_RUN）；`runs/37ac57a/build-artifacts.log` 是主管提供的构建日志（文件创建时间 12:08:42、原日志时间 11:35:13），本报告不把它当成本次执行证据 | `build-artifacts.log` |

**说明**：本次独立验证了“构建目录与锁定源码树一致”（`source-tree-hash`，13,912 文件，摘要相同）和“当前源码通过类型检查/产物哈希匹配”，但没有重新执行上游 `build:artifacts`，也没有执行插件 `build.mjs`。因此 T06 的通过仅覆盖实际执行的类型检查与产物哈希，不覆盖“新鲜构建可复现”。

**不能证明**：全新 `build:artifacts` 能否再次成功；打包/Windows 安装；`build:check`（未运行，非本单元强制）。

### T07 状态接口数据边界 — **PASS**

真实 Host、真实 loopback 请求（`T07/`）：

| 检查 | 实际 | 证据 |
|---|---|---|
| 匿名 `GET /knowledgeos/status` | **401**，响应体 `unauthorized`（12 B） | `T07/unauth.headers`、`unauth.body`、`unauth.code.txt` |
| 无效 Cookie（同 Cookie 名、错误值） | **401**，响应体 `unauthorized` | `T07/invalid-cookie.*` |
| 有效 Cookie | **200**，`content-type: application/json; charset=utf-8` | `T07/auth.headers`、`auth.body`、`auth.code.txt` |
| 第二次有效请求 | **200**；同实例契约检查退出码 **0** | `T07/auth2.body`、`T07/contract-check.log` |
| `POST` | **405**，`allow: GET, HEAD` | `T07/post.headers`、`post.body`、`post.code.txt` |
| 监听地址 | 仅 `127.0.0.1:3099`，无 `0.0.0.0`/`::` | `T07/listen.txt` |
| 响应头 | 无 `access-control-allow-origin: *`；状态路由无 `Set-Cookie`；`cache-control: no-store` | `T07/auth.headers` |
| 字段集合 | 恰好 10 个约定字段，无额外字段 | `T07/auth.body`、`T07/forbidden-scan.log` |
| 禁止内容扫描 | 凭据、环境变量、绝对路径、会话内容、堆栈均未命中；退出码 **0** | `T07/forbidden-scan.log`、`T07/forbidden-scan.exit.txt` |
| 字节级残留扫描 | 99 个证据文件（含 UTF-16 日志），无未脱敏 token/cookie；退出码 **0** | `redaction-verify.json` |

错误响应仅为 `unauthorized`，不含堆栈、路径、内部模块名或状态数据；`POST` 返回 405 且未泄露状态数据。

**不能证明**：TLS、反向代理、公网部署；多人身份/对象授权（本单元未实现）；插件进程内安全隔离；未来路由边界。

### 桌面保护（T01–T07 全程）

- 运行前：PID 51900，启动时间 `2026-11-16T10:36:09.5251834+08:00`；`127.0.0.1:62739` 监听。
- 运行后：PID 51900 仍存在，启动时间**完全相同**；`127.0.0.1:62739` 仍监听。
- 证据：`T05/desktop-before.txt`、`T05/desktop-after.txt`。未停止/重启桌面进程，未向桌面 profile 安装插件。

---

## 4. 独立发现的缺陷、差异与限制

### 4.1 G1（已修复）：v1 browser-e2e 恢复定位器命中 DSH 全局连接指示器

| 项 | 内容 |
|---|---|
| 严重性 | 中（阻断测试门槛，不影响产品功能） |
| 位置 | 候选 `37ac57a` 的 `scripts/fnd001/browser-e2e.mjs` 第 311 行：`page.getByRole('button', { name: /重新连接|重试/ }).first().click()` |
| 预期 | 点击面板的重试/重新连接，使面板从错误态恢复到 ready |
| 实际 | 点击了 DOM 中更靠前的 DSH 全局连接指示器（`aria-label="连接中断，正在重试，点击立即重连"`），面板不刷新；等待 `[data-state="ready"]` 60s 超时，脚本退出 1 |
| 复现步骤 | 启动测试 Host → 打开面板 ready → 真实停止 Host → 点面板刷新得到 error/stale → 重启 Host 并等待路由 200 → 执行上述定位器点击 → 面板失败时间不变，ready 超时 |
| 证据 | `browser/summary.json`（exit 1，`unexpected exception`，`browser/failure-page.html`，`browser/99-failure.png`）；`locator-probe/locator-probe.json`（3 个匹配按钮，第 1 个 `insidePanel=false`，点击后 `panelRefreshed=false`） |
| 产品是否受影响 | 否。`repro/retry-repro.json` 直接点 `[data-testid="kos-error-retry"]`，状态 `loading→ready`，实例变化，HTTP 200；v2 重跑 `attempts=0` PASS |
| 修复 | `22e7be2` 将恢复点击限定为 `kos-error-retry` / `kos-refresh`，并加入 `recoverPanel()` 处理重载/重挂载；仅测试脚本变更 |
| 复测 | `browser-rerun` 退出码 **0**，18 步全 PASS，`failures:[]`、`not_run:[]` |

**结论**：冻结在 37ac57a 内的 v1 测试脚本不能作为通过证据（其 browser-e2e 门槛为 FAIL）；产品候选本身的重试/恢复行为正确；v2 修复后通过。建议主管在最终报告中把 G1 作为“已修复的测试缺陷”记录，并把证据绑定为“产品 37ac57a + 测试 22e7be2”。

### 4.2 其他差异与限制

1. **无图像输入，未做人工目检**：我能读取 PNG 文件存在与字节大小，但不能查看像素内容。因此字体、颜色（`#3D7E86`）、布局、暗色模式、清晰度等视觉效果 **NOT_RUN**，只以 DOM 文本、元素状态、尺寸和截图文件存在为证据；截图保留给用户/主管目检。
2. **T04 覆盖子集**：实际执行 1 次重载、5 次进入/退出、15 秒静默，而 `test-plan.md` 写的是 5 次、10 次、60 秒。按用户本次指令的子集判定 PASS；更长窗口/更多循环 NOT_RUN。定时器计数（D4）与 `plugin remove`（D5/D6）NOT_RUN。
3. **T06 构建范围**：未重跑上游 `build:artifacts`，未运行插件 `build.mjs`（后者按指令禁止）。`runs/37ac57a/build-artifacts.log` 为主管提供的日志（原时间 11:35:13），不是本次执行产物；本报告只用 `source-tree-hash` + 类型检查 + 产物哈希作为独立证据。
4. **T01 客户端模块哈希**：未把浏览器实际请求的 Client 模块字节与 `lib/client.js` 做哈希比对（NOT_RUN）；T01 以真实页面加载、入口、面板、响应值和源码树一致性为依据。
5. **T03 夹具范围**：只验证了真实断连（进程终止）和 F1（浏览器 route 注入 500）。F2（畸形 JSON）、F3（延迟）、F4（404）NOT_RUN；真实断连不等于所有网络故障类型。
6. **全局 pnpm 版本差异**：`cmd /c pnpm --version` 为 `11.22.0`，而候选记录的是运行时自带 `11.28.5`；运行时 pnpm 已单独核对为 11.28.5。本次检查未使用全局 pnpm，不影响结论。
7. **候选记录自述差异**：`candidate.md` 声称开始时工作树完全干净，实际有未跟踪的 `candidate.md` 自身；产品文件无修改。主管随后在 v2 提交了该文件。
8. **绝对路径**：本地证据（如 `summary.json` 的 `dsh_root`/`home`、`T07/process.txt`）含工作区绝对路径；这是本机证据，未对外发布。界面/接口响应本身未含绝对路径（T07 已扫描）。脱敏只替换 token/Cookie 值，保留结果字段。
9. **T04 手工尝试的端口竞态**：T07 停止后立即启动 T04 主机出现 `EADDRINUSE`（`T04/host.stderr.log`），未执行到检查，未修改 profile；v2 已完成同一生命周期步骤。该次尝试不作为 FAIL 或 PASS 证据。
10. **桌面 Electron 冒烟**：NOT_RUN（本单元最低门槛为 Web profile + Playwright Chrome/Edge）。

---

## 5. 最终结论

### 5.1 本单元独立复核结论：**PASS**

在以下绑定下，T01–T07 的实际断言全部满足，未发现产品功能缺陷：

- **产品候选**：`37ac57af64b6741d82ffa2663b43dc244529c567`（树 `899a018f…`），12 个关键文件 SHA256 与 `candidate.md` 完全一致，全部运行前后未变。
- **证据脚本**：`22e7be2ffc1b1db6fe8247bb223e69ec6c7ecb5d`，仅测试/证据变更，产品目录 diff 为空。
- **真实链路**：固定上游 `39163dd` / `0.2.2-rc.3` 源码构建；真实 Host 于 `127.0.0.1:3099`；真实 Chrome/Playwright；真实 HTTP 200/401/405；真实断开、重启、禁用/恢复。
- **用户可见结果**：页面显示值与它实际收到的响应体逐字段一致（8/8，`checked_at` 精确相同）；入口/面板计数恰好 1；断连后错误与旧数据标记可见；恢复后实例变化且重新变为 ready。

### 5.2 对“冻结候选 37ac57a”的严格说明

- 如果门槛定义为“37ac57a 的原始测试脚本必须退出 0”，则该门槛 **FAIL**：`browser-e2e.mjs` v1 因 G1 退出 1（`runs/37ac57a/browser/`）。
- 该失败已定位为测试脚本缺陷，不是产品缺陷；`22e7be2` 修复后在同一产品候选上重跑 **PASS**（`runs/37ac57a/browser-rerun/`，18/18 步，`failures=[]`、`not_run=[]`）。
- 因此本单元的产品验收结论为 **PASS**；证据应同时注明“产品 37ac57a + 测试 22e7be2”。若主管坚持只用 37ac57a 单提交作为完整证据包，则需把 G1 修复补入候选并重新冻结（当前 22e7be2 已完成该修复）。

### 5.3 最小修复项

- **产品**：无。未发现需要修改产品代码的缺陷。
- **测试脚本**：已修复（22e7be2）：恢复/重连点击必须绑定面板 `data-testid`，不得用全页文本正则 `.first()`；建议保留 `locator-probe`/`retry-repro` 作为回归说明。
- **证据记录**：主管最终报告应将 G1 标为“已修复的测试 harness 缺陷”，并明确 T04 的 1/5/15 子集、T06 未重跑构建、无人工目检等限制。

---

## 6. 证据索引（主要）

```text
docs/evidence/FND-001/
├── independent-verification.md          ← 本文件
└── runs/37ac57a/
    ├── candidate-commit.txt / candidate-tree.txt / candidate-dirty.txt
    ├── candidate-files.txt / candidate-diff-stat.txt
    ├── execution-log.txt
    ├── T01/source-tree-hash.log, source-tree-hash.exit.txt
    ├── T05/verify-plan*.log, scope-check*.log, desktop-before/after.txt
    ├── T06/typecheck*.log, tsc-listfiles.log, lib-hashes-*.txt
    ├── T07/unauth.*, invalid-cookie.*, auth.*, auth2.*, post.*,
    │       listen.txt, process.txt, contract-check.log, forbidden-scan.log
    ├── host-contract/status-*.json, host-contract-summary.json, host-*.log
    ├── browser/                    ← v1 失败证据（保留）
    ├── browser-rerun/              ← v2 通过证据（18 步 + 6 截图）
    ├── repro/                      ← 面板 retry 独立复现
    ├── locator-probe/              ← G1 根因定位
    ├── page-match/                 ← 页面值 vs 响应体逐字段比对
    ├── T04/                        ← 手工尝试（未计入）+ 补丁基线
    ├── redaction-report.json, redaction-verify.json
    └── tools/                      ← 独立观测工具（非产品代码）
```

**脱敏**：`token=…` → `token=<redacted>`；`dsh-auth-…` → `dsh-auth-<redacted>`；Cookie 值未落盘（临时文件已删除）。二次字节级扫描覆盖 99 个文件（含 UTF-16 日志），无残留。结果字段（状态码、实例、时间、字段集合）均保留。
