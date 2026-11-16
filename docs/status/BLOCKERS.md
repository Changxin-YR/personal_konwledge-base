# 阻塞与待验证条件

更新：2026-11-16。FND-001 收尾轮已在真实隔离 DSH Web profile 完成 R1–R4 修复、构建、针对性测试与独立复核；当前无阻塞本单元交付的条件。

## FND-001 收尾项

| ID | 状态 | 实际问题 | 本轮处置 |
|---|---|---|---|
| R1 | CLOSED | 首轮只有 Host 行禁用/恢复，未验证完整 bundle 卸载；原定 5/10/60 秒实际为 1/5/15 | 真实 CLI remove 后重启 Host：有效认证下路由 404、入口/面板 0、导航可用；同路径重装后恢复；5 次重载、10 次进出、60 秒静默均实测通过 |
| R2 | CLOSED | loading 保留旧数据时连接状态行误显示“旧数据（连接失败）” | 区分 loading/ready/error；刷新中显示“刷新中/正在刷新·显示上次结果”，真实失败才显示失败与过期 |
| R3 | CLOSED | candidate.md 对 `$home` 赋值，与 PowerShell 只读自动变量冲突 | 改用 `$dshTestHome`；全新 PowerShell 5.1 验证 `$HOME` 不变、`DSH_HOME` 隔离 |
| R4 | CLOSED | README 在显式 profile 后仍含 `web` 位置参数；全局 `dsh` 版本不可假定 | 统一为固定源码入口；运行命令无 `web`/无初始化参数；初始化 `--from-default-profile web` 仅首次 |

## 当前单元剩余限制（非阻塞，已在报告列明）

| 项目 | 状态 | 说明 |
|---|---|---|
| T04 运行期定时器注入计数 | NOT_RUN | 以离开面板 60 秒 0 本功能请求/0 pageerror 为观测边界；不做全局内存审计 |
| 上游 `build:artifacts` 本轮重跑、`build:check` | NOT_RUN | 复用首轮构建日志；固定源码树 13912 文件逐字节复核一致 |
| 逐像素/人工目检、Desktop Electron 冒烟 | NOT_RUN | 当前模型无图像输入；本单元最低门槛为 Web profile |
| Windows 安装包、多人账号、真实 GPT | NOT_RUN | 属于后续单元，不构成本单元虚假阻塞 |

真实阻塞记录必须包含：当前 unit_id、失败动作与错误、时间、候选提交/指纹、影响测试、已尝试修复、最小解除条件和本单元剩余可做内容。未尝试写 NOT_CHECKED/NOT_RUN，不写 BLOCKED。禁止以“先做下一个功能”等方式绕过当前单元门槛。

不复制凭据、Cookie、用户正文或完整环境变量到公开证据。FND-001 两轮证据中的 `token=` 与 `dsh-auth-` 已脱敏并扫描确认。
