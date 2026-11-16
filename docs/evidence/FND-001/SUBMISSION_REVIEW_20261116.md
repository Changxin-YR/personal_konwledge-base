# FND-001 第一轮提交复核记录

> 后续关闭结果：R1–R4 已在修复候选 2774b18 上完成收尾，提交 6ded30f 已通过本轮证据复核。当前状态为 passed / awaiting_user，见 [验收复核](ACCEPTANCE_REVIEW_20261116.md) 和 [最终报告](REPORT.md)。下文完整保留首次复核时的事实；OPEN 和 in_progress 描述当时状态，不是当前未完成项。

日期：2026-11-16（Asia/Shanghai）。复核对象：开发分支 `dsh/knowledgeos-fnd-001` 的提交 `66388994d41972e6dfd4e28361ac1854b5b12e47`。

**结论：真实基础接入已经实现，完整验收待补齐。** 当前功能需要小范围修正与补验，暂不激活 FND-002。本文件是证据记录，唯一执行入口仍为根目录 `DSH_START.md`。

## 1. 复核范围与实际执行

读取代码、第一轮报告、独立验证记录、测试计划和关键原始 JSON/日志；并行复核当前切片的源码/架构与验收证据，并核对固定上游 CLI 和 PowerShell 官方实现。没有在用户 Windows 环境重新运行 DSH，没有执行本轮产品修复或端到端测试，也没有开启未来 Codex 全面审查阶段。

在本地隔离基准副本上核对 59 个非 runs 文件的 Git blob 哈希，全部与该提交一致；实际运行计划校验、功能范围扫描、9 个 JavaScript 文件语法检查，退出码均为 0。这些只证明文件/配置/语法一致，不代替产品行为验收。

## 2. 已有成果保留

| 范围 | 仓库证据支持的结论 |
|---|---|
| T01 / T02 | 真实 DSH Web profile 加载单面板；页面与响应 8/8 对应；同实例查询时间前进，重启后实例变化 |
| T03 | 真实断连、旧数据标记、恢复和重试有记录；500 注入标为夹具 |
| T04 已执行部分 | 1 次重载、5 次进出、15 秒无状态轮询；Host 行禁用后 404，恢复后 200 |
| T05 / T06 | 基本导航、范围和类型检查有记录；上游 build:artifacts 原日志 8 gates 通过 |
| T07 | 原始 summary 为匿名 401、无效 Cookie 401、认证 200、POST 405；契约和禁止内容检查退出码 0 |

浏览器复测 `runs/37ac57a/browser-rerun/summary.json` 的 18 个实际步骤通过。该计数不覆盖脚本没有执行的完整卸载和更长测试窗口。产品 `37ac57a` 与测试脚本修复 `22e7be2` 的分开绑定可保留；G1 失败与成功复测均有记录。本次复核不推翻这些成果。

## 3. 收尾项

| ID | 首次复核时状态 | 已确认事实 | 影响 |
|---|---|---|---|
| R1 | OPEN | 原 test-plan §6.4 D5/D6、§10 要求真实插件卸载后路由/入口消失；报告承认未执行。计划 5/10/60 秒实际为 1/5/15 秒 | T04 完整门槛缺证据，Host 行禁用不能替代 Client bundle 卸载 |
| R2 | OPEN | Panel.tsx 的 refresh 保留数据进入 loading，连接状态行却仅区分 ready 与其他状态 | 正常刷新时显示“旧数据（连接失败）”，与顶部“连接中”矛盾 |
| R3 | OPEN | candidate.md 的可复制 PowerShell 示例给 `$home` 赋值，再用于 DSH_HOME | 与只读自动变量冲突，不能可靠选择隔离目录；需专用变量及 Windows 复验 |
| R4 | OPEN | 包 README 在显式 profile 后仍含额外 web 位置参数；真实报告使用无该位置参数的固定源码入口 | 复验说明与实际入口不一致，需要统一并区分初始化与继续运行 |

R2 是源码可直接推出的状态显示问题，本次未在浏览器重新复现。R3/R4 是命令与官方实现核对结果，本次未在 Windows 运行错误示例。实际修复与运行结论由后续 DSH 收尾提供。

## 4. 来源

- [第一轮提交报告](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/docs/evidence/FND-001/REPORT.md)。
- [原测试计划](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/docs/evidence/FND-001/test-plan.md)：§6.4、§10 是 T04 门槛来源。
- [独立验证](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/docs/evidence/FND-001/independent-verification.md)、[浏览器复测原始记录](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/docs/evidence/FND-001/runs/37ac57a/browser-rerun/summary.json)。
- [面板源码](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/packages/knowledgeos-panel/src/client/Panel.tsx)：refresh 与 kos-connection 分支。
- [候选命令](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/docs/evidence/FND-001/candidate.md)、[包 README](https://github.com/Changxin-YR/personal_konwledge-base/blob/66388994d41972e6dfd4e28361ac1854b5b12e47/packages/knowledgeos-panel/README.md)。
- [PowerShell 大小写规则](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_case-sensitivity)：变量名不区分大小写；[HOME 初始化源码](https://github.com/PowerShell/PowerShell/blob/cb9cf48b76cf2fdafb2f2a5e4c64dad4da526486/src/System.Management.Automation/engine/SessionState.cs) 将 HOME 设为 ReadOnly / AllScope。
- [固定 DSH CLI](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/apps/cli/src/args.ts)：显式 profile 后的位置参数透传给应用，from-default-profile 为初始化选项。

## 5. 首次复核时的状态与边界（历史）

保留代码和原始运行记录，FND-001 重新登记为 in_progress（当前功能收尾待执行），唯一提示词更新为 v2.0.1。原完成日期作为第一轮提交者声明保留，不作为当前验收完成时间。其余 75 个单元仍 planned，Codex locked，auto_advance=false。

精确定时器全局归因可记录观测局限；Desktop、人工逐像素目检、全仓 build:check、Windows 安装、多人业务、真实 GPT 不新增为本轮阻塞。收尾只关闭四项问题并完成受影响回归。

首次复核当时的文档更新不表示问题已经关闭。后续 DSH 已完成修复与真实补验，关闭依据见本文件顶部链接；此处保留历史处理过程。
