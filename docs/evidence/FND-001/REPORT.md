# FND-001 最终报告

- `unit_id`: **FND-001**
- `instruction_revision`: **2.0.1**（收尾轮；第一轮为 2.0.0，记录保留在 Git 历史与下方链接）
- `executor`: **DeepSeek Harness**
- `result`: **PASS（R1–R4 关闭后的本单元切片）**
- 本轮产品候选：`2774b185ab75bfe38b6a36a07aa735d5ed4f559b`
- 本轮测试/证据提交：`c2a6d4335a3947546815543cdc17ef992c8d74ae`（harness v4）+ `f25726fc7e4314ac6b385bc7976c0014203a28f6`（尾换行）
- 本轮证据归档提交：`106f02ff5142a196319579442902994ebab8801e`（报告/状态/`runs/2774b18/`）
- 第一轮历史：产品 `37ac57af64b6741d82ffa2663b43dc244529c567`、测试脚本 `22e7be2ffc1b1db6fe8247bb223e69ec6c7ecb5d`、提交 `66388994d41972e6dfd4e28361ac1854b5b12e47`
- 工作分支：`dsh/knowledgeos-fnd-001`
- 上游固定提交：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）
- 本轮独立结论：[independent-verification-closeout.md](independent-verification-closeout.md)；复核依据：[SUBMISSION_REVIEW_20261116.md](SUBMISSION_REVIEW_20261116.md)

## 1. 收尾结论

第一轮已实现真实单面板与 Host 只读状态往返；本轮在同一 FND-001 内关闭仓库复核提出的 R1–R4，并保留原功能、原证据与 G1 历史：

| 项 | 结果 | 实际证据 |
|---|---|---|
| R1 真实卸载/重装与完整生命周期 | **PASS** | 5 次整页重载、10 次进出均入口/面板各 1；每次挂载恰好 1 次状态请求；离开 60 秒 0 请求/0 pageerror；固定源码 CLI `plugin --profile knowledgeos-test remove` 后重启 Host，有效认证下路由 404、入口/面板 0、导航仍可用；同一路径 `add` 重装后路由 200、入口/面板各 1，卸载前后 `lib/index.js`/`lib/client.js` SHA256 相同 |
| R2 刷新期间不得显示连接失败 | **PASS** | 受控 3 秒延迟下 loading 显示“正在刷新 · 显示上次结果”“刷新中”，无“失败”文案；随后成功且 `checked_at` 前进；真实断连仍显示错误/过期，重试恢复 |
| R3 PowerShell 复验变量 | **PASS** | 全新 Windows PowerShell 5.1 进程中 `$HOME` 前后均为 `C:\Users\27363`；`$env:DSH_HOME` 指向 `.cache\dsh-home-fnd001`；`$home` 赋值被只读拒绝；candidate/README/test-plan 改用 `$dshTestHome` |
| R4 固定源码启动说明统一 | **PASS** | 实际启动 argv 为 `--import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open`，无 `web` 位置参数、无 `--from-default-profile`；CLI `-V` 为 `0.2.2-rc.3`；`--from-default-profile web` 仅标注首次初始化 |

本轮未新增业务功能；仍只有一个侧栏入口、一个主面板、一条只读 Host 路由。

## 2. 分支、提交与环境

| 项目 | 值 |
|---|---|
| 分支 | `dsh/knowledgeos-fnd-001` |
| 本轮产品提交 | `2774b185ab75bfe38b6a36a07aa735d5ed4f559b` |
| 本轮测试脚本 | `c2a6d4335a3947546815543cdc17ef992c8d74ae`（harness v4） |
| 本轮证据/文档 | `f25726fc7e4314ac6b385bc7976c0014203a28f6` |
| 上游 | `39163dd30f703a79079e2d2446545cff3c453738`，`0.2.2-rc.3` |
| 运行时 | `.cache/build/dsh-39163dd`，由锁定源码复制；本轮复核 13912 个源文件与上游检出逐字节一致（树摘要 `2a2a46c8…`） |
| OS / Node / pnpm | Windows 11 Pro / `v24.22.0` / `11.28.5` |
| 独立 DSH_HOME / profile / 端口 | `.cache/dsh-home-fnd001` / `knowledgeos-test` / `127.0.0.1:3099` |
| 桌面 DSH | PID 51900，启动时间 `10:36:09` 全程未变；62739 仍监听 |

## 3. 本轮证据

新证据目录：`runs/2774b18/`。

| 证据 | 路径 | 结果 |
|---|---|---|
| R1/R2 生命周期与刷新 | `runs/2774b18/closeout-v3/summary.json`、`R1-*.png`、`R2-refreshing.png` | 20 步全 PASS；`result: PASS`，`recovery: []` |
| R1 失败与旧版脚本问题 | `runs/2774b18/closeout/`、`closeout-v2/` | 保留第一次脚本缺陷证据，不计产品失败 |
| R2 回归（真实断连） | `runs/2774b18/browser-v3/summary.json` | 18 步 PASS |
| Host 契约 | `runs/2774b18/host-contract/` | 同实例/重启契约 exit 0；匿名 401、认证 200 |
| 卸载认证边界 | `runs/2774b18/remove-auth-probe/` | 13 项 PASS：有效 Cookie 200、伪 Cookie 401、卸载后特性路由 404 且 Host/导航可达 |
| R3 | `runs/2774b18/R3/` | HOME 不变、DSH_HOME 隔离 |
| R4 | `runs/2774b18/R4-launch/`、`closeout-v3/summary.r4` | 真实 argv 无 `web`；CLI 版本正确；首次初始化参数未复用 |
| 固定源码一致性 | `runs/2774b18/source-tree-closeout.json` | PASS，两树摘要相同 |
| 最终检查 | `runs/2774b18/final-checks/` | `verify-plan`、`scope-check`、插件 `tsc` 均 exit 0 |

第一轮证据保留在 `runs/37ac57a/`，包括 G1 失败与修复复测；旧结论只在其候选/版本范围内有效。

## 4. T01–T07 映射（本轮）

| ID | 本轮结果 | 依据 |
|---|---|---|
| T01 | PASS | 固定源码 `0.2.2-rc.3`，页面 origin 3099，侧栏入口/主面板真实加载；源码树与锁定检出一致 |
| T02 | PASS | Host 契约同实例时间前进、重启实例变化；页面刷新取得新 `checked_at`；重装后实例为新值 |
| T03 | PASS | 真实断连 error+stale、断连中重试仍失败、重启后恢复；F1 500 夹具与 F2 延迟夹具均标注 |
| T04 | PASS（本轮补齐） | 5 次重载、10 次进出、60 秒静默、真实 bundle 卸载/重装、路由/入口移除与恢复 |
| T05 | PASS | `verify-plan`/`scope-check` exit 0；卸载后导航仍可用；范围未扩大 |
| T06 | PASS（本轮范围） | 插件 `tsc --noEmit` exit 0；重建后 `lib/client.js` 与 candidate 一致；未重跑全上游构建/`build:check` |
| T07 | PASS | 匿名/伪 Cookie 401、认证 200、POST 405、恰好 10 字段、无凭据/路径/会话；仅 loopback |

## 5. 缺陷与修复

| ID | 类型 | 内容 | 处置 |
|---|---|---|---|
| R2 | 产品缺陷 | refresh 进入 loading 时连接状态行误显示“旧数据（连接失败）” | 已修 `Panel.tsx`：loading 区分“正在连接/正在刷新·显示上次结果”，chip“刷新中”，刷新期间不出现失败文案；真实失败仍显示失败与过期 |
| G1 | 测试脚本（第一轮） | 恢复点击命中全局连接指示器 | 第一轮已修复，历史保留 |
| G2 | 测试脚本（本轮） | closeout summary 缺 `fixtures` 字段，R2 前抛 TypeError | `c2a6d43` 修复并复跑 |
| G3 | 测试脚本（本轮） | closeout 默认 plugin 路径少一级；恢复未纳入门槛；未比较卸载/重装产物 | `f3aa05f`/`c2a6d43` 修复：默认路径、前后 SHA256、恢复即失败、F2 标注、写入即脱敏 |
| G4 | 证据/计划 | architecture-review-closeout 末尾缺换行导致 `verify-plan` exit 1 | `f25726f` 修复，最终 exit 0 |

## 6. 剩余限制（NOT_RUN / 不新增门槛）

- Desktop Electron 冒烟：NOT_RUN（本单元最低门槛为 Web profile）。
- 人工逐像素审美：NOT_RUN（当前模型无图像输入；截图保留给用户）。
- 全局定时器精确归因：未做；以“离开面板 60 秒 0 本功能请求/0 pageerror”为观测边界，不冒称全局内存审计。
- 上游 `build:check`、全仓测试、Windows 安装包、多人业务、真实 GPT：NOT_RUN，属于后续单元。
- 第一轮 T01 的 client 模块字节哈希单项仍未补；本轮以产物 SHA256 与页面真实加载作为证据。

## 7. 用户复验步骤

```powershell
$knowledgeosRepo = "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
$dshRoot = "$knowledgeosRepo\.cache\build\dsh-39163dd"
$dshTestHome = "$knowledgeosRepo\.cache\dsh-home-fnd001"
$env:DSH_HOME = $dshTestHome
$env:DSH_CLIENT_COMMIT_HASH = "39163dd30f703a79079e2d2446545cff3c453738"
cd $knowledgeosRepo

# 计划与范围
node scripts/verify-plan.mjs
node scripts/fnd001/scope-check.mjs .

# R1/R2 收尾（自动起停隔离 Host，需 Chrome）
node scripts/fnd001/closeout-e2e.mjs --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --playwright ".cache\panel-builder\node_modules\playwright" --plugin "packages\knowledgeos-panel" --out ".cache\manual-recheck\closeout"

# 受影响回归
node scripts/fnd001/browser-e2e.mjs --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --playwright ".cache\panel-builder\node_modules\playwright" --out ".cache\manual-recheck\browser"
node scripts/fnd001/host-contract-run.mjs --dsh-root ".cache\build\dsh-39163dd" --home ".cache\dsh-home-fnd001" --profile knowledgeos-test --port 3099 --out ".cache\manual-recheck\host-contract"
```

手动运行（固定源码，不依赖全局 `dsh`）：

```powershell
cd $dshRoot
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open
```

首次初始化才使用 `--profile knowledgeos-test --from-default-profile web --dump-config`；继续运行不得重复。启动日志中的 token 只用于本机打开，归档前脱敏。

## 8. 停止状态与历史

- FND-001：`passed`；`execution_state.unit_state=awaiting_user`；`active_unit` 保持 FND-001；`auto_advance=false`；Codex locked。
- 未激活 FND-002，未合并 main。
- 第一轮报告与复核历史：[independent-verification.md](independent-verification.md)、[runs/37ac57a/](runs/37ac57a/)、[SUBMISSION_REVIEW_20261116.md](SUBMISSION_REVIEW_20261116.md)。其通过范围仅覆盖当时候选；本轮补验不改写为“之前已测”。
- 本单元通过不等于 F01、F04、A01、A50 的完整需求或完整场景全部验收。
