# EXPLAIN-001 独立验收预期

起点 `bf2dd1bdc33940e553a42cf617a4d843289d5ade`。预期依据 `config/work_units.json` 的 T01、T02，及 `docs/plan/07_ACCEPTANCE_MATRIX.md` 的 A20、P07。本单元覆盖 A20 的单文件业务解释、证据和未知点，以及 P07 的固定提交和可重现记录。A20 的模块和项目解释、P07 的完整工程诊断属于后续单元。

## 固定问题与独立答案

`fixture.mjs` 包含完整、可公开的合成输入。仓库 `fixture-lab/shipping-rules`，固定文件 `src/shipping-fee.js`，commit `61e02f2598f627b21a5d31d0bd3dc1ed6f82216f`，blob `a52c5e085ef41dcdcbf82660105276048bcaefd3`。行号从 1 开始，选中 2–6 行，原文保留缩进与 LF。树中另有 `src/unpinned.js`，没有保存其内容。两个 Git blob、两级 tree 和 commit 均由合成字节计算。

> 只根据选中行，shippingFee 负责什么？请在解读中分别写出 subtotal=50 和 subtotal=51 的实际运费（请用‘50→数值，51→数值’），说明注释与实现的边界是否一致。哪些外部模块调用它？请在局限中说明依据。

| 行 | 源码事实 | 对业务结论的作用 |
| --- | --- | --- |
| 2 | `// Free shipping at subtotal >= 50.` | 注释包含恰等于 50 的订单。 |
| 3 | `export function shippingFee(subtotal) {` | 单文件导出运费函数。导出声明本身不能证明具体调用者。 |
| 4 | `  if (subtotal > 50) return 0;` | 51 落入免运费分支。 |
| 5 | `  return 8;` | 50 走默认分支，实际运费为 8。 |

解读应基于实际实现说明职责、50→8、51→0 及冲突。局限应明确说明仅凭选中行无法识别外部调用者。可接受多个事实覆盖区间或一个合并区间，事实须逐字回读。解读中的依据编号从 1 开始，各编号必须指向本次的已核验事实。保存实际作答供独立复核。

## Host 操作与判据

1. 使用同一冻结候选与 entry 构建哈希。主跑与独立复跑分别用全新的 Host 数据目录、Chrome 会话和业务账号，串行冷启动。在隔离 SQLite 中通过正常 `ProbeStorage.repositories.saveSnapshot` 仅保存指定 blob。核对快照归属、commit、目录、blob、原始字节与固定文件数。
2. T01/T02 共用一次真实页面操作。在仓库页面点快照，再点固定文件，填写行段与上面的问题，只提交一次。核对浏览器 POST 的业务身份和七个入参。解析 `data.explanation` 的 `source/facts/interpretations/limits/provider/model`，与页面内三个可见分组和模型派送凭证对照。事实仅含选中原文，业务判断放在解读，缺失调用上下文放在局限。拒绝错误边界、臆造调用、无效事实编号和越界引文。
3. 逐条点击事实的回读按钮，观察页面发出的 citation GET。按该条事实的范围逐字段比对 `data.citation`，并严格比较 `#citation-readback.textContent` 与本地预期，核对 `#citation-location` 和 `#citation-link`。记录可重开的同源页面链接，刷新与重启使用该链接。所有回读及拒绝操作的额外模型派送数均为零。
4. 两套独立浏览器身份。另一真实业务用户对同一快照的 explain/citation 以及固定链接得到拒绝，匿名读写也应拒绝。所有者分别提交错误 commit、错误 blob、树内但未固定路径、非法行段，均应返回业务错误，响应中没有答案、源码或定位泄漏。重新检查 SQLite 的固定文件集合。
5. 先停止 Host，再用相同隔离数据目录启动新进程。新 Chrome 会话登录后，直接打开页面生成的固定链接，验证同一段原文、位置、持久化字节。核对零额外业务模型请求及 SQLite 完整性。保留分组截图、点击回读、重启回读及独立运行结果。
6. dry 的网络、UI、SQLite 结果单独记录。live 必须提供冻结候选与实际路由的单次请求和成功响应凭证，并通过相同业务断言。候选、构建、脚本哈希、模式、实际答文、检查项、失败阶段、净化后的证据文件各自留存。缺口记录为 NOT_RUN 或 BLOCKED，断言失败为 FAIL，成功为 PASS。源码中的测试预期不代表任何一次实跑结果。
