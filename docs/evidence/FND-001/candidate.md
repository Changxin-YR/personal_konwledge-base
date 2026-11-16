# FND-001 候选冻结记录

> 当前提示（2026-11-16）：本文件记录第一轮候选；下列 PowerShell 示例存在 R3 变量问题，需按当前 DSH_START.md 修正后再复制执行，不能直接沿用。当前修复候选尚未生成，见 [提交复核](SUBMISSION_REVIEW_20261116.md)。

- 冻结时间：2026-11-16（Asia/Shanghai）
- 工作分支：`dsh/knowledgeos-fnd-001`
- 产品候选提交：`37ac57af64b6741d82ffa2663b43dc244529c567`
- 证据/测试脚本修复提交：`22e7be2ffc1b1db6fe8247bb223e69ec6c7ecb5d`（harness v2；`git diff 37ac57a..22e7be2 -- packages/knowledgeos-panel` 为空，产品文件哈希不变）
- 候选树：`899a018f7bb87af83603a877e8a810dedbeb7bb5`
- 起始提交：`6f23735d5f07fed7cef108f829290b823ad6ace0`（main）
- 产品工作树：与 `37ac57a` 一致（后续只增加证据文档与测试脚本）
- upstream.lock 固定提交：`39163dd30f703a79079e2d2446545cff3c453738`，版本 `0.2.2-rc.3`

## 关键文件 SHA256

| 文件 | SHA256 |
|---|---|
| `packages/knowledgeos-panel/lib/index.js` | `22757b15ec4352d9a26d848320dc31b3a96aba86446fb70fa51fc94ce2d26c6a` |
| `packages/knowledgeos-panel/lib/client.js` | `ff99f29f1415651c83c16c1c9667cc0a6dd5e130b7c589fe670bae8f6dd50d88` |
| `packages/knowledgeos-panel/package.json` | `edfc8936b9bcabaafe82a438cb0cc1da3a6dde9f2240e23405c41763582f4407` |
| `packages/knowledgeos-panel/cordis.patch.yml` | `2133c93965bc9b5ea4966999b418ad1fccc720cd5bc6da87ee78d3ddb4d68536` |
| `packages/knowledgeos-panel/src/host/index.ts` | `9b09cd6e2b43ed7cf521fc7a15b2464cfd4ee3444df7afd61bc17950ccfa52d5` |
| `packages/knowledgeos-panel/src/host/status.ts` | `33e6a9a4b05153e9a2364f3c7f458c373ff4a847ca4df6d84bee6b54353e642b` |
| `packages/knowledgeos-panel/src/client/index.ts` | `acd8e12c152e561d12bcaf0f74b79c7264d3e3c14c31ecd81dcccdc71e796991` |
| `packages/knowledgeos-panel/src/client/Panel.tsx` | `0f615f7298a512b4e67d5cc4da9195ab5ea8ef023f6fdbbd371b69f5efd943f2` |
| `packages/knowledgeos-panel/src/client/status-client.ts` | `2dc80b975edd22917d64d99ba7b6c7997140636a19ea2f918c0ff4e8db25b9ca` |
| `packages/knowledgeos-panel/src/client/icon.tsx` | `539022c192d37f4021e7b11c4018684abf0501df80f018550270d795cf136a17` |
| `packages/knowledgeos-panel/src/client/contracts.ts` | `bb3aae37264d1efa92aac5ddc1f25d26fd41d983bfa03f11e3fcb0025a9dc5a6` |
| `packages/knowledgeos-panel/build.mjs` | `a4df7ffa691236cc4c146138ab78e3ba15211451fd61944c6f9a861920d2bb94` |

## 运行环境

| 项目 | 值 |
|---|---|
| Windows | Windows 11 Pro |
| Node | v24.22.0 |
| pnpm | 11.28.5（DSH runtime 自带，仅用于上游安装/构建与 profile 安装） |
| 固定 DSH 源码 | `.cache/build/dsh-39163dd`，从 `.cache/upstream/deepseek-harness`（commit `39163dd`）复制 |
| 上游构建 | `pnpm run build:artifacts`：8 gates passed，0 failed；客户端产物记录 379 个 |
| 构建提交注入 | `DSH_CLIENT_COMMIT_HASH=39163dd30f703a79079e2d2446545cff3c453738`（源码启动契约；运行 Host 时同样注入） |
| 独立 DSH_HOME | `.cache/dsh-home-fnd001` |
| 测试 profile | `knowledgeos-test`（base + web-app + knowledgeos-panel） |
| 测试端口 | 3099（只用 loopback） |
| 桌面 DSH | PID 51900，未停止、未重启、未安装插件 |

## 候选运行命令（复验）

```powershell
$repo = "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
$build = "$repo\.cache\build\dsh-39163dd"
$home = "$repo\.cache\dsh-home-fnd001"
$env:DSH_HOME = $home
$env:DSH_CLIENT_COMMIT_HASH = "39163dd30f703a79079e2d2446545cff3c453738"
cd $build
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open
```

打开启动日志中的 `dsh web: http://127.0.0.1:3099/?token=…`（日志含凭据，证据归档前必须脱敏），侧栏“知识库”即本单元入口。

## 证据脚本（与候选同提交）

| 脚本 | 用途 |
|---|---|
| `scripts/fnd001/browser-e2e.mjs` | 真实浏览器全链路：装载、往返、刷新、重载/进出、真实断连、重启、500 夹具、Host 行热禁用/恢复；截图与 summary |
| `scripts/fnd001/host-contract-run.mjs` | 真实 Host 路由：匿名 401、认证 200、同实例两次查询、重启后实例变化，并调用契约校验 |
| `scripts/fnd001/status-contract.mjs` | 10 字段、类型、时间顺序、实例稳定性/变化、禁止文本的契约校验 |
| `scripts/fnd001/scope-check.mjs` | 静态范围检查：无 DB/登录/模型/RAG/导入等越界依赖 |

## 已知限制

1. 截图已保存，但当前开发模型无图像输入能力，未做逐像素人工目检；以 DOM 断言、文本、尺寸和文件存在为证据，视觉细节仍待用户查看截图。
2. 面板字体/颜色按 `docs/plan/08_UI_SPEC.md` 的默认实现；未做 Windows 100%/125%/150% 系统缩放的独立矩阵（本单元不要求完整 UI 验收）。
3. `host_instance_id` 的“重启必变”按插件实例/进程重启判定；同一进程内多次查询保持不变。
