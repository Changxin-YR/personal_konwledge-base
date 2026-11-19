# 连续开发接管后的技术回归

2026-11-19，Node v24.22.0，Windows。产品提交 `4d710fb993ff392e9a88ac22480cc2cc8a56ff00`，对应 tree `19e4e29798531dee41fbff629c070b8eeefd427c`，Host 入口 SHA-256 `239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84`。当前回归运行器增加了 `KO_PRIVATE_REGRESSION=1` 输出目录选项，产品与被测套件来自所列 tree。19 条 Host 加载记录均匹配，运行前后产品稳定。本记录是技术基线，不是新验收脚本最终候选的独立模型验收。

| 套件 | 实际检查 | 退出码 |
|---|---:|---:|
| 浏览器、HTTP、SQLite | 11 | 0 |
| 配置、适配器与错误 | 22 | 0 |
| 状态、重启、预算提示 | 3 | 0 |
| 工具与身份集成 | 14 | 0 |
| ACL 与迁移 | 7 | 0 |
| 存储故障与恢复 | 6 | 0 |
| 撤权与取消边界 | 5 | 0 |

技术结果：68 项 PASS。真实提供方请求：0；本次独立真实 read/update：NOT_RUN。另行执行 TypeScript 类型检查、隔离重建（4 个构建产物逐个 SHA-256 一致）、历史候选绑定（35 个产品文件和 v1–v5 checksum）及 3 个本地 HTTP 证据计数负例，均通过。

```powershell
$env:KO_PRIVATE_REGRESSION='1'
node scripts/fnd006/regression/run.mjs frozen 19e4e29798531dee41fbff629c070b8eeefd427c 239c5f9ac7e242de566d9544aca2aed82fceb74d68683ae2d3842385d0e21c84
node scripts/fnd006/regression/supplement.mjs frozen-2026-11-19T07-45-55-773Z
```

复跑补充命令时替换为首条输出的新目录名。原始报告仅在本机 `.cache/technical-regression/`；主报告 SHA-256 `28bf039566790793e7f70829303a4df1a8e889220b0a5e756203d91e721e0352`，补充报告 `e8c8708811c541569a39c804280882023d1ff71fc1a05ada9c110d199897ea55`。不推送原始日志、账号、数据库或机器路径。
