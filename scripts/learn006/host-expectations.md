# LEARN-006 独立 Host / Chrome / SQLite 验收预期

2026-11-26，从 `0649220` 的需求和交接写出。适用于同一冻结候选的主跑和独立复跑。此文件记录预期，实测结果以各次脱敏报告为准。

| 需求与观察点 | 可证伪的预期 |
| --- | --- |
| A10，Reader 双语境 | 作者导入 KNOW-001 的合成材料，授权甲乙。甲在真实 Reader 分别选数据库、数组段的「索引」。旁证含选词前的非 BMP 字符。每次检查通俗说明、专业定义、易混概念和当前语境依据。解释后查列表与 SQLite，只有点击显式保存才逐张增加。两张个人卡的版本、段落、转换、UTF-16 起止都与事前从夹具独立计算的位置相符。 |
| A10，个人积累 | 甲重新打开卡，编辑补充并刷新。原模型解释、引用、另一张卡和原文均保留。修订号反映成功写入，旧修订冲突不覆盖新值。能读同一资料的乙看不到、不能修改甲的卡。 |
| T01 / P03，题源 | 作者在共同项目发布已有题及对照题。正例的固定引用**包含甲实际选中的同一次词**。另设同段另一处同词、同坐标的另一资料版本、甲不可见的题。按卡列题与创建会话均须排除这些对照。数组卡无匹配题时也不能建立会话。 |
| T01 / P03，首答与辅助 | 甲在 Reader 从术语卡点进题库、选正例题并开始 guided 作答。首答提交前解析不可见。待 Host 接收首个错误答案，直接查 SQLite，再检查揭示顺序。请求提示再答对，首答、提示和后答分别保留。乙在普通题库从另一阅读位置做同一不可变题版，首答正确。核对两人的会话、提示、错题、筛选与 ACL。 |
| T01 / P03，返回 | 从甲的练习返回，及从个人复习/历史重开会话再返回，浏览器实际标记与 Reader 真实选区都应指回原资料、原版本、原转换、原段和同一 UTF-16 起止。位置从原始合成文本独立计算，同段另一处同词作为定位反例。乙自己的读取进度在两次返回后保持在另一位置。 |
| T02，收藏与失败 | 甲取消收藏后默认列表隐藏，`archived=1` 能找到。实际打开个人历史仍能回到原版。恢复后仍为同一卡。无效答案、重复及冲突请求、错版本和错来源拒绝应核对 SQLite；允许幂等重放，不能多出或覆盖会话、来源、首答、提示或错题。 |
| T02，换版、撤权及重启 | 在作者真实添加新版本后旧来源保持指向旧版。实际撤销甲的资料权限，重新读取页面及接口不能再展示受限原文、解释、题目或精确位置。乙仍可用同一题。原件、历史引用及既有个人答题记录在 SQLite 保留。实际停止并重启同一个 Host 数据目录，重新登录后再验可见性、隔离与旧记录。 |

每次用新 Host 目录、浏览器上下文、合成账号及数据库。主跑和独立复跑各自构造数据、从实际夹具和本人动作取得断言依据，留下候选提交与入口哈希、关键步骤、计数及受控截图。dry 仅证明本地链路及受控派送，真实语境推理另记 `NOT_RUN`。live 由外层 KNOW-001 控制器核对新候选清单和调用额度。外部调用、迁移回滚及跨单元矩阵的最终结论由对应验收证据单独核实。

## 运行与读数

在冻结候选 checkout 中运行。`KO_TEST_CACHE` 可指向根仓库的共享 `.cache`。参数为冻结 checkout、完整候选 SHA、构建入口 SHA-256、`main` 或 `independent`、`dry` 或 `live`。省略最后一项时执行 dry。两次运行串行，各自建立全新的三人账号、项目、资料授权、Host 数据库和 Chrome 上下文。

```powershell
$checkout = (Get-Location).Path
$candidate = (git -C $checkout rev-parse HEAD).Trim()
$entryPath = Join-Path $checkout 'packages/knowledgeos-panel/lib/index.js'
$entry = (Get-FileHash -LiteralPath $entryPath -Algorithm SHA256).Hash.ToLowerInvariant()
$runner = Join-Path $checkout 'scripts/learn006/host-reading-chain.mjs'
node $runner $checkout $candidate $entry independent dry
```

主跑选 `main`。独立复跑改变题目选项顺序、答案、宽引用和同词反例的位置，根据原文的 UTF-16 字节数另算选区，并用独立 SQL 对照推导可见题和两人首答、提示的归属。`live` 复用 KNOW-001 的候选清单、审核和两步许可，保留其原有调用边界。

- P03 的四项观测为 `TERM_AND_QUESTION_SOURCE`、`FIRST_ANSWER_AND_ASSISTANCE`、`TWO_USERS_PERSONAL_RECORDS`、`RETURN_TO_READING`。`reader_returns` 含每次点击后的页段、实际高亮 UTF-16 起止、原文和选区摘要。空题库、练习及解析分别通过 `#practice-term-reader`、`#quick-return-reader`、`#practice-feedback-return` 返回选词。`#practice-source` 打开更宽的题目引用。
- A10 的四项观测为 `REAL_DUAL_CONTEXT_EXPLANATIONS`、`DISTINCT_PINNED_SELECTIONS`、`EXPLICIT_PRIVATE_SAVES`、`EDIT_REOPEN_AND_REVIEW`。取消收藏后用 `#term-archive-toggle` 找回卡，从复习用 `#review-term-session` 回原会话。冷启动后甲先以已撤权身份验证，再由作者签发新的合成授权，回看原会话与两张卡。最后撤销这次新授权。
- 标准输出给出临时目录内 `summary.json` 的位置。目录中另有合成业务界面的局部截图和 dry 控制器生成的 `term-calibration.json`。`local_chain.T01/T02` 记录本地链路。dry 的 `real_inference_requests` 为零，完整 T01、T02、P03、A10 和真实双语境检查保留 `NOT_RUN`。失败报告含阶段、最后操作控件和脱敏错误位置。
