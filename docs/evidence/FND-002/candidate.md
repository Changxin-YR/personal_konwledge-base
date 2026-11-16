# FND-002 候选冻结记录

- unit：FND-002，instruction_revision 2.1.0
- 分支：`dsh/knowledgeos-fnd-002`
- 产品候选提交：`d7a453d6dfbdaee4c495b5d920086608fb9c8e1f`
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）
- 环境：Windows 11 Pro、Node `v24.22.0`、`node:sqlite`/SQLite `3.53.4`、pnpm `11.28.5`
- 隔离运行：`DSH_HOME=.cache/dsh-home-fnd002`，profile `knowledgeos-storage-test`，端口 `3100`，业务库 `.cache/knowledgeos-fnd002-data/<run_id>/knowledgeos.sqlite`
- 第一部分基线：`ce3a00ccd7c8cc46eaae6e660144730109cf93a0`（FND-001 passed）

## 关键文件 SHA256

| 文件 | SHA256 |
|---|---|
| `packages/knowledgeos-panel/lib/index.js` | `47d715aa005700ee1ff56f5ec3901e1e5d7331c4d3ede0795889788c9958afb8` |
| `packages/knowledgeos-panel/lib/storage.js` | `43693f03e970142132171d843766d061ad301a39960a4eb46e1b973d75b6f3a1` |
| `packages/knowledgeos-panel/lib/client.js` | `f0eb568f9021f4ad4dbbd85ebb6683ea0245d44c449d4b938738caacdf9974d9`（面板未改） |
| `packages/knowledgeos-panel/package.json` | `48a6f24ff44437ebaee238ee53c96422fdcc7968f645582fb95b5585a52f1c55` |
| `packages/knowledgeos-panel/src/host/storage.ts` | `b90d19b213b46b95b08617629943ab13f85ac5893a60c3c1e7e52575e29b8d6c` |
| `packages/knowledgeos-panel/src/host/http.ts` | `a20bd13760e141314ab46886440fc7157c0640788c4f45d72cd8d2f5b02f1ce6` |
| `packages/knowledgeos-panel/src/host/records.ts` | `658553efd04345b770879ef5225da61463630fbbadf2818b2ba1ebb7373bf675` |
| `packages/knowledgeos-panel/src/host/config.ts` | `1e108b328f02e7c9ef25851577b0160d71399b05030b991b306635f7bafc76ed` |
| `packages/knowledgeos-panel/src/host/index.ts` | `0e91c7cddbc19a34aa645742a5d80d9b7cf8fa0a32b3c1601288dacdf355afd7` |
| `scripts/fnd002/run-all.mjs` | `ad9ebe25b002d018f5e0ca610be4e539bd832f231ade9d87ab61acbe34d1655e` |
| `scripts/fnd002/scope-check.mjs` | `d7e3a7aa173f7414d25deb4c439c8fdb8f02cc2c28574eafc15ab1d3eea6a68e` |

迁移 v1 规范 SQL 的 SHA-256：`033dcf95cd9e7c6e4fa964804de7944c1b99daa4b4acd5b92708555cb15dc84a`
（导出常量 `MIGRATION_V1_CHECKSUM`；账本必须与此值一致。）

## 运行与复验命令

```powershell
$knowledgeosRepo = "C:\Users\27363\Desktop\personal base\personal_konwledge-base"
$dshRoot = "$knowledgeosRepo\.cache\build\dsh-39163dd"
$dshTestHome = "$knowledgeosRepo\.cache\dsh-home-fnd002"
$env:DSH_HOME = $dshTestHome
$env:DSH_CLIENT_COMMIT_HASH = "39163dd30f703a79079e2d2446545cff3c453738"
cd $dshRoot
# 首次创建 profile 才使用；不得在每次复验重复
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --from-default-profile web --dump-config
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --port 3100 --no-open
```

profile 的 `cordis.patch.yml` 通过可信 config 指定本次 `dataDir`：

```yaml
- id: knowledgeos-host
  config:
    dataDir: "C:/Users/27363/Desktop/personal base/personal_konwledge-base/.cache/knowledgeos-fnd002-data/<run_id>"
```

九项测试：

```powershell
cd $knowledgeosRepo
node scripts/fnd002/run-all.mjs --out "docs\evidence\FND-002\runs\d7a453d" --run-id d7a453d --candidate d7a453d
node scripts/fnd002/scope-check.mjs
```

## 范围说明

只新增 `schema_migrations` 与 `storage_probe_records` 两张应用表；只新增两个真实已认证路由。FND-001 的 `/knowledgeos/status` 与面板保持原语义。未配置 `dataDir` 的旧 profile 仍可读 status，持久化接口返回 503 `STORAGE_UNAVAILABLE`。不含账号、权限、知识实体、导入/RAG、jobs/outbox、模型、协作或安装包。
