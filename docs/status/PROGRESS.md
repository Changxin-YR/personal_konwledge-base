# 实际进度

更新：2026-11-16（Asia/Shanghai）。现行执行规范 v2.0.1（FND-001 收尾轮）。

## 当前执行方式

当前执行者：**DeepSeek Harness**。当前唯一入口：`DSH_START.md`。唯一已选单元：**FND-001**。执行状态 `awaiting_user`；本单元功能切片 `passed`，下一单元未激活。

多智能体在同一功能内分担主管、架构、实现和独立测试。每次完成本功能的开发、测试与返修后提交报告并停止，由用户选择下一单元；不自动跨段。

Codex 全面检查修复阶段：**locked**。基础开发与逐功能测试完成后，才能由用户激活；当前不提供 Codex 可执行提示词。

## FND-001 收尾结果（2026-11-16，v2.0.1）

**PASS（本单元切片，R1–R4 已关闭）。** 在从锁定提交 `39163dd30f703a79079e2d2446545cff3c453738` 构建的真实 DSH `0.2.2-rc.3` 上，同一面板/Host 只读链路完成真实卸载与重装、完整生命周期、刷新状态修复、PowerShell 隔离命令修正和固定源码启动说明统一。

- 本轮产品候选：`2774b185ab75bfe38b6a36a07aa735d5ed4f559b`；测试 harness：`c2a6d4335a3947546815543cdc17ef992c8d74ae`（v4）；文档修复：`f25726fc7e4314ac6b385bc7976c0014203a28f6`。
- R1：5 次重载、10 次进出、每次 1 请求、60 秒 0 请求/0 pageerror；真实 CLI 卸载后路由 404、入口/面板消失、Host/导航可达；同路径重装后恢复，前后 `lib/` 哈希相同。
- R2：loading 显示“刷新中/正在刷新·显示上次结果”，不再显示连接失败；真实失败仍显示错误与过期。
- R3：全新 PowerShell 5.1 中 `$HOME` 不变、`DSH_HOME` 指向隔离目录；文档改用 `$dshTestHome`。
- R4：固定源码启动 argv 无 `web` 位置参数、无初始化参数；CLI `-V=0.2.2-rc.3`；初始化命令仅首次使用。
- 独立结论：[independent-verification-closeout.md](../evidence/FND-001/independent-verification-closeout.md)；报告：[REPORT.md](../evidence/FND-001/REPORT.md)；证据：`docs/evidence/FND-001/runs/2774b18/`。
- 明确 NOT_RUN：运行期定时器注入计数、上游 `build:artifacts` 重跑/`build:check`、逐像素人工目检、Desktop Electron 冒烟、Windows 安装、真实 GPT。

本单元通过不等于 F01、F04、A01、A50 的完整需求或完整场景已验收；真实模型、六工作区完整遍历和 Windows 安装均未在本单元发生。

## 功能与宏观阶段

| 范围 | 实现 | 产品运行验证 |
|---|---|---|
| FND-001 | passed（单面板 + Host 只读状态；R1–R4 收尾） | 真实 Web profile PASS（见 REPORT 与收尾独立报告） |
| 其他全部工作单元 | planned，未激活 | NOT_RUN |
| F01–F44 | F01/F04 仅 partial_foundation 证据 | 无需求被标记 verified |
| P01–P14、A01–A52 | 待相应功能具备 | 全部 NOT_RUN |
| Windows 安装包 | NOT_BUILT | NOT_RUN |

## 下一次实际执行

等待用户明确选择下一单元并原子替换唯一入口与执行登记；`active_unit` 保持 FND-001，不自动切换。数据库、登录、业务资料和模型调用等由各自后续单元实现。旧启动指令不再出现在工作树；历史记录只作当时证据。
