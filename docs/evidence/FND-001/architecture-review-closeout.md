# FND-001 收尾轮 · 架构与契约审查（只读）

- 审查对象：候选 `2774b185ab75bfe38b6a36a07aa735d5ed4f559b`（R1/R2/R4 修复），证据提交 `e970f603b22790437f8cb828ad99464b9bcead82`
- 分支 / HEAD：`dsh/knowledgeos-fnd-001` / `e970f60`（工作树干净）
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738`（0.2.2-rc.3），固定源码 `.cache/build/dsh-39163dd`
- 角色权限：只读源码；本文件是唯一写入
- 审查日期：2026-11-16

## 1. 结论表

| 项 | 问题 | 结论 | 等级 |
|---|---|---|---|
| Q1 | R2 loading/ready/error 是否严格区分、能否乐观伪造成功、有无遗漏文案 | **通过（设计合格）**；仅证据标记与文案细节有 2 处小缺口 | 低 |
| Q2 | R1 是否真实 remove/reinstall、是否隔离 profile、卸载后是否验证 Host 可达与入口/路由消失、是否同一候选、失败是否留残 | **实现层面基本满足**，但“同一候选”与默认插件路径存在实质缺口；恢复非硬门槛 | 中 |
| Q3 | R3/R4 文档命令与固定源码 CLI 真实参数是否一致 | **通过**（显式 profile 后无 `web` 位置参数；`from-default-profile` 标注为仅首次）；README 少了构建提交注入 | 低-中 |
| Q4 | 是否引入范围外依赖/功能、是否破坏 Host 认证/只读边界 | **通过（未越界）** | 低 |
| Q5 | 未证实项与是否建议冻结 | **建议冻结候选供独立测试**；当前仓库无法给出 R1/R2 的 PASS（无本轮 run 证据） | 高（证据缺口） |

## 2. 逐项依据

### Q1 R2 状态机

依据 `packages/knowledgeos-panel/src/client/Panel.tsx`：

- 状态是显式三态判别联合，`loading` / `ready` / `error` 互斥，`loading` 与 `error` 都允许携带旧 `data`（L12–15）。
- 只有 `loadStatus()` **resolve 之后**才进入 `ready`（L111–113）；请求被 abort 时不写错误（L115）；`id !== requestId.current` 丢弃过期响应（L112），因此晚到的旧响应无法覆盖新状态。**不存在乐观伪造成功的路径**：`ready` 的唯一来源是真实 payload，UI 文本也从 payload 读取（L146、L199–204）。
- 刷新保留旧数据作为 `loading.data`（L108–110）；连接行三态分别为 `已连接本机 Host` / `正在刷新 · 显示上次结果` / `连接失败 | 旧数据（连接失败）`（L141–145）；状态胶囊为 `刷新中`（L138）；另有显式刷新说明条 `kos-refreshing`（L187–189）。这正是 DSH_START R2 要求的“刷新中显示正在刷新、当前为上次结果”。
- 失败态独立呈现：错误横幅 + 失败时间 + 重试按钮（L161–169），有旧数据时额外 `kos-stale` 提示（L148、L171），并说明“已失去实时性”（L166）。
- 刷新按钮在 loading 时 `disabled`（L211），UI 层不会叠加并发刷新。

小缺口（不影响结论）：
1. `loading` 且带旧数据时，`kos-verified` / 构建不匹配横幅仍按旧 payload 渲染（L173–185），仅由 L187–189 的说明条兜底；语义正确，但“正在刷新期间旧校验结论仍是当前结论”的措辞可以更收紧。
2. `closeout-e2e.mjs` 的 R2 断言用 `page.route` + 3s 延迟注入（L185–191），属受控夹具，但 `summary.r2`（L201）未写入 `fixture: true` 类标记，与 T03“区分夹具与真实断连”的证据习惯不一致；建议在 summary 里显式标注。

### Q2 R1 生命周期脚本

依据 `scripts/fnd001/closeout-e2e.mjs` 与固定源码 CLI：

- **真实 CLI，非禁用行**：`cli()` 走 `process.execPath --import tsx/esm apps/cli/src/bin.ts`（L71–77），卸载为 `plugin --profile knowledgeos-test remove knowledgeos-panel`（L264），重装为 `plugin --profile knowledgeos-test add <pluginPath>`（L298）；两者都断言 `status === 0`（L266、L300）。脚本中不存在把 Host 行改成 `disabled` 的替代路径。
- **只用隔离 profile/home**：所有 CLI 与 Host 子进程都注入 `DSH_HOME: home`（L73、L86），profile 显式传参（L32、L84）。但脚本没有断言 `home` 不等于默认 DSH_HOME、也没有记录 3099 端口归属与桌面 DSH PID，这属于证据层缺项，需在运行记录中补齐。
- **卸载后判定不靠“不可达”**：重启 Host 并解析入口 URL（L272、L182–183 的 `startHost`）才算启动成功；`startHost` 在子进程提前退出或超时时抛错并记为 `unexpected exception` FAIL（L107、L110、L334–339），不会把“服务器没起来”当成卸载成功。认证可用性用 `entryCookie()` 重新取 Cookie（L120–124、L273），路由消失判定要求“不再是我们的 JSON”（`stillOurJson` 为假，L280–283），避免了只看 404 的伪证。
- **入口/路由消失有双证**：DOM 断言入口 0、面板 0（L287–291），同时断言 DSH 自身导航仍渲染（`navButtons > 3`，L292）以排除“整页白屏也算卸载成功”；并保存截图与 `R1-after-remove.html`（L293–294）。
- **重装后恢复**：断言 bundle 层回归（L303）、路由 200 JSON（L309）、入口恰 1 个（L313）、面板恰 1 个可 `ready`（L315–316）。

实质缺口（需在独立测试前修掉或明确声明）：
1. **默认插件路径错误**：`pluginPath` 默认解析为 `join(dshRoot,'..','..','packages','knowledgeos-panel')`（L37），在 `dshRoot=.cache/build/dsh-39163dd` 下得到 `.cache/packages/knowledgeos-panel`，并非仓库内 `packages/knowledgeos-panel`。若不显式传 `--plugin`，重装会装错/装不上，进而把 profile 留在“已卸载”状态。必须在运行命令中显式传 `--plugin`，或修正默认值。
2. **“同一候选”未被证明**：脚本只用“路径相同”代表同一候选，未在重装前后比较 `lib/client.js` / `lib/index.js` 的 SHA256 是否等于候选记录（candidate.md 已给出该哈希）。`summary.r1.restored` 里的 `kos-version` / `kos-commit`（L318–323）是**上游 DSH 构建**身份，不是本插件候选指纹，不能替代候选同一性证明。
3. **恢复不是硬门槛**：`finally` 中若发现 bundle 缺失会重新 `plugin add`（L344–350），但恢复结果只写入 `summary.recovery`，未参与 `summary.failures`；恢复失败且此前步骤“恰好”未记失败时，存在“summary 报 PASS / 进程退出 0 而 profile 仍缺件”的理论窗口（L355、L358）。另外备份文件 `before-remove-*`（L260–262）只写不读，恢复后不与备份做差异比对。
4. 端口复用存在竞态：`stopHost()` 只 `kill()` + race 10s + 固定 `sleep(400)`（L113–118），同一 3099 连续三次启动之间没有“端口已释放”的确认，可能出现偶发绑定失败（表现为启动超时，不会伪造 PASS，但会降低可复现性）。
5. 生命周期覆盖面：5 次重载（L207–222）、10 次进出（L224–242）、60 秒静默（L244–253）均在**卸载之前**执行；重装后只验证“入口 1 / 面板 1 / 路由活”，没有重跑重载与静默断言。T04 的“重装后不重复注册”仅被 1 次装载覆盖，建议至少补 1 次重载后的入口计数。

### Q3 R3 / R4 文档命令

依据 `DSH_START.md`（L83–95）、`packages/knowledgeos-panel/README.md`、`docs/evidence/FND-001/candidate.md` 与固定源码：

- **R3 变量**：README 使用 `$knowledgeosRepo` / `$dshRoot` / `$dshTestHome`（L60–63），candidate.md 同样（L58–62），并只**读取**打印 `$HOME` 作为“未被改写”的对照（candidate.md L64），没有对 `$HOME`/`$home` 赋值或改属性。符合 R3。
- **R4 启动形状**：README 的运行命令是 `--profile knowledgeos-test --port 3099 --no-open`，无 `web`（L72–75）；candidate.md 一致（L66）。固定源码 `args.ts` 中 `--profile` 是 launcher 选项，其余 token 通过 `.argument('[args...]', "arguments for the booted profile's app")` 透传给 app（`apps/cli/src/args.ts` 第 140–210 行区间），因此显式 profile 之后追加 `web` 属于 app 参数而非 CLI 子命令——v2.0.0 的写法确实错误，本轮已纠正。脚本 `startHost` 的 argv 与之逐字一致（L84、L328）。
- **plugin 子命令顺序**：`plugin` 子命令把 `--profile` 声明为 `requiredOption`，其余 token 作为 pnpm 参数原样透传（`args.ts` 同区间；`plugin.ts` L89–L120 `runPlugin`）。README 的 `plugin --profile knowledgeos-test add <path>`（L70）与 `... remove knowledgeos-panel`（L81）与脚本实际调用（closeout-e2e.mjs L264、L298）一致，参数位置合法。
- **from-default-profile 仅初始化**：README 明确“First creation only / 不要重复”（L65–67），candidate.md 明示“只在首次创建 profile 时使用”（L69）；固定源码对应选项说明为“replace a custom profile with a fresh copy of a shipped profile template”（`args.ts` L169），且 `profile-boot.ts` L128 提示“omit --from-default-profile to use it”。语义一致。
- **残留不一致**：README 的 R4 段落没有 `$env:DSH_CLIENT_COMMIT_HASH = "39163dd…"`（对比 candidate.md L62、脚本 L73/L86）。照 README 逐字执行，Host 不记录构建提交，面板会进入“Host 未记录构建提交，无法核验”（Panel.tsx L180–184、L91），T01/T02 的“提交一致”只能靠脚本另行注入。**R4 的“统一启动说明”尚未把该契约写进 README**。
- **未证实**：README L72–73 称“stray `web` is rejected”。本次只确认“其余 token 归 app”（`args.ts` 的 `[args...]` 说明），未在固定源码 web app 参数解析处确认它是**报错拒绝**还是忽略，故该措辞暂按“未证实”对待（结论不依赖它，因为正确命令本身不含 `web`）。

### Q4 范围、认证与只读边界

- 产品改动仅 `Panel.tsx`（L133–148、L187–189）；Host 半未变（candidate.md L17 `lib/index.js` 未变、L21 “其余 Host/Client 文件未变”），`src/client/index.ts` 仍是 1 面板 + 1 侧栏入口（L24–34），`cordis.patch.yml` 仍是单行 `insert`（L6–8）。无新增路由、无新增字段、无 DB/账号/权限/RAG/导入/模型调用。
- 客户端未新增第三方运行时依赖：`Panel.tsx` 仅引 `react` 与本地 `status-client.ts`（L7–9）。测试脚本新增 `playwright` 运行时从外部 builder 目录动态 import（closeout-e2e.mjs L139），属测试侧外挂，不进入产品包。
- 认证/只读边界未被削弱：脚本以匿名 + 有效 Cookie 两种方式访问 `/knowledgeos/status`（L126–137、L273、L306），未绕过认证；未新增写接口；未改 profile 之外的文件。README 仍声明 `GET /knowledgeos/status (auth: 'required')` 且“不命名凭据/环境变量/路径/会话”（README L11、L35–36）。
- 证据卫生：脚本会把 Host 入口 URL 的 token 脱敏后再记录（L104），但 `host.log`（L45–46、L95）**原样保存 stdout**，其中包含带 token 的 `dsh web:` 行；提交前必须脱敏，属本次复核提醒项。
- 测试侧 DOM 手术：`dismissPreviewNotice` 直接删除 `.tvzg0a_root` 并移除 `inert` / `aria-hidden`（L144–152），仅作用于测试页，但会掩盖“预览提示是否真的挡住插件入口”的 UX 事实，需在报告里声明。

## 3. 风险清单

| ID | 风险 | 影响 | 处置建议 |
|---|---|---|---|
| A1 | 仓库 HEAD `e970f60` 下**没有本轮 run 目录**：`docs/evidence/FND-001/runs/` 仅有 `37ac57a`（首轮），无 `closeout-e2e.mjs` 的 `summary.json` | R1/R2 目前只有代码与脚本，**无执行证据**；不能据代码推断 PASS | 独立测试必须产出 `runs/<round>/summary.json` 后再关门 |
| A2 | `pluginPath` 默认值指向 `.cache/packages/knowledgeos-panel`（错误路径） | 若未传 `--plugin`，重装失败并把测试 profile 留在卸载态 | 修正默认值或强制要求 `--plugin`，并在 summary 记录实际安装路径 |
| A3 | “同一候选”未用 SHA256 证明 | 可能装的是别的检出却记成同一候选 | 重装前后比对 `lib/*.js` 哈希与 candidate.md |
| A4 | 恢复失败不计入 `failures` | 极端情况下“PASS 但 profile 未恢复” | 将 `summary.recovery` 非空/失败纳入退出码 |
| A5 | README 缺 `DSH_CLIENT_COMMIT_HASH` | 按 README 复验会落到“无法核验”而非“一致” | R4 收口时补该行并注明与 candidate.md 同源 |
| A6 | `host.log` 未脱敏含 token | 公开提交泄露测试凭据 | 归档前脱敏，或写入时即过滤 |
| A7 | 卸载后未重跑重载/静默断言 | T04“重装后不重复注册”覆盖偏薄 | 补 1 次重载计数即可 |
| A8 | 端口释放竞态（sleep 400ms） | 偶发启动超时，非伪 PASS | 启动前探测端口或改用随机高位端口 |

## 4. 未证实 / 明确不做

- 未证实：`--profile … web` 会被 CLI “拒绝”（只证实 token 归 app）；README 首建命令带 `--dump-config` 是否确实落盘初始化 profile（本次未追到 resolveBoot 写入点）。
- 未证实：R1 的 5 次重载 / 10 次进出 / 60 秒静默与真实卸载-重装的实际结果——**本轮仓库内无对应 run 证据**（见 A1），不能由脚本存在性替代。
- 未执行：脚本实跑、构建、类型检查、上游 build:check（不在本审查角色范围）；视觉差异；Windows 缩放矩阵。
- 本角色未修改任何产品代码、脚本、配置与状态文件。

## 5. 是否建议冻结 / 进入独立测试

- **建议冻结**：候选 `2774b18` 的产品侧改动范围正确（仅 R2 面板状态 + 文档/脚本），Host 半未变，无越界依赖，认证与只读边界完好；未发现需要继续改产品的架构性缺陷。
- **建议进入独立测试，但不得在此之前标记 passed**：先处置 A2/A3/A4（或至少在实跑命令中显式 `--plugin <repo>/packages/knowledgeos-panel` 并留证），再由独立测试在隔离 profile `knowledgeos-test` + `DSH_HOME .cache\dsh-home-fnd001` + 端口 3099 上运行 `closeout-e2e.mjs`，产出 `runs/<round>/summary.json`、DOM、截图与脱敏日志。
- **关门条件**：`summary.result === PASS` 且 `failures` 为空、`recovery` 为空、候选 SHA256 与 candidate.md 一致、`runs/<round>` 已提交；否则按 FAIL/NOT_RUN 记录，不得以旧证据替代。
