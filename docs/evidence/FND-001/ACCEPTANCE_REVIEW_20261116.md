# FND-001 收尾提交验收复核

日期：2026-11-16（Asia/Shanghai）。复核提交：`6ded30f2a1dacec8b4f6b977ee3d2ccbd503df4f`；产品候选：`2774b185ab75bfe38b6a36a07aa735d5ed4f559b`；测试脚本候选：`c2a6d4335a3947546815543cdc17ef992c8d74ae`。

**结论：PASS，仅限 FND-001。R1–R4 的本轮产品与运行门槛已经满足，无须再启动产品返工轮。** 当前应保持 `passed / awaiting_user`，下一单元尚未激活。

## 1. 本次复核范围

读取修复差异、当前生产源码和产物、收尾独立报告及原始运行 JSON，核对卸载/重装前后的候选身份、会话有效性、测试次数/时长和真实失败回归。本次没有在用户 Windows 主机重新运行 DSH；运行结论基于已提交的真实测试记录与源码交叉核对。未启动未来 Codex 全面审查阶段。

## 2. 四项问题关闭依据

| 项目 | 结论 | 已核对证据 |
|---|---|---|
| R1 | CLOSED | closeout-v3 23/23 步通过；5 次重载、10 次进出均单入口/单面板，10 轮挂载各 1 请求；离开 60 秒为 0 请求/0 pageerror。真实 CLI remove/add 退出 0，依赖与 bundle 层实际移除/恢复；卸载后入口/面板为 0，重装后各 1，recovery 数组为空 |
| R1 会话反证 | PASS | 独立 remove-auth-probe 13/13：卸载后新 Host 的根路由在有效 Cookie 下为 200、匿名为 401；同一会话下特性路由为 404，排除了停机或失效 Cookie 的假通过 |
| R2 | CLOSED | 源码与 Client 产物已区分 loading/ready/error；受控 F2 延迟中显示刷新中及上次结果，随后查询时间前进；同候选 browser-v3 18/18，真实断连、错误/过期和恢复仍有效 |
| R3 | CLOSED | 可复制命令改用 dshTestHome；全新 PowerShell 5.1 原始输出中 HOME 不变、DSH_HOME 隔离且位于项目测试目录，未要求额外安装 PowerShell 7 |
| R4 | CLOSED | 固定源码入口真实启动，CIM 记录 argv 无多余 web、无初始化参数，版本 0.2.2-rc.3，认证状态请求 200；首次初始化与继续运行已区分 |

23、18、13 分别是三组脚本的实际步骤数，不等于 54 个独立业务验收场景。定时器运行期精确计数等明确 NOT_RUN 项没有被计为通过。

## 3. 同一候选与证据适用性

卸载前后实际 profile 均指向本仓库插件，Host 产物 SHA256 为 `22757b15…`，Client 为 `f0eb568f…`，与本轮候选一致。完整 SHA256 可在 candidate.md 与原始 JSON 中追溯。

产品候选 2774b18 至被复核提交 6ded30f 的后续 packages 变更仅 README，生产源码与产物未在运行验收后继续变化。测试脚本修复单独绑定 c2a6d43，原失败证据保留，没有将第一轮旧 Client 结果冒充本轮修复证据。

## 4. 本次直接同步的记录

已发现的剩余问题属于文档与状态一致性，按本次复核直接同步：

- work_units 的 open_review_items 清空，R1–R4 记录为已关闭；保留首次复核和 reopen 的历史信息。
- execution_state 的 state_reason/review_record 指向本轮通过结论；unit_state 保持 awaiting_user，active_unit 保持 FND-001。
- 根 README 从“待收尾”同步为当前已通过；首次提交复核的 OPEN 表标明是当时历史，并链接当前结论。
- 包 README 将 `cd $dshRoot` 移到第一条相对源码 CLI 命令之前，修正首次初始化/安装示例的目录顺序；未改命令参数、产品代码或测试产物。
- 区分上游构建 pnpm 11.28.5 与原始 remove/add stdout 显示的 profile CLI pnpm 11.22.0，避免将两者写成同一环境值。

这些记录同步不要求重新运行已经通过的产品测试，也不代表修改后的文档曾在 Windows 上被本次复核者重新执行。实际运行证据仍绑定上面列出的产品和测试候选。

## 5. 证据入口

- [最终报告](REPORT.md)、[独立收尾报告](independent-verification-closeout.md)、[候选记录](candidate.md)。
- [生命周期与刷新原始结果](runs/2774b18/closeout-v3/summary.json)。
- [卸载后认证有效性的独立证明](runs/2774b18/remove-auth-probe/remove-auth-probe.json)。
- [真实断连与恢复回归](runs/2774b18/browser-v3/summary.json)。
- [PowerShell 隔离结果](runs/2774b18/R3/R3-output.json)、[固定源码实际启动](runs/2774b18/R4-launch/R4-launch.json)。
- [首次复核历史](SUBMISSION_REVIEW_20261116.md)。

## 6. 通过边界

通过范围为一个真实 DSH Web 面板、只读 Host 状态链路及本轮约定的生命周期/失败恢复。Desktop、Windows 安装包、真实 GPT、多人身份、完整知识库业务、全局定时器归因和全仓检查不因此变为已验证。F01/F04、A01/A50 保持局部前置证据，不标记完整需求或场景通过。

保持 auto_advance=false、Codex locked，FND-002 及其余工作单元未激活。下一单元只有用户明确选择后才能替换唯一执行指令。
