# FND-001 独立测试与验收计划

| 项 | 值 |
|---|---|
| `unit_id` | FND-001（一个真实 DSH 面板与只读 Host 状态） |
| 角色 | 独立测试与验收（非实现者；默认只读产品代码） |
| 指令 | `DSH_START.md`，`instruction_revision` 2.0.0，`active_unit` FND-001 |
| 编写时间 | 2026-11-16（Asia/Shanghai） |
| 计划状态 | READY — 实现前建立的可观察预期 |
| 运行状态 | **T01–T07 全部 NOT_RUN（0 项执行）** |
| 唯一写入 | 本文件；未修改产品源码或测试代码 |

> 本文件是计划，不是结果。所有通过/失败结论必须在冻结候选上实际执行后才产生；执行前一律写 `NOT_RUN`。夹具结果、实现者自测、静态文案与截图本身都不构成通过。

---

## 1. 依据、固定事实与边界

### 1.1 依据文件

- `DSH_START.md` §3 读取顺序、§6 数据契约、§8 必测场景。
- `docs/plan/11_AGENT_AND_PROMPT_PROTOCOL.md` §4 任务包字段、§5 统一结果格式、§6 候选冻结与独立验收。
- `config/work_units.json` 中 FND-001 条目（scope / not_in_scope / test_obligations / acceptance scope）。
- `docs/plan/08_UI_SPEC.md` 的字体、主色 `#3D7E86`、状态表达、两级导航与异常显示约束。
- `docs/plan/02_DSH_CAPABILITY_AUDIT.md`、`docs/plan/03_ARCHITECTURE.md` 中固定上游扩展点与最小落地边界。
- `config/execution_state.json`（`instruction_revision` 2.0.0、`unit_state` ready）与 `config/upstream.lock.json`。
- `docs/evidence/README.md` 的证据归档与脱敏要求。

### 1.2 固定事实（执行时必须逐项核对，不得替换）

| 项 | 固定值 |
|---|---|
| 仓库 | `C:\Users\27363\Desktop\personal base\personal_konwledge-base` |
| 分支 / 起始提交 | `dsh/knowledgeos-fnd-001` / `6f23735`（计划编写时完整 SHA 为 `6f23735d5f07fed7cef108f829290b823ad6ace0`） |
| 上游 SHA | `39163dd30f703a79079e2d2446545cff3c453738` |
| 上游版本 | `0.2.2-rc.3` |
| 独立运行时 | `.cache\build\dsh-39163dd`（从锁定源码构建；**不使用** `.cache\runtime-rc3`，其 client-modules 内嵌 commit `6b729fe` ≠ 锁定 SHA） |
| 运行时启动（主管更正） | 在 `.cache\build\dsh-39163dd` 根目录执行：`node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open`（角色名即 profile 名，不再重复 `web` token；带 `web` 会被 launcher 当作多余参数而退出） |
| 候选插件 | `packages\knowledgeos-panel`（只读，不得修改） |
| 独立 `DSH_HOME` | `.cache\dsh-home-fnd001`（已创建并安装 `knowledgeos-panel` bundle） |
| 测试 profile | `knowledgeos-test`（只用于测试，不复用桌面 profile） |
| 测试 Web 端口 | 3099（避开当前桌面 62739 与 3080） |
| 不得操作 | 不停止/重启当前桌面 DSH；不向其 profile 安装插件 |
| 被测入口（主管定） | 侧栏标签 `知识库`，`PANEL_ID=knowledgeos` → 打开主面板（连接状态、版本摘要、刷新/重试） |
| Host 只读路由（主管定） | exact `GET /knowledgeos/status`（无前缀），需本机连接认证 |

### 1.3 本计划不做什么

1. 不修改产品源码、测试代码、profile 配置或当前桌面 DSH；尤其不得修改 `packages\knowledgeos-panel`。
2. 不预写任何运行结果、截图、日志或“通过”报告。
3. 不用本地静态页面、模拟服务器、硬编码常量替代真实 DSH Host/Client 链路。
4. 不把本单元通过扩大为 F01/F04 已验证、A01/A50 完整通过，或任何未来功能已实现。
5. 不在测试中实现数据库、登录、模型调用、六工作区、PDF 导入等范围外功能。

### 1.4 全局可证伪原则

- **真实链路优先**：任何“页面显示成功”必须能对应到真实进程、真实 HTTP 响应与真实服务端时间；否则视为失败。
- **服务端值不可由前端伪造**：`checked_at`、`host_instance_id`、`started_at` 只能以 Host 响应为准；直接 `curl` 得到的响应是服务端事实，页面必须与之逐字段一致。
- **重启可区分常量与真实实例**：同一候选、同一构建、不改任何文件，仅重启测试 Host，`host_instance_id` 必须变化；不变化即说明它不是运行实例标识。
- **失败状态必须可观察**：停掉真实 Host 后页面仍显示“正常/已连接”，即失败，不论文案多完整。
- **夹具必须自曝身份**：任何注入错误的代理、假响应、调试模式都必须在文件名、日志头、运行记录三处标注 `FIXTURE`，且不能计入真实集成结论。

---

## 2. 运行环境与预检（P0，不属于 T01–T07 结论）

### 2.1 变量（以下命令均按 PowerShell 执行）

```powershell
$repo   = "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
Set-Location $repo
$build  = Join-Path $repo ".cache\build\dsh-39163dd"    # 从锁定源码构建的运行时根目录
$cli    = "apps/cli/src/bin.ts"                          # 相对 $build
$plugin = Join-Path $repo "packages\knowledgeos-panel"   # 候选插件（只读）
$home   = Join-Path $repo ".cache\dsh-home-fnd001"
$base   = "http://127.0.0.1:3099"
$cand   = "<candidate-tag>"                       # 冻结时填写，例如 cand-6f23735-a1b2c3d4
$run    = Join-Path $repo "docs\evidence\FND-001\runs\$cand"
New-Item -ItemType Directory -Force "$run\host","$run\http","$run\net","$run\screens","$run\tools" | Out-Null
$env:DSH_HOME = $home
```

> 3099 被占用时的回退端口：3097（记录变更，仍避开 62739/3080）；不得改用桌面端口。

### 2.2 P0 检查项（任一不满足先记录阻塞，不进入 T01）

| ID | 检查 | 命令 | 通过条件 | 失败处置 |
|---|---|---|---|---|
| P0-1 | 工具链 | `node --version`；`pnpm --version` | Node ≥ 24.9.0；pnpm 11.28.5 | 记录实际值；版本不符不得静默继续，标 BLOCKED |
| P0-2 | 锁定源码 | `git -C "$repo\.cache\upstream\deepseek-harness" rev-parse HEAD` | 等于 `39163dd30f703a79079e2d2446545cff3c453738` | 不得改用其他提交；BLOCKED |
| P0-3 | 源码构建运行时 | 在 `$build` 下执行 `node --import tsx/esm apps/cli/src/bin.ts -V`；若 `$build` 是 Git 工作树则 `git -C "$build" rev-parse HEAD` | 版本 `0.2.2-rc.3`；构建指向锁定 SHA | 不符即 BLOCKED；不得用 `.cache\runtime-rc3` 或桌面 ASAR 顶替 |
| P0-4 | 构建/运行时指纹 | `Get-FileHash "$build\apps\cli\src\bin.ts","$build\package.json" -Algorithm SHA256`；记录构建日志与产物清单 | 哈希写入候选环境 | 缺失则 BLOCKED |
| P0-4b | 排除旧 npm 运行时 | 核对 `.cache\runtime-rc3` 的 client-modules 内嵌 commit | 主管已确认其为 `6b729fe`≠锁定 SHA；仅作对照，**不得用于测试** | 误用即 FAIL |
| P0-5 | 桌面保护 | `Get-NetTCPConnection -LocalPort 62739 -State Listen`；`Get-Process -Id <PID>` | 记录 PID 与开始时间，作为“未被干扰”基线 | 不得停止/重启桌面实例 |
| P0-6 | 端口空闲 | `Get-NetTCPConnection -LocalPort 3099 -ErrorAction SilentlyContinue` | 无监听 | 换 3097 并记录 |
| P0-7 | Home 隔离 | `$env:DSH_HOME` 必须位于 `$repo\.cache\`；`Get-ChildItem $home` | 不指向 `%USERPROFILE%\.dsh` | 指错即停止 |
| P0-8 | 候选记录 | `git rev-parse HEAD`；`git status --porcelain`；`git rev-parse HEAD^{tree}`；`Get-FileHash` 关键文件 | 见 §9.3 | 工作树不干净时记录 manifest，不混入用户改动 |
| P0-9 | 浏览器能力 | 确认系统 Edge/Chrome 路径；确认 Playwright 可用（`npx playwright --version`），记录 `channel` 或 `executablePath` | 可用 Playwright 驱动 Chrome/Edge（不使用 Electron）；不可用时安装到证据工具目录，不改插件 `package.json` | 无 UI 能力则 T01/T02/T04 的 UI 断言 BLOCKED，不得改判 |
| P0-10 | 无模型凭据依赖 | 确认本单元不触发真实模型调用 | 全程无模型请求 | 出现模型调用说明越界，记缺陷 |

### 2.3 profile 装配与测试 Host 启动（预期命令，实际参数以固定运行时 `--help` 为准并记录）

```powershell
# 1) 用源码构建运行时的模板创建/重置隔离 profile（不碰桌面 profile）
Push-Location $build
node --import tsx/esm $cli --profile knowledgeos-test --from-default-profile web --dump-config *> "$run\host\profile-dump.txt"
Pop-Location

# 2) 安装候选插件（packages\knowledgeos-panel 的本地路径/tarball；不得使用来源不明的 ASAR）
Push-Location $build
node --import tsx/esm $cli plugin --profile knowledgeos-test add "<PLUGIN_SPEC>" *> "$run\host\plugin-add.log"
Pop-Location

# 3) 启动测试 Host（主管给定命令原样执行；仅 3099，loopback，不自动开浏览器）
$proc = Start-Process node `
  -ArgumentList "--import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test web --port 3099 --no-open" `
  -WorkingDirectory $build `
  -RedirectStandardOutput "$run\host\stdout.log" `
  -RedirectStandardError  "$run\host\stderr.log" `
  -PassThru
$proc.Id | Set-Content "$run\host\pid.txt"
```

就绪探测（未认证时根路径返回 401/303 也算“已监听”，只要求不是连接失败）：

```powershell
$deadline = (Get-Date).AddSeconds(120)
do {
  Start-Sleep -Milliseconds 500
  $code = & curl.exe -sS -o NUL -w "%{http_code}" "$base/"
} while ($code -eq "000" -and (Get-Date) -lt $deadline)
"readiness=$code at $(Get-Date -Format o)" | Tee-Object "$run\host\readiness.txt"
```

进程归属核对（证明用的是 `.cache\build\dsh-39163dd` 源码构建，不是 `.cache\runtime-rc3` 或桌面 ASAR）：

```powershell
Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" |
  Select-Object ProcessId, CommandLine, CreationDate |
  Format-List | Out-String | Set-Content "$run\host\process.txt"
```

### 2.4 认证与原始 HTTP 抓取

Web profile 使用启动 token；从 stdout 提取带 token 的入口 URL（**token 属机密，只能存 `.local` 文件，不提交**）：

```powershell
$entry = (Select-String -Path "$run\host\stdout.log" `
  -Pattern 'http://127\.0\.0\.1:3099/\?token=[^\s"]+' | Select-Object -Last 1).Matches[0].Value
$entry | Set-Content "$run\http\entry.url.local"

# 用一次根请求换 Cookie
& curl.exe -sS -c "$run\http\cookies.local.txt" -D "$run\http\auth.headers" -o NUL "$entry"

# 认证后的状态响应（原始字节，便于契约校验与泄露扫描）
& curl.exe -sS -b "$run\http\cookies.local.txt" `
  -D "$run\http\status.headers" -o "$run\http\status.json" `
  "$base/knowledgeos/status"
"status_exit=$LASTEXITCODE" | Tee-Object "$run\http\status.exit.txt"
```

若实际认证方式与上述不同（例如需要 `/connect` 或桌面 owner 凭据），必须在证据中记录实际方法与命令，不得假设。

### 2.5 预检失败的处置

- P0-1/P0-2/P0-3/P0-4 任一不满足：T01–T07 记 `BLOCKED`，写明最小解除条件，不得换环境后继续冒充固定上游。
- 端口冲突、无浏览器、无权限：相应测试记 `BLOCKED`，其余可独立执行的项继续；不得用截图成功替代命令执行。
- 桌面实例被意外中断：立即停止测试，记为对用户环境的干扰缺陷，不继续“通过”。

---

## 3. 真实集成与故障夹具的边界

### 3.1 定义

- **真实集成**：固定运行时 + 独立 profile + 候选插件 + 真实 Host 进程 + 真实浏览器 + 真实 loopback HTTP。进程、响应、时间均由被测系统产生。
- **观测工具**：只读取/记录，不改变行为（`curl`、Playwright 网络记录、截图、文件哈希）。不算夹具。
- **故障夹具**：任何改变响应或可用性的注入手段（返回 500、畸形 JSON、延迟、404、代理拦截）。必须标注，且只证明 UI 分支，不能证明真实集成。

### 3.2 各测试允许的证据类型

| 测试 | 主证据 | 是否允许夹具 | 夹具可证明 | 夹具不能替代 |
|---|---|---|---|---|
| T01 | 真实进程/日志/页面 | 否 | — | 真实加载 |
| T02 | 真实 Host 往返 + 重启 | 否 | — | 真实往返与实例标识 |
| T03 | 真实断连（R1）+ 夹具分支（F*） | 是，必须标注 | 错误/过期/加载/信息不匹配的 UI 分支 | 真实断连与恢复 |
| T04 | 真实重载/卸载/端点消失 | 仅“异常原因可见”可用夹具 | 异常提示文案 | 真实卸载与生命周期 |
| T05 | 真实导航 + 仓库事实 | 否 | — | 回归与范围 |
| T06 | 真实命令与退出码 | 否 | — | 构建与类型 |
| T07 | 真实 401/200 + 绑定地址 | 否（负例仅用于校验器自检） | 校验器非空转 | 接口数据边界 |

### 3.3 夹具规则（违反即该项证据作废）

1. **F-1 标注三处**：文件名、日志首行、运行记录 `evidence_kind=fixture`；运行记录不得写 `real_disconnect`。
2. **F-2 位置与写入范围**：主管已批准测试角色独占写 `docs/evidence/FND-001/fixtures/` 与 `docs/evidence/FND-001/runs/<candidate>/`（含 `tools/`）；夹具与观测工具只放这些目录，不得进入产品包、不得改插件/宿主源码、**不得修改 `packages\knowledgeos-panel`**、不得为制造错误改 profile 配置。
3. **F-3 前置真实基线**：使用故障夹具前，T02 必须已在该候选通过；关闭夹具后必须恢复真实成功，否则无法区分“页面本身可用”与“夹具伪造”。
4. **F-4 不计入真实结论**：T01/T02/T07 的通过断言不得引用夹具证据。
5. **F-5 真实断连只能停真实 3099 进程**（或让真实监听消失），不得用代理模拟后标为真实。
6. **F-6 代理透明性**：若为注入错误把浏览器指向代理端口（如 3098），必须在证据中声明 origin 已变化，并区分“真实 3099 生成的部分”和“代理注入的部分”。
7. **F-7 不改门槛**：不得为了通过而删除断言、把真实测试改成 mock、或跳过失败项。

### 3.4 计划使用的夹具（实现前登记，使用时填实际路径）

| 夹具 ID | 形态 | 注入内容 | 只用于 | 标注 |
|---|---|---|---|---|
| F1 | 临时反向代理（3098 → 3099） | `/knowledgeos/status` 返回 500 | T03 服务错误分支 | `FIXTURE-F1` |
| F2 | 临时反向代理 | 返回缺字段/类型错误的 200 JSON | T03 “信息不匹配”分支 | `FIXTURE-F2` |
| F3 | 临时反向代理 | 为状态请求增加 3s 延迟 | T03 加载中/防重复点击 | `FIXTURE-F3` |
| F4 | 临时反向代理 | 返回 404 | T04 异常原因可见（辅助） | `FIXTURE-F4` |

> 夹具是否被主管批准、以及测试角色对 `fixtures/`、`runs/*/tools/` 的独占写入授权，见 §11 待确认项。未获批前不创建。

---

## 4. `GET /knowledgeos/status` 的 JSON 契约断言

### 4.1 规范响应（示意，不是运行结果）

```json
{
  "schema_version": 1,
  "product": "KnowledgeOS",
  "upstream_commit": "39163dd30f703a79079e2d2446545cff3c453738",
  "upstream_version": "0.2.2-rc.3",
  "expected_upstream_commit": "39163dd30f703a79079e2d2446545cff3c453738",
  "upstream_commit_verified": true,
  "host_instance_id": "ko-7f3c1a9e5b2d4c60",
  "started_at": "2026-11-16T11:20:03.412+08:00",
  "checked_at": "2026-11-16T11:21:47.905+08:00",
  "status": "ok"
}
```

### 4.2 字段集合与类型

| 字段 | 类型 | 必须满足 | 失败示例 | 语义要求 |
|---|---|---|---|---|
| `schema_version` | number | 严格等于 `1`（整数，不是字符串 `"1"`） | `"1"`、`2`、缺失 | 本接口结构版本；变化必须登记 |
| `product` | string | 严格等于 `KnowledgeOS`（大小写一致） | `knowledgeos`、缺失 | 本插件标识 |
| `upstream_commit` | string | FND-001 必须严格等于 `39163dd30f703a79079e2d2446545cff3c453738`；`unknown` 记 FAIL（主管决定） | 短 SHA、大写、`"abc"`、`unknown`、空串 | Host 构建/启动时核验的上游提交；不得由前端硬编码 |
| `upstream_version` | string | 等于 `0.2.2-rc.3` | `""`、`latest`、缺失 | 实际绑定的 DSH 构建版本 |
| `expected_upstream_commit` | string | 严格等于 `39163dd30f703a79079e2d2446545cff3c453738` | 其他 SHA、缺失 | 本次构建期望/锁定的提交，用于可观察地对照 |
| `upstream_commit_verified` | boolean / null | FND-001 必须为 `true`；`false`（不一致）与 `null`（无法核验）对 T01 均为 FAIL | 字符串 `"true"`、缺失、`true` 但 commit 不符 | Host 实际核验结果；不得把校验结果伪装进 `status` |
| `host_instance_id` | string | 非空（建议 8–128 字符）；无首尾空白、空白字符或路径分隔符；不等于 `unknown` 或 `upstream_commit`；插件实例（等同 Host 进程重启）必变，同进程内多次查询不变 | 空串、`"unknown"`、常量、含用户名/路径 | 当前 Host/插件运行实例的不透明标识 |
| `started_at` | string | RFC3339 且带时区（`Z` 或 `±hh:mm`），`Date.parse` 非 NaN | 裸本地时间、数字时间戳、`""` | 服务端记录的本实例启动时刻 |
| `checked_at` | string | 同上；`checked_at >= started_at` | 早于 `started_at`、不可解析 | 本次查询的服务端时刻 |
| `status` | string | 本单元仅允许 `ok`；不得承载构建校验或未来模块信息 | `degraded`、`unavailable`、布尔值、越界声明 | 只说明本接入服务可用性 |

补充规则：

- **字段集合**：主管决定固定为**恰好 10 个键且无额外字段**；多一个字段即 FAIL，不得以“扩展元数据”名义加入。字段名固定，不接受改名映射。
- `upstream_commit_verified` 与 `status` 职责分离：前者表示“构建提交与锁定是否一致/是否可核验”，后者只表示服务可用性；不得用 `status` 掩盖不一致。
- `Content-Type` 必须为 `application/json`（可带 `charset=utf-8`）。
- 成功 HTTP 状态为 `200`。
- 响应体应为单个 JSON 对象，大小建议 ≤ 2048 字节；不得是数组或 NDJSON。

### 4.3 跨字段、时间与实例断言

| ID | 断言 | 方法 |
|---|---|---|
| C1 | `checked_at >= started_at` | 解析后比较 |
| C2 | 同一实例内两次查询：`started_at` 不变、`host_instance_id` 不变、`checked_at` 严格递增 | 间隔 ≥1s 的两次 `curl` |
| C3 | 重启测试 Host 后：`host_instance_id` 必须变化、`started_at` 严格变晚、新 `checked_at >= 新 started_at` | 停进程→重启→重新认证后 `curl` |
| C4 | 页面展示的 `checked_at`/`host_instance_id`/`upstream_commit` 与最新原始响应逐字段一致 | 截图 + 原始 JSON 对照 |
| C5 | `checked_at` 不得明显超前于测试机时钟（>5 分钟）或早于 `started_at`；时区偏移合法 | 解析比较 |
| C6 | 两次真实刷新必须产生不同的 `checked_at`（≥1ms）；页面时间随之更新 | `curl` + 页面 |
| C7 | `upstream_commit` = `expected_upstream_commit` = `39163dd30f703a79079e2d2446545cff3c453738`，`upstream_commit_verified === true`，`upstream_version = 0.2.2-rc.3` | 与预检值比较；任一不符即 T01 FAIL；页面必须显示“信息不匹配/构建未验证”，否则额外记缺陷 |
| C8 | 语义一致性：`upstream_commit_verified === true` ⇒ `upstream_commit === expected_upstream_commit`；若 `upstream_commit !== expected_upstream_commit`，`verified` 必须为 `false` 或 `null`（为 `true` 即自相矛盾，FAIL） | 解析比较 |
| C9 | `unknown` 或 `verified !== true` 时，T01/T02 不得判 PASS；契约校验直接失败（K5/K7） | 校验器退出码 |

### 4.4 响应禁止内容（逐项扫描）

响应体（含键名、值、嵌套文本）与错误响应都不得出现：

1. 密钥/凭据类：`token`、`cookie`、`secret`、`password`、`passwd`、`api_key`/`apiKey`、`authorization`、`bearer`、`credential`。
2. 环境变量与主机环境：`DSH_HOME`、`USERPROFILE`、`APPDATA`、`PATH=`、`NODE_OPTIONS`。
3. 文件路径：Windows 绝对路径（`[A-Za-z]:\`）、`/Users/`、`/home/`、`/root/`。
4. 会话/消息内容：`sessionId`/`session_id`、`messageId`、`conversationId`、`prompt`、`completion`、`transcript` 及任何会话正文。
5. 账户/身份信息、Cookie 值、请求头回显。
6. 堆栈与内部实现：`Traceback`、`at xxx.ts:123`、`node_modules`、`<html`。
7. 超长不透明串（>64 字符）除允许的 40 位 commit 外出现，需人工确认。

### 4.5 可执行校验（保存为证据工具或管道执行）

```js
// contract-check.mjs —— 观测/断言工具，不是产品代码
// FND-001 主管决定: unknown / verified!=true / 额外字段 均不能通过
// 用法: node contract-check.mjs <a.json> [<b.json>] [same|restart]
const fs = require('node:fs');
const [fileA, fileB, mode] = process.argv.slice(2);
const raw = fs.readFileSync(fileA, 'utf8');
const b = JSON.parse(raw);
const out = [];
const ok = (id, cond, detail = '') => out.push({ id, pass: Boolean(cond), detail });
const EXPECTED = '39163dd30f703a79079e2d2446545cff3c453738';
const KEYS = [
  'schema_version','product','upstream_commit','upstream_version',
  'expected_upstream_commit','upstream_commit_verified',
  'host_instance_id','started_at','checked_at','status',
];
const iso = (s) => typeof s === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)
  && !Number.isNaN(Date.parse(s));

ok('K1 exact 10-key set', Object.keys(b).sort().join(',') === KEYS.slice().sort().join(','), Object.keys(b).join(','));
ok('K2 schema_version=1', b.schema_version === 1, JSON.stringify(b.schema_version));
ok('K3 product=KnowledgeOS', b.product === 'KnowledgeOS', String(b.product));
ok('K4 status=ok', b.status === 'ok', String(b.status));
ok('K5 upstream_commit=locked', b.upstream_commit === EXPECTED, String(b.upstream_commit));
ok('K6 expected_upstream_commit=locked', b.expected_upstream_commit === EXPECTED, String(b.expected_upstream_commit));
ok('K7 verified=true', b.upstream_commit_verified === true, JSON.stringify(b.upstream_commit_verified));
ok('K8 version=0.2.2-rc.3', b.upstream_version === '0.2.2-rc.3', String(b.upstream_version));
const HID = b.host_instance_id;
ok('K9 host_instance_id', typeof HID === 'string'
  && HID === HID.trim() && HID.length >= 8 && HID.length <= 128
  && !/\s/.test(HID) && !/[\\/]/.test(HID)
  && HID !== 'unknown' && HID !== b.upstream_commit, String(HID));
ok('K10 started_at iso', iso(b.started_at), String(b.started_at));
ok('K11 checked_at iso', iso(b.checked_at), String(b.checked_at));
ok('K12 checked>=started', Date.parse(b.checked_at) >= Date.parse(b.started_at));
const FORBIDDEN = [
  /[A-Za-z]:\\/, /\/(Users|home|root)\//, /(DSH_HOME|USERPROFILE|APPDATA)/,
  /(token|cookie|secret|password|api[_-]?key|authorization|bearer|credential)/i,
  /(session[_-]?id|messageId|conversationId|transcript)/i,
  /(Traceback|node_modules|at\s+\S+\.(ts|js):\d+)/, /<html/i,
];
const hits = FORBIDDEN.filter((r) => r.test(raw)).map(String);
ok('K13 no forbidden content', hits.length === 0, hits.join(' '));
ok('K14 size<=2048', Buffer.byteLength(raw) <= 2048, String(Buffer.byteLength(raw)));

if (fileB) {
  const c = JSON.parse(fs.readFileSync(fileB, 'utf8'));
  if (mode === 'same') {
    ok('K15 checked_at increases', Date.parse(c.checked_at) > Date.parse(b.checked_at));
    ok('K16 started_at stable', c.started_at === b.started_at);
    ok('K17 instance stable', c.host_instance_id === b.host_instance_id);
  } else if (mode === 'restart') {
    ok('K15 instance changes', c.host_instance_id !== b.host_instance_id);
    ok('K16 started_at increases', Date.parse(c.started_at) > Date.parse(b.started_at));
    ok('K17 new checked>=new started', Date.parse(c.checked_at) >= Date.parse(c.started_at));
  } else {
    ok('K15 mode', false, 'mode must be same|restart');
  }
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.every((x) => x.pass) ? 0 : 1);
```

运行示例与**校验器自检**（证明脚本不是空转）：

```powershell
node "$run\tools\contract-check.mjs" "$run\T02\status-a.json" "$run\T02\status-b.json" same
"contract_same_exit=$LASTEXITCODE"

# 负例：人工构造缺字段/类型错误的 JSON（属于校验器自检夹具，不是接口证据）
@'{"schema_version":"1","product":"KnowledgeOS"}'@ | Set-Content "$run\T02\negative-missing.json"
node "$run\tools\contract-check.mjs" "$run\T02\negative-missing.json"
"contract_negative_exit=$LASTEXITCODE"   # 期望 1；若为 0 则校验器无效，T07 不能通过
```

### 4.6 契约变更规则

- 字段增删、枚举变化、时间格式变化：必须先更新本节与 §9 的候选记录，经主管批准后重跑受影响断言；FND-001 不接受字段改名，也不接受“额外元数据”字段。
- 不得为了让响应通过而放宽本表（例如把 `schema_version` 接受为字符串、把 `status` 扩为 `degraded`）。
- `upstream_commit = unknown` 在本接口契约上可表达“无法核验”，但**主管决定 FND-001 记 FAIL**；`upstream_commit_verified != true` 同样不能算通过。构建/版本不符时页面必须显示“信息不匹配”，不得静默成功。

---

## 5. 失败、过期与重试的可观察状态

### 5.1 面板状态矩阵（预期，供客观断言）

| 状态 | 触发 | 必须可见 | 不得出现 |
|---|---|---|---|
| 加载中 | 首次打开或点击刷新/重试后请求未完成 | 明确的“加载中/正在连接”文案；不把旧值标为当前 | 旧数据被当作最新；多个成功提示 |
| 成功 | 收到 200 且契约通过 | 已连接；版本摘要（commit/version）；`checked_at` 对应的“最近检查时间” | 前端自算时间；与响应不一致的值 |
| 失败（无历史） | 首次请求即失败 | 错误状态 + 可读原因 + 重试按钮 | 任何“正常/已连接” |
| 失败（有历史） | 成功后再失败 | 保留旧数据但明确标“已过期/上次成功于 …/非实时”；错误 + 重试 | 旧值继续以当前状态展示 |
| 信息不匹配 | 200 但字段缺失/类型错/版本或 SHA 不符 | 明确的不匹配/数据异常提示；指出期望与实际（不含机密） | 静默成功、只写 console |
| 重试中 | 点击重试后 | 加载反馈；同一时刻不并发多个成功状态 | 重复请求叠加、重复成功提示 |
| 恢复 | 服务恢复后重试成功 | 新 `checked_at`、过期标记消失、状态回到成功 | 复用失败前的旧 `checked_at` |

### 5.2 “静态文案不算成功”的证伪方法

1. 停掉真实 Host 后截图：页面若仍显示“已连接/正常”，即 FAIL。
2. 断连前后对比 DOM 文本（Playwright `page.evaluate` 取 `document.body.innerText` 并 diff）：无变化即说明状态是静态的，FAIL。
3. 连续两次真实刷新读取页面时间：不变或与 `curl` 响应不符即 FAIL。
4. 页面显示的 `checked_at` 必须能追溯到某一次真实响应；无法对应即视为伪造。

### 5.3 失败与重试断言（T03 使用）

- 失败后 10 秒内出现错误态；错误文案可读中文，不含 token/路径/堆栈。
- 有历史成功数据时，旧数据必须被标记过期（或替换为“无实时数据”），不得继续显示为当前。
- 失败期间点击重试：产生新的请求尝试（Playwright/服务端记录），仍失败，不出现假成功。
- 恢复后点击重试：`checked_at_new > checked_at_old`，过期标记消失，页面与原始响应一致。
- 若实现带自动轮询，恢复后无需手点也应更新；但“必须可手动重试”仍需验证。

---

## 6. T01–T07 测试明细

> 每条测试的状态初始为 `NOT_RUN`。运行记录格式见 §9。

### 6.1 T01 固定 DSH 真实加载 Host 与 Client

**测试目标**：证明页面由固定上游的真实 DSH Web Host 提供，KnowledgeOS 作为真实 Client/Host 插件加载；不是独立假页面；并提供可核对的版本/SHA 来源。

**前置条件**
- P0 全部通过；候选已冻结且文件哈希已记录。
- 3099 空闲；桌面 62739 的 PID/启动时间已记录且全程不变。
- 隔离 `DSH_HOME` 与 profile 已按 §2.3 装配。

**操作步骤**
1. 记录候选与环境（§9.3 命令），写入 `$run\env.json`；记录 `.cache\build\dsh-39163dd` 的构建来源与版本。
2. 按 §2.3 用源码构建运行时装配 profile：`--from-default-profile web --dump-config` 与 `plugin add`（从 `packages\knowledgeos-panel` 安装），保存退出码。
3. 在 `$build` 下按主管给定命令启动测试 Host，记录 PID、启动时间、stdout/stderr；就绪探测。
4. 核对进程命令行（§2.3 的 `Get-CimInstance`）：必须包含 `--import tsx/esm`、`apps/cli/src/bin.ts`、`--profile knowledgeos-test`、`web`、`--port 3099`，工作目录为 `$build`；不得指向 `.cache\runtime-rc3` 或桌面 `app.asar`。
5. 用 Playwright 驱动系统 Chrome/Edge（`channel` 或 `executablePath`，不使用 Electron）打开入口 URL（含 token）；截图 DSH 外壳与既有侧栏。
6. 在侧栏点击标签为 `知识库` 的 KnowledgeOS 入口（`PANEL_ID=knowledgeos`）；截图。
7. 截图主面板（标题、连接状态、版本摘要、刷新/重试）。
8. 用认证 `curl` 抓取 `/knowledgeos/status`，保存原始响应；运行 §4.5 校验器（期望退出码 0）。
9. 用 Playwright 请求记录找出 KnowledgeOS Client 模块请求并计算字节哈希，与 `packages\knowledgeos-panel` 构建产物比对。
10. 再次确认 62739 仍在监听、桌面 PID 未变。

**客观通过断言**
- **A1** 在 `$build` 下 `node --import tsx/esm apps/cli/src/bin.ts -V` 输出 `0.2.2-rc.3`；测试 Host 进程命令行指向 `.cache\build\dsh-39163dd\apps\cli\src\bin.ts`，不含 `.cache\runtime-rc3` 或桌面 `app.asar`。
- **A2** profile 配置/日志显示 KnowledgeOS Host 与 Client 插件已从候选 `packages\knowledgeos-panel` 加载，无加载错误/异常。
- **A3** 页面 origin 为 `http://127.0.0.1:3099`（不是 `file://`、不是 62739、不是 3080），且是真实 DSH 外壳（既有导航元素存在）。
- **A4** 侧栏标签 `知识库` 的入口恰好 1 个（DOM 计数 = 1，`PANEL_ID=knowledgeos`）；点击后出现一个主面板。
- **A5** 面板可见标题、连接状态、版本摘要、刷新/重试；中文可读；无调试路径/token。
- **A6** 原始响应恰好 10 字段，且 `schema_version=1`、`product=KnowledgeOS`、`upstream_commit=expected_upstream_commit=39163dd30f703a79079e2d2446545cff3c453738`、`upstream_version=0.2.2-rc.3`、`upstream_commit_verified=true`、`status=ok`；§4.5 校验器退出码 0。`unknown`/`false`/`null` 一律 FAIL，不得算通过。
- **A7** 面板显示的版本/SHA/verified/检查时间与该次原始响应一致；不一致或页面未显示“信息不匹配”即 FAIL。
- **A8** 桌面 62739 的 PID 与监听状态与 P0 基线一致。

**失败判据**
- 使用桌面 profile/ASAR、其他 DSH 版本或来源不明的构建。
- 页面为静态 HTML/独立假页面；无真实插件加载记录。
- 入口缺失、重复或点击无面板。
- 版本/SHA 不符却未在 UI 暴露。
- 测试过程中停止/重启了桌面 DSH。

**需保存的证据**
- `$run\env.json`、`host\profile-dump.txt`、`host\plugin-add.log`、`host\build-version.txt`
- `host\stdout.log`、`host\stderr.log`、`host\pid.txt`、`host\process.txt`、`host\readiness.txt`
- `T01\status.json`、`T01\status.headers`、`T01\contract-check.txt`
- `T01\screens\01-shell.png`、`02-entry.png`、`03-panel.png`
- `T01\dom-entry-count.json`、`T01\client-module-hash.txt`（如可得）、`T01\playwright-trace.zip`
- `T01\desktop-before.txt`、`desktop-after.txt`

**不能证明什么**
- 不能证明状态契约语义、跨字段时间关系（T02/T07）。
- 不能证明失败处理、过期标记、重试（T03）。
- 不能证明生命周期释放、重复注册（T04）。
- 不能证明 DSH 其他功能回归、范围未扩大（T05）。
- 不能证明构建/类型真实通过（T06）。
- 不能证明数据边界与认证拒绝（T07）。
- 即使页面出现 “KnowledgeOS/知识库” 文案，也不能单独证明真实链路；必须同时满足 A1–A4、A6。
- HTTP 自报 SHA 不能证明构建来源；若 Host 仅硬编码常量，仍需 `$build` 构建来源、构建产物哈希与重启/刷新行为共同排除。
- 桌面 Electron 冒烟本单元记 `NOT_RUN`（主管决定：最低门槛是 Web profile + Playwright Chrome/Edge）；本测试不能证明桌面宿主行为。

---

### 6.2 T02 页面到 Host 的真实只读往返

**测试目标**：证明面板的数据来自真实 Host 查询，服务端生成查询时刻与实例标识；重启测试实例后标识变化；前端不是硬编码成功。

**前置条件**
- T01 在同一候选通过；测试 Host 运行中；已获得有效 Cookie。
- Playwright 可驱动 Chrome/Edge 并记录网络请求（至少可用 `curl` 前后对比 + 页面时间）。

**操作步骤**
1. 认证 `curl` 连续两次（间隔 ≥1s）取状态 A、B；保存原始响应。
2. 运行 `contract-check.mjs A B same`，要求退出码 0。
3. 打开页面面板，记录当前显示的 `host_instance_id`、版本、最近检查时间；截图。
4. 点击“刷新”；用 Playwright 请求记录新增的状态请求；截图；再次读取页面显示值。
5. 断言刷新产生了新请求，且页面时间等于最新响应（不是浏览器本地时间）。
6. 停止测试 Host：`Stop-Process -Id (Get-Content $run\host\pid.txt)`；确认 3099 无监听；确认 62739 未受影响。
7. 以相同命令、相同候选重启测试 Host；重新获取 token/Cookie；`curl` 取状态 C。
8. 运行 `contract-check.mjs A C restart`，要求退出码 0。
9. 重新加载页面并刷新；截图，确认显示 C 的实例标识与时间。
10. 对比重启前后候选关键文件哈希，确认未改代码/未重建。

**客观通过断言**
- **B1** 两次认证请求均 `200` + `application/json`，契约校验（§4.5）退出码 0。
- **B2** A/B：`started_at` 与 `host_instance_id` 不变，`checked_at` 严格递增。
- **B3** 点击刷新后出现至少一次新的 `/knowledgeos/status` 请求（Playwright 请求记录或等价证据）；页面出现新的检查时间。
- **B4** 页面显示的实例标识/版本/verified/检查时间与最新原始响应逐字段一致。
- **B5** 重启后 `host_instance_id` 变化、`started_at` 变晚、`checked_at >= started_at`；响应仍为 `upstream_commit=expected_upstream_commit=39163dd…`、`upstream_commit_verified=true`。
- **B6** 重启后页面（重载+刷新）显示新实例标识，且候选文件哈希未变（排除“改代码/重建才变化”）。
- **B7** 全程 62739 桌面实例未被停止。

**失败判据**
- 页面显示成功但无对应请求（静态/硬编码）。
- 页面值与原始响应不一致，或把旧值当最新。
- 重启后实例标识不变（常量/机器标识冒充实例标识）。
- `started_at` 未更新、`checked_at < started_at`。
- 只在实现者本机记忆中出现“刷新过”，无请求或时间证据。

**需保存的证据**
- `T02\status-a.json`、`status-b.json`、`status-c.json`、各自 `*.headers`
- `T02\contract-same.txt`、`contract-restart.txt`（含退出码）
- `T02\net\refresh.jsonl`（Playwright 请求记录）或等价、`T02\playwright-trace.zip`
- `T02\screens\before-refresh.png`、`after-refresh.png`、`after-restart.png`
- `T02\hashes-before-after.txt`、`host\restart.log`

**不能证明什么**
- 不能证明认证与授权边界（T07）；不能证明其他账户/客户端隔离。
- 不能证明并发、缓存策略、超时、重试退避。
- 不能证明页面没有在“请求失败时仍显示旧成功”（T03）。
- 同机部署下，“服务端时间”只能由直连 `curl` 与重启变化证明，不能证明跨机时钟正确性。
- 不能证明生产构建、桌面 Electron、安装后的行为。

---

### 6.3 T03 失败与重试

**测试目标**：证明失败时页面显示错误并标记旧数据过期；恢复后重试得到新响应；严格区分真实断连与故障夹具。

**前置条件**
- T01、T02 在同一候选通过；页面已显示成功数据并记录 `checked_at_old`。
- 明确记录哪个子用例是真实断连、哪个是夹具。

#### T03-R1 真实断连（唯一可作为“真实失败”证据的子用例）

1. 面板处于成功态，记录 `checked_at_old` 并截图。
2. 只停止测试 Host 进程（3099），确认端口无监听；确认 62739 仍在监听。
3. 10 秒内观察页面：截图错误态；抓取 `document.body.innerText`。
4. 在断连状态点击“重试”，截图；确认错误持续、无假成功。
5. 重启测试 Host（同候选、同命令），重新认证；点击“重试”；截图成功态。
6. 记录恢复后的 `checked_at_new`，要求 `checked_at_new > checked_at_old`；确认过期标记消失。
7. 保存服务端/进程日志，证明失败由真实进程终止造成，未使用代理或代码改动。

#### T03-F1 夹具：服务错误 500（标注 FIXTURE）

1. 启动 `FIXTURE-F1` 代理（3098 → 3099），仅对 `/knowledgeos/status` 返回 500；在日志首行写 `FIXTURE-F1`。
2. 浏览器打开 `http://127.0.0.1:3098/`（记录 origin 变化），重复观察错误态与过期标记。
3. 关闭 500 注入，重试，确认恢复真实成功。
4. 证据文件名与运行记录标 `evidence_kind=fixture`。

#### T03-F2 夹具：畸形/缺字段响应（标注 FIXTURE）

- 代理返回缺 `schema_version` 或 `schema_version: "1"` 的 200 JSON；页面必须显示“信息不匹配/数据异常”，不得显示成功。
- 该结果只证明 UI 分支，不证明真实接口。

#### T03-F3 夹具：延迟（标注 FIXTURE）

- 为状态请求注入 3s 延迟：应看到加载中状态；连续点击刷新不应产生多个并发成功态（记录请求数）。

**客观通过断言**
- **C1** 真实断连后 10 秒内页面显示错误，且不再声称“正常/已连接”。
- **C2** 有历史数据时，旧数据被标记过期（或明确替换为无实时数据），不以当前状态展示。
- **C3** 断连期间重试产生真实请求尝试并失败，无假成功。
- **C4** 恢复后重试得到新响应，`checked_at_new > checked_at_old`，过期标记消失。
- **C5** 错误/恢复过程中页面值始终与最近一次真实响应一致。
- **C6** 所有夹具证据均标注 `FIXTURE`；真实断连证据不含夹具路径。
- **C7** 错误文案不含 token、绝对路径、堆栈或会话内容。

**失败判据**
- 停止 Host 后仍显示成功/最新，或旧数据无过期标记。
- 重试不触发新请求、或恢复后仍显示旧 `checked_at`。
- 用代理 500 冒充“真实断连”；或把夹具结果写成真实集成通过。
- 仅控制台报错、UI 无错误；或错误文案泄露敏感信息。

**需保存的证据**
- `T03\real\before.png`、`down.png`、`retry-down.png`、`recovered.png`
- `T03\real\checked-at.txt`、`T03\real\body-before.txt`、`body-down.txt`、`body-after.txt`
- `T03\real\host-stop.txt`、`host-restart.txt`、`port-62739.txt`
- `T03\fixture-f1\*`、`fixture-f2\*`、`fixture-f3\*`（文件名含 FIXTURE）
- `T03\dom-text\*.txt`（断连前后 DOM 文本 diff）

**不能证明什么**
- 不能证明所有故障类型（DNS、超时、半开连接、慢响应）均被正确处理。
- 不能证明自动重试/退避策略正确（若实现有，需另测）。
- 夹具分支通过不代表真实断连通过；真实断连只覆盖进程终止这一种。
- 不能证明数据一致性（本接口无业务数据）。
- 不能证明生产网络环境与桌面宿主下的表现。

---

### 6.4 T04 面板和插件生命周期

**测试目标**：重复进入/退出、合法重载/卸载后不重复注册入口、不遗留监听/定时器/轮询；卸载后 Host 路由消失；异常有可见原因。

**前置条件**
- T01、T02 通过；Host 运行中。
- 已记录可用的 DOM 选择依据（入口文案 `知识库`、`PANEL_ID=knowledgeos` 或稳定属性）与基线请求计数。
- Playwright 可驱动 Chrome/Edge 并注入观测脚本（不使用 Electron）。

**操作步骤**
1. **重复重载**：整页刷新 5 次；每次截图并统计标签为 `知识库` 的入口 DOM 数量；断言恒为 1。
2. **重复进入/退出**：进入面板→切到其他工作区→返回，循环 10 次；统计入口数恒为 1；不得出现叠层/双面板。
3. **单次刷新单请求**：在面板内点一次“刷新”，用 Playwright 请求记录统计状态请求数 = 1。
4. **卸载后静默**：离开面板（不关闭页面），记录时间 T；等待 60 秒；统计 T 之后的新 `/knowledgeos/status` 请求数。
5. **卸载后 DOM/定时器**：用 Playwright `addInitScript` 包裹 `setInterval`/`clearInterval` 计数，统计活动定时器在进入前/卸载后回到基线；保存注入脚本源码（观测工具，非夹具）。
6. **插件卸载**：在 `$build` 下 `node --import tsx/esm $cli plugin --profile knowledgeos-test remove "<PACKAGE_NAME>"`，记录退出码；停止并重启测试 Host；用有效认证 `curl` 请求 `/knowledgeos/status`。
7. **入口消失**：卸载后重载页面，截图确认标签 `知识库` 的入口不再出现。
8. **异常可见**：用 `FIXTURE-F4`（404）或 `F1`（500）触发初始加载失败，确认页面显示可见原因而非白屏/崩溃。
9. 全程核对桌面 62739 PID 不变。

**客观通过断言**
- **D1** 5 次整页重载后标签 `知识库` 的入口 DOM 数恒为 1；无重复入口/重复面板。
- **D2** 10 次进入/退出后入口数恒为 1；单次刷新只产生 1 个请求。
- **D3** 离开面板后 60 秒内无新的 `/knowledgeos/status` 请求（若实现有轮询，须在一个轮询周期内停止）；期间无新的客户端错误。
- **D4** Playwright 注入的定时器计数回到进入前基线（若该观测不可用，明确记为局限，不伪造）。
- **D5** 卸载插件并重启后，认证请求 `/knowledgeos/status` 返回 `404`（或连接被拒，若 Host 未运行）；不得返回 `200`。
- **D6** 卸载后重载页面，标签 `知识库` 的入口消失。
- **D7** 非法/失败加载时页面有可见原因（中文），不白屏。
- **D8** 桌面 62739 未被卸载/重启/影响。

**失败判据**
- 重载后出现 2 个入口或 2 个面板。
- 离开面板后仍有状态请求（轮询未清理）或监听器导致重复请求。
- 卸载后路由仍 `200`、入口仍存在。
- 异常时白屏/崩溃/无原因。
- 为了测试卸载而影响桌面 profile 或载体 DSH。

**需保存的证据**
- `T04\reload-1..5.png`、`T04\dom-count.json`
- `T04\enter-exit\*.png`、`T04\request-counts.json`
- `T04\net\after-unmount.jsonl`、`T04\timers.json`（含 `addInitScript` 源码与基线）、`T04\playwright-trace.zip`
- `T04\plugin-remove.log`、`T04\status-after-uninstall.txt`、`T04\entry-after-uninstall.png`
- `T04\fixture-error\*.png`（标注 FIXTURE）

**不能证明什么**
- 不能证明所有内存/闭包泄漏；只能证明可观测定时器与请求层面。
- 不能证明 HMR/热更新语义（本计划只做整页重载）。
- 不能证明桌面宿主或插件管理器在真实用户 profile 下的卸载行为（桌面冒烟本单元 `NOT_RUN`）。
- 60 秒窗口不能证明长时间运行稳定性。
- 定时器计数受第三方库影响，只能看“回到基线”，不能归因到单一模块。

---

### 6.5 T05 最小回归与范围

**测试目标**：DSH 既有基本导航仍可用；只有一个新面板；未引入数据库、登录、模型业务或其他未来模块。

**前置条件**
- T01 通过；测试 profile 可打开基础页面。
- 已记录候选改动范围与主管批准的允许文件。

**操作步骤**
1. `node scripts/verify-plan.mjs`，记录退出码。
2. `git diff --stat 6f23735..HEAD`、`git status --porcelain`、`git diff --name-status 6f23735..HEAD`；列出全部变更文件。
3. `git diff 6f23735..HEAD -- "*package.json" "*pnpm-lock.yaml"`；列出新增依赖。
4. 浏览器截图既有侧栏工作区（今日计划、知识库、笔记、项目协作、智能讨论、管理与设置，或固定运行时实际存在的项）；逐项点击，确认主内容切换、无错误页/白屏。
5. 打开一个既有会话，确认会话界面可加载（不要求模型回复；若触发模型调用，记为范围外/NOT_RUN，不得当成通过）。
6. 统计标签 `知识库` 的入口（`PANEL_ID=knowledgeos`）与面板数量（DOM + 截图）= 1。
7. 对比启动前后 `DSH_HOME` 文件清单；确认没有 KnowledgeOS 业务数据库/迁移/上传目录。
8. 对候选源码做特征扫描：`openai`、`anthropic`、`node:sqlite`、`prisma`、`login`、`password`、六工作区空壳、`pdf`、`embedding` 等是否被引入（允许有充分理由的例外，需登记）。
9. 确认测试过程未修改 `packages\knowledgeos-panel`（对比候选哈希）。

**客观通过断言**
- **E1** `verify-plan.mjs` 退出码 0。
- **E2** 变更文件均在主管批准的范围内；无大范围格式化/重构。
- **E3** 无数据库/ORM/迁移、无注册登录、无模型 SDK/业务调用、无 PDF/RAG/题库等未来模块。
- **E4** 既有工作区导航可点击并正常切换；无白屏或错误提示。
- **E5** 标签 `知识库` 的新增入口/面板恰好 1 个。
- **E6** `DSH_HOME` 中无 KnowledgeOS 业务数据文件；只有上游运行时自身文件（需列出并区分）。
- **E7** 未新增与 FND-001 无关的依赖；有新增时逐个说明用途并经主管确认。
- **E8** 候选 `packages\knowledgeos-panel` 未被测试过程修改（哈希一致）。

**失败判据**
- 既有导航损坏、点击报错或白屏。
- 出现第二个面板/入口、六工作区空壳、登录页、数据库文件。
- 引入模型调用或未来模块依赖。
- 改动范围超出批准清单，或包含用户未授权的修改；测试过程修改了 `packages\knowledgeos-panel`。

**需保存的证据**
- `T05\verify-plan.log`
- `T05\diff-stat.txt`、`diff-name-status.txt`、`git-status.txt`
- `T05\deps-diff.txt`
- `T05\screens\workspace-*.png`、`T05\screens\entry-count.png`
- `T05\dsh-home-before.txt`、`after.txt`
- `T05\forbidden-scan.txt`、`T05\plugin-hash.txt`

**不能证明什么**
- 不能证明 DSH 全功能回归（模型、文件、终端、插件管理等未逐项验证）。
- 不能证明六工作区（本单元明确不实现，不应出现）。
- 不能证明 Windows 安装包/权限/多用户。
- 不能证明代码审阅完整性；自动化与抽检不等于全面审查。

---

### 6.6 T06 构建与类型

**测试目标**：与当前改动相关的构建真实运行：上游源码运行时 `build:artifacts` 成功、插件 `npm typecheck/build` 成功、产物哈希与实际加载一致；`build:check` 不是本单元强制。

**前置条件**
- Node/pnpm 符合 P0-1；`$build` 存在且指向锁定源码；候选已冻结。
- 已从 `packages\knowledgeos-panel\package.json` 读取真实脚本名（不得照抄本计划示例）。

**操作步骤**
1. 记录 `node --version`、`pnpm --version`、`npm --version`、插件 `package.json` 的 `scripts`。
2. 上游构建产物：在 `$build` 执行 `npm run build:artifacts`（若该构建实际使用 pnpm，记录实际命令）；必须成功。
3. 插件依赖：有锁文件时 `npm --prefix "$plugin" ci`，否则 `npm --prefix "$plugin" install`；记录退出码。
4. 插件类型检查：`npm --prefix "$plugin" run typecheck`（或实际脚本名）。
5. 插件构建：`npm --prefix "$plugin" run build`（或实际脚本名）；保存产物与哈希。
6. `build:check` 非本单元强制；若执行，必须在 `build:artifacts` 之后并记录时间戳与退出码。
7. 将 Host 实际加载的插件产物哈希与第 5 步构建产物对比。
8. 若有本单元针对性测试：运行并记录；无测试时写 `NOT_RUN` 并说明原因（不得伪造）。
9. 记录所有命令的开始/结束时间与退出码。

**客观通过断言**
- **F1** 上游 `build:artifacts` 退出码 0，日志完整。
- **F2** 插件 `install`/`typecheck`/`build` 均退出码 0。
- **F3** 类型检查覆盖本单元新增的 Host/Client 代码（核对 `tsconfig` 范围），不是无关包的空跑。
- **F4** 构建产物哈希与测试 Host 实际加载的产物一致（证明验证的是构建结果，不是源码目录旧产物）。
- **F5** `build:check` 未被当作强制项；若运行，`build:artifacts` 时间早于 `build:check` 且两者成功。
- **F6** 无跳过/忽略的失败；无“只改测试数据让检查通过”。
- **F7** 未把全仓耗时测试套件当作本单元默认门槛（若运行，单列并说明原因）。

**失败判据**
- `build:artifacts`/typecheck/build 任一失败仍写通过；或只口头声称“编译通过”无日志。
- 使用旧产物/缓存冒充新构建；实际加载的插件与构建产物不是同一份。
- 类型检查只覆盖无关包；跳过失败测试。
- 未运行 `build:artifacts` 却声称构建证据完整。

**需保存的证据**
- `T06\toolchain.txt`、`T06\scripts.txt`
- `T06\upstream-artifacts.log`
- `T06\plugin-install.log`、`T06\typecheck.log`、`T06\build.log`（含退出码）
- `T06\upstream-check.log`（仅若运行）
- `T06\artifact-hashes.txt`、`T06\loaded-vs-built.txt`
- `T06\targeted-tests.log`（若有）

**不能证明什么**
- 不能证明运行时行为正确（T01/T02 才能）。
- 不能证明跨平台/Windows 原生安装/打包后 Electron。
- 不能证明测试覆盖充分；只证明执行过的检查通过。
- 不能证明上游全量质量；只证明本次相关检查。

---

### 6.7 T07 状态接口数据边界

**测试目标**：响应只含约定元数据，不泄露凭据、环境变量、文件路径或会话内容；未授权连接仍由现有本机认证拒绝。

**前置条件**
- T01/T02 通过；测试 Host 运行中；已获得有效 Cookie 与一个明确无效的 Cookie。
- 记录服务监听地址与端口。

**操作步骤**
1. 未认证请求：`curl.exe -sS -o NUL -D "$run\T07\unauth.headers" -w "%{http_code}" "$base/knowledgeos/status"`。
2. 无效 Cookie 请求：`-H "Cookie: dsh_session=invalid"`，记录状态码与响应体。
3. 有效 Cookie 请求：保存原始 body 与 headers。
4. 运行 §4.5 契约校验（退出码 0）与 §4.4 禁止内容扫描。
5. 记录监听地址：`Get-NetTCPConnection -LocalPort 3099 -State Listen | Select LocalAddress,LocalPort`，必须仅 loopback（`127.0.0.1`/`::1`），不得 `0.0.0.0`/`::`。
6. 检查响应头：`Content-Type: application/json`；无 `Access-Control-Allow-Origin: *`；状态路由不设置含 token 的 Cookie。
7. 用错误方法（如 `POST`）请求，记录拒绝行为（405/404/401 均可，但不得 200 且无鉴权）。
8. 检查错误响应（未授权/不存在）不含堆栈、路径、内部模块名。

**客观通过断言**
- **G1** 未认证与无效 Cookie 均返回 `401`（或 `403`），且响应体不含任何状态数据。
- **G2** 有效 Cookie 返回 `200`，恰好 10 字段；契约校验退出码 0（`upstream_commit=expected=39163dd…`、`upstream_commit_verified=true`、`status=ok`、`schema_version=1`、`product=KnowledgeOS`）。
- **G3** 监听地址仅 loopback；不得绑定通配地址。
- **G4** 响应体只有约定的 10 个字段，无额外字段；无密钥、环境变量、绝对路径、会话内容、账户信息。
- **G5** 响应头不泄露凭据；无不合理的通配 CORS。
- **G6** 错误响应同样不泄露堆栈/路径/内部信息。
- **G7** 响应体不回显请求 Cookie/Authorization。

**失败判据**
- 未认证即可 `200` 获取数据，或返回部分数据。
- 出现路径、环境变量、token、Cookie、会话正文、账户信息。
- 监听在 `0.0.0.0`/`::`，或可从非本机访问。
- 错误响应含堆栈/内部模块名。
- 用夹具响应代替真实接口做边界结论；`unknown` 或 `verified!=true` 被当成通过。

**需保存的证据**
- `T07\unauth.headers`、`unauth.body`、`unauth.code.txt`
- `T07\invalid-cookie.headers`、`invalid-cookie.body`
- `T07\auth.body`、`auth.headers`
- `T07\contract-check.txt`（含退出码）
- `T07\forbidden-scan.txt`
- `T07\listen.txt`
- `T07\method.txt`

**不能证明什么**
- 不能证明完整安全审计或渗透测试。
- 不能证明多人身份与对象授权（本单元未实现，也不应声称）。
- 不能证明 TLS、反向代理、公网部署。
- 不能证明插件进程内隔离（DSH Host 插件不是安全沙箱）。
- 不能证明未来路由的边界；只覆盖本接口当前实现。

---

## 7. 生命周期不变量汇总（对应 T04）

| 不变量 | 断言 | 证据 |
|---|---|---|
| L1 | 整页重载 5 次后，标签 `知识库` 的入口数恒为 1 | DOM 计数 + 截图 |
| L2 | 进入/退出 10 次后入口数恒为 1，无叠层面板 | 截图 + DOM |
| L3 | 单次“刷新”只产生 1 个状态请求 | Playwright/服务端记录 |
| L4 | 卸载面板后 60 秒内无新的状态请求；活动定时器回到基线（可观测时） | Playwright JSONL + 注入计数 |
| L5 | 卸载插件并重启 Host 后，`/knowledgeos/status` 返回 404（或连接被拒） | `curl` + 退出码 |
| L6 | 卸载后重载页面，入口消失 | 截图 |
| L7 | 失败/异常加载有可见原因，不白屏 | 截图（夹具标注） |
| L8 | 全过程桌面 62739 PID/监听不变 | 前后对比 |

> “无遗留轮询/定时器”只以可观测证据为准：网络请求静默 + Playwright 注入定时器计数回到基线。若 Playwright 注入不可用，L4 的定时器部分记 `NOT_RUN`/局限，不得仅凭“看起来没有”写通过。

---

## 8. 最小回归与范围断言汇总（对应 T05）

### 8.1 允许/禁止清单

| 类别 | 允许 | 禁止（出现即 FAIL） |
|---|---|---|
| 依赖 | 插件构建/运行必需，且逐项登记 | 数据库/ORM、认证框架、模型 SDK、PDF/RAG/向量库、调度框架 |
| 数据 | 无业务持久化 | SQLite/业务表/迁移/上传目录/索引 |
| 页面 | 一个 KnowledgeOS 主面板 + 侧栏入口 | 六工作区空壳、登录/注册页、第二套导航/Electron |
| 调用 | 本机 loopback 只读状态 | 外网/模型/文件/会话/插件管理接口 |
| 范围 | FND-001 的 Host/Client/测试/证据 | 任何后续单元功能 |

### 8.2 回归检查

- 既有工作区可点击、可切换、无白屏。
- 既有会话可打开（不要求模型回复；模型未配置记 NOT_RUN，不记 PASS）。
- 只有一个新增入口/面板。
- `verify-plan.mjs` 退出码 0。
- 变更文件与批准清单一致；`DSH_HOME` 无业务数据文件。

---

## 9. 独立复核与证据格式

### 9.1 结果定义

| 状态 | 含义 | 计入通过？ |
|---|---|---|
| `PASS` | 命令真实执行、退出码符合预期、全部断言满足，证据绑定当前候选 | 是 |
| `FAIL` | 真实执行后至少一个断言不满足；附最小复现与预期/实际 | 否；修复后重跑 |
| `NOT_RUN` | 未执行（含“计划中”“没时间”“应该没问题”） | 否 |
| `BLOCKED` | 因具体外部条件无法执行（缺运行时、无浏览器、端口被占、无权限），附最小解除条件 | 否 |

规则：
- 不得用 `PASS` 覆盖未执行的子断言；一条测试内存在未覆盖子项时，结论必须写清覆盖范围。
- `BLOCKED` 不等于失败，也不等于通过；本单元门槛未满足时只能报 BLOCKED/FAIL。
- 实现者自测结果必须标 `executor=implementer, self_test=true`，不得计入独立验收。
- 同一结论只能绑定一个候选；候选变化后旧结论对受影响项失效（§9.3）。

### 9.2 运行记录模板（每条测试一份，JSON 或严整表格）

```json
{
  "unit_id": "FND-001",
  "instruction_revision": "2.0.0",
  "role": "independent-tester",
  "test_id": "T02",
  "result": "NOT_RUN",
  "evidence_kind": "real",
  "candidate": {
    "commit": "<sha>",
    "tree": "<tree-sha>",
    "dirty": false,
    "manifest_sha256": "<manifest-or-null>",
    "key_file_hashes": {"<path>": "<sha256>"}
  },
  "runtime": {
    "dsh_version": "0.2.2-rc.3",
    "upstream_commit": "39163dd30f703a79079e2d2446545cff3c453738",
    "package_sha256": "<sha256>"
  },
  "environment": {
    "os": "<Windows 版本>",
    "node": "<版本>",
    "pnpm": "<版本>",
    "port": 3099,
    "dsh_home": "<DSH_HOME>",
    "profile": "knowledgeos-test",
    "browser": "<名称/版本>"
  },
  "command": "<实际命令或 UI 操作序列>",
  "started_at": "<ISO8601>",
  "ended_at": "<ISO8601>",
  "exit_code": null,
  "expected": "<预期>",
  "actual": "<实际>",
  "evidence": ["runs/<candidate>/T02/status-a.json"],
  "limitations": "<不能证明什么>",
  "executor": "independent-tester",
  "self_test": false
}
```

### 9.3 候选绑定与失效

冻结候选时记录：

```powershell
git rev-parse HEAD | Tee-Object "$run\candidate-commit.txt"
git rev-parse "HEAD^{tree}" | Tee-Object "$run\candidate-tree.txt"
git status --porcelain | Tee-Object "$run\candidate-dirty.txt"
git diff --name-status 6f23735..HEAD | Tee-Object "$run\candidate-files.txt"
Get-FileHash "<PLUGIN_DIR>\package.json","<PLUGIN_DIR>\dist\<entry>" -Algorithm SHA256 |
  Format-Table -AutoSize | Out-String | Set-Content "$run\candidate-hashes.txt"
```

- 存在未提交文件时，必须额外生成 manifest（路径 + SHA256）并写 `dirty=true`；不得只写 HEAD 名称。
- 测试开始后停止修改候选；任何源码/测试/配置变化都会使已产出的证据对变化部分失效。
- 修复后生成新候选标签（例如 `cand-<newsha>-<hash8>`），只重跑失败项与受影响回归。

### 9.4 证据目录

```text
docs/evidence/FND-001/
├── test-plan.md                  ← 本文件
├── candidates/<candidate>.json   ← 候选清单
├── runs/<candidate>/
│   ├── env.json
│   ├── candidate-*.txt
│   ├── host/
│   ├── tools/                    ← 观测工具（非产品/测试源码）
│   ├── T01/ … T07/
│   └── screens/
├── fixtures/                     ← 故障夹具（必须标注 FIXTURE）
└── report.md                     ← 主管最终报告（本角色不写）
```

### 9.5 脱敏

- 不提交：启动 token、Cookie、`entry.url.local`、`cookies.local.txt`、会话正文、真实教材/私人数据。
- 绝对路径统一替换为 `<REPO>`、`<DSH_HOME>`；截图中的 URL token 必须遮挡。
- 公开证据只放脱敏摘要；原始日志/截图如含敏感内容留在本机并在报告中说明。
- 不得把环境变量整段复制进证据。

### 9.6 独立性

- 本角色不修改产品/测试代码；只写测试计划、观测工具、夹具与证据。
- 实现者负责实现与自测；其“通过总结”不能作为独立验收依据。
- 主管冻结候选、确认证据绑定、作出最终门槛结论；产品代码作者不能单独决定通过。
- 若某能力缺失（无浏览器、无 Playwright），如实写 `BLOCKED`/局限，不以实现者截图替代。

### 9.7 汇总表（初始状态）

| 测试 | 状态 | 候选 | 退出码 | 证据 |
|---|---|---|---|---|
| T01 真实加载 | NOT_RUN | — | — | — |
| T02 真实往返 | NOT_RUN | — | — | — |
| T03 失败与重试 | NOT_RUN | — | — | — |
| T04 生命周期 | NOT_RUN | — | — | — |
| T05 回归与范围 | NOT_RUN | — | — | — |
| T06 构建与类型 | NOT_RUN | — | — | — |
| T07 数据边界 | NOT_RUN | — | — | — |

---

## 10. 本单元通过门槛

1. T01–T07 全部有 `PASS` 记录，且每条绑定同一冻结候选（或修复后重新绑定）。
2. 至少以下“真实”证据齐全：T01 源码构建进程/页面、T02 真实往返+重启实例变化、T03 真实断连+恢复、T04 真实卸载后路由消失、T07 未认证拒绝。
3. 所有夹具证据均已标注，且未被计入 T01/T02/T07 或真实断连结论。
4. 证据包含命令/操作、开始结束时间、退出码、实际结果、环境与候选指纹。
5. 实现者自测被明确标注且不替代独立复核。
6. 桌面 DSH 未被停止/重启；用户工作树未被破坏。
7. 无 `FAIL` 未修复；无把 `NOT_RUN`/`BLOCKED` 写成 `PASS`。
8. 未引入范围外功能与依赖；未把本单元通过升级为 F01/F04/A01/A50 完整通过。
9. 运行时为 `.cache\build\dsh-39163dd`（从锁定源码构建），不是 `.cache\runtime-rc3`；响应恰好 10 字段，且 `upstream_commit=expected_upstream_commit=39163dd30f703a79079e2d2446545cff3c453738`、`upstream_commit_verified=true`、`status=ok`；`unknown`/`false`/`null` 不算通过。
10. 构建证据 = 上游 `build:artifacts` 成功 + 插件 `npm typecheck/build` 成功 + 产物哈希与实际加载一致；`build:check` 未运行不阻断本单元。
11. 浏览器验证为系统 Chrome/Edge + Playwright；桌面冒烟 `NOT_RUN` 已由主管接受，不阻断本单元。

任一条件不满足：本单元不得报通过；按实际记 `FAIL`/`BLOCKED`，等待修复或主管裁定。

---

## 11. 主管已决定与剩余待确认

### 11.1 已决定（v0.2 生效）

| 项 | 决定 |
|---|---|
| 运行时 | 使用 `.cache\build\dsh-39163dd`（锁定源码构建）；`.cache\runtime-rc3` 因 client-modules 内嵌 commit `6b729fe` ≠ 锁定 SHA，**不使用** |
| 启动方式 | 在 `$build` 根目录执行 `node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test web --port 3099 --no-open`；`DSH_HOME=.cache\dsh-home-fnd001` |
| 入口/路由 | 侧栏标签 `知识库`，`PANEL_ID=knowledgeos`，exact `GET /knowledgeos/status`（无前缀） |
| 契约 | 恰好 10 字段；`status` 本单元仅 `ok`；`upstream_commit` 必须等于锁定 SHA，`unknown` 记 FAIL；`upstream_commit_verified` 必须为 `true` |
| 实例标识 | 插件实例（等同 Host 进程重启）必变；同一进程内多次查询不变 |
| 浏览器 | 系统 Chrome/Edge + Playwright（`channel` 或 `executablePath`）；不用 Electron；桌面冒烟 `NOT_RUN` |
| 写入范围 | 允许写 `docs/evidence/FND-001/fixtures/` 与 `runs/<candidate>/`；不得改产品代码或 `packages\knowledgeos-panel` |
| 构建证据 | 上游 `build:artifacts` 成功 + 插件 `npm typecheck/build` 成功 + 产物哈希与实际加载一致；`build:check` 非强制 |
| 刷新/重试 | 可为同一按钮语义；断言必须观察到新的 `checked_at` |
| 夹具 | F1/F2/F3 与真实断连分开记录 |

### 11.2 剩余待确认（冻结/执行时）

1. 若主管给定启动命令被 CLI 解析拒绝（例如 `web` 的位置），是否允许按固定运行时 `--help` 调整；本计划要求记录差异并经主管确认，不自行改写。
2. Playwright 未安装时的获取方式（可安装到证据工具目录，不修改插件 `package.json`），以及实际 `channel`/`executablePath`。
3. `upstream_commit_verified=false/null` 时页面“信息不匹配”的具体文案与本计划按 T01 FAIL 处理的边界，请确认文案要求。
4. 标签 `知识库` 若与固定 DSH 既有同名项冲突，唯一识别以 `PANEL_ID=knowledgeos` 还是 DOM 属性为准；执行时记录实际选择器，避免计数歧义。

---

## 12. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-11-16 | v0.1 | 实现前建立；T01–T07 预期、契约、夹具边界、证据格式；全部 NOT_RUN |
| 2026-11-16 | v0.2 | 按主管决定：运行时改为 `.cache\build\dsh-39163dd` 源码构建；契约改为恰好 10 字段并新增 `expected_upstream_commit`/`upstream_commit_verified`；入口 `知识库`/`PANEL_ID=knowledgeos`；Playwright Chrome/Edge；允许 evidence 写入范围；`build:check` 非强制；`unknown`=FAIL；全部仍 NOT_RUN |
