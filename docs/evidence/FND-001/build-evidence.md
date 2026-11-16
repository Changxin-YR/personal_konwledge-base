# FND-001 构建与类型证据

- 候选提交：`37ac57af64b6741d82ffa2663b43dc244529c567`
- 上游固定提交：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）
- 环境：Windows 11 Pro、Node `v24.22.0`、pnpm `11.28.5`
- 证据目录：`runs/37ac57a/`

## 1. 固定上游依赖安装

| 项目 | 值 |
|---|---|
| 工作目录 | `.cache/build/dsh-39163dd`（从 `.cache/upstream/deepseek-harness` 复制，排除 `.git`/`node_modules`） |
| 命令 | `node <pnpm.cjs> install --frozen-lockfile` |
| 结果 | 退出码 0；`Done in 3m 10.6s using pnpm v11.28.5` |
| 锁文件 | 未修改；使用上游 `pnpm-lock.yaml`，未删除或改成 latest |
| build scripts | 按上游 `pnpm-workspace.yaml` 的 allowBuilds 执行（esbuild、koffi、node-pty、lefthook 等） |

## 2. 固定上游构建

| 项目 | 值 |
|---|---|
| 命令 | `$env:DSH_CLIENT_COMMIT_HASH="39163dd30f703a79079e2d2446545cff3c453738"; node <pnpm.cjs> run build:artifacts` |
| 结果 | 退出码 0；`run-gates: 8 passed, 0 failed, 0 skipped in 208.04s` |
| 产物 | `apps/web/dist/index.html` 存在；`build: recorded 379 client artifact(s) with 3 public value(s)` |
| 日志 | `runs/37ac57a/build-artifacts.log`、`runs/37ac57a/build-artifacts.stderr.log` |
| 未运行 | 未运行 `build:check`；本单元只要求当前改动相关编译/类型/测试，不把全仓耗时检查当默认 |

## 3. 源码树一致性

`.cache/build/dsh-39163dd` 与 `.cache/upstream/deepseek-harness`（HEAD = `39163dd…`）在
`packages/ apps/ scripts/ vendor/` 的 13912 个源文件上逐路径、逐字节一致：

| 项目 | 值 |
|---|---|
| upstream files | 13912 |
| build files | 13912 |
| upstream tree sha256 | `2a2a46c81b8fb33643aff308efc5ebdd34ecdf0c813ef8fcb2237c270398abbd` |
| build tree sha256 | `2a2a46c81b8fb33643aff308efc5ebdd34ecdf0c813ef8fcb2237c270398abbd` |
| 仅上游存在 / 仅构建副本存在 / 内容差异 | 0 / 0 / 0 |
| 排除项 | `node_modules`、`lib`、`dist`、`.dsh-build`、`.git`、`coverage` |

脚本：`scripts/fnd001/source-tree-hash.mjs`。

## 4. 插件类型检查与构建

在 `packages/knowledgeos-panel`：

| 命令 | 结果 |
|---|---|
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | 退出码 0 |
| `node build.mjs` | 退出码 0 |
| `lib/index.js` | 2255 bytes，sha256 `22757b15ec4352d9a26d848320dc31b3a96aba86446fb70fa51fc94ce2d26c6a` |
| `lib/client.js` | 20762 bytes，sha256 `ff99f29f1415651c83c16c1c9667cc0a6dd5e130b7c589fe670bae8f6dd50d88` |

构建产物与 `candidate.md` 记录一致，且 profile 以 `link:` 指向本目录，运行时加载的就是这两个文件。

## 5. Profile 安装

| 步骤 | 命令 | 结果 |
|---|---|---|
| 初始化 web 模板 profile | `node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --from-default-profile web --dump-config` | 退出码 0 |
| 安装 bundle | `node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-test add <repo>/packages/knowledgeos-panel` | 退出码 0；`knowledgeos-panel link:…` |
| profile bundles | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`knowledgeos-panel` | 已写入 profile 清单 |

## 6. 未运行项

- 未运行全仓 `build:check`、`test:coverage`、`test:e2e`。
- 未构建 Windows 安装包（后续发布单元）。
- 未运行 Desktop 冒烟（本单元最低门槛为 Web profile）。
