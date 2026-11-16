# 阻塞与待验证条件

更新：2026-11-16。FND-001 已在本机真实 DSH Web profile 完成开发、测试与独立复核；当前没有阻塞本单元交付的条件。

## FND-001 预检结果

| ID | 状态 | 条件 | 实际结果 |
|---|---|---|---|
| C01 | RESOLVED | 开发机 Node/pnpm、固定上游源码与构建依赖 | Node `v24.22.0`、pnpm `11.28.5`；锁定源码安装与 `build:artifacts` 8/8 gates 通过；源码树与锁定检出逐文件一致 |
| C02 | RESOLVED | DSH 真实 Host/Client 挂载与本机测试 profile | 独立 `DSH_HOME=.cache/dsh-home-fnd001`、profile `knowledgeos-test`、端口 3099；真实浏览器链路 T01–T07 通过；桌面 DSH 未受干扰 |
| C03 | PARTIAL | DSH 子角色与独立测试可用性 | 独立测试角色可用并在候选上实跑、发现并复测 G1；**架构子角色未能产出独立结论**，由主管按锁定源码复核并在 `architecture-review.md` 记录该缺口 |

## 当前单元剩余限制（非阻塞，已在报告列明）

| 项目 | 状态 | 说明 |
|---|---|---|
| Desktop Electron 冒烟 | NOT_RUN | 本单元最低门槛为 Web profile；未另起桌面实例 |
| 逐像素/人工目检 | NOT_RUN | 当前模型无图像输入；1366/1920 与深色截图已保存 |
| 上游 `build:check`、全仓测试 | NOT_RUN | 本单元只要求改动相关编译/类型；未把全仓耗时检查当默认 |
| T04 定时器计数、`plugin remove` 卸载路径 | NOT_RUN | 已覆盖 1 次重载、5 次进出、15 秒静默、Host 行热禁用/恢复 |
| Windows 安装包、多人账号、真实 GPT | NOT_RUN | 属于后续单元，不构成本单元虚假阻塞 |

真实阻塞记录必须包含：当前 unit_id、失败动作与错误、时间、候选提交/指纹、影响测试、已尝试修复、最小解除条件和本单元剩余可做内容。未尝试写 NOT_CHECKED/NOT_RUN，不写 BLOCKED。禁止以“先做下一个功能”等方式绕过当前单元门槛。

不复制凭据、Cookie、用户正文或完整环境变量到公开证据。FND-001 证据中的 `token=` 与 `dsh-auth-` 已脱敏并由独立角色字节级复查。
