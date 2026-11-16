# FND-002 候选冻结记录

> **Codex 接管候选：** `codex-takeover-20261116-r2`。这是本轮修复后的新候选；旧 `1b99e39`、`d7a453d` 及其失败/复核事实保留在历史 evidence，不作为本轮复测。

- unit：FND-002，instruction_revision 3.0.0
- 分支：`codex/knowledgeos-takeover`
- 接管提交：`4562034c9b4da48ee7b0d1447f7ae7663908240f`
- 本轮候选运行：`codex-takeover-20261116-r2`
- 固定上游：`39163dd30f703a79079e2d2446545cff3c453738`（`0.2.2-rc.3`）
- 环境：Node `v24.22.0`、`node:sqlite`/SQLite `3.53.4`、pnpm `11.28.5`
- 隔离运行：profile `knowledgeos-storage-test`、端口 `3100`、业务库位于 `<isolated-data-root>/<run_id>/knowledgeos.sqlite`
- FND-001：已通过，保留原验收记录

## 关键文件 SHA256

| 文件 | SHA256 |
|---|---|
| `packages/knowledgeos-panel/lib/index.js` | `0104a95183d9d707f08b1f9e993bee221a2cd89ee23b84506795500cd4502eac` |
| `packages/knowledgeos-panel/lib/storage.js` | `2b4ff2c9f78801e16af25f1923a44850c671ffeec89b702c5fd5e16c0c68ce65` |
| `packages/knowledgeos-panel/lib/client.js` | `f0eb568f9021f4ad4dbbd85ebb6683ea0245d44c449d4b938738caacdf9974d9` |
| `packages/knowledgeos-panel/package.json` | `48a6f24ff44437ebaee238ee53c96422fdcc7968f645582fb95b5585a52f1c55` |
| `packages/knowledgeos-panel/src/host/storage.ts` | `24d0e351b34f1ef39d6b6906e91aed185ca2f912ffd0868eba5c88c121cb3b54` |
| `packages/knowledgeos-panel/src/host/http.ts` | `a20bd13760e141314ab46886440fc7157c0640788c4f45d72cd8d2f5b02f1ce6` |
| `packages/knowledgeos-panel/src/host/records.ts` | `658553efd04345b770879ef5225da61463630fbbadf2818b2ba1ebb7373bf675` |
| `packages/knowledgeos-panel/src/host/config.ts` | `1e108b328f02e7c9ef25851577b0160d71399b05030b991b306635f7bafc76ed` |
| `packages/knowledgeos-panel/src/host/index.ts` | `0e91c7cddbc19a34aa645742a5d80d9b7cf8fa0a32b3c1601288dacdf355afd7` |
| `scripts/fnd002/run-all.mjs` | `06fbfd60de3ea14cc4cf630c76306843d0d6f899b0c7d5a8fef52a86daccb872` |
| `scripts/fnd002/scope-check.mjs` | `d7e3a7aa173f7414d25deb4c439c8fdb8f02cc2c28574eafc15ab1d3eea6a68e` |

迁移 v1 规范 SQL 的 SHA-256：`033dcf95cd9e7c6e4fa964804de7944c1b99daa4b4acd5b92708555cb15dc84a`。

## 复验命令

```powershell
node scripts/verify-plan.mjs
node scripts/prepare-upstream.mjs --check
node scripts/fnd002/scope-check.mjs
cd packages/knowledgeos-panel; node node_modules/typescript/bin/tsc -p tsconfig.json; cd ../..
node scripts/fnd002/regression-sqlite-prefix.mjs --out docs/evidence/FND-002/runs/<new>/r1-regression.json
node scripts/fnd002/run-all.mjs --out docs/evidence/FND-002/runs/<new> --run-id <new> --candidate <new>
```

完整新候选证据：`docs/evidence/FND-002/runs/codex-takeover-20261116-r2/`。R1 独立回归同时以当前 `lib/storage.js` 通过 A–F，并以冻结 `storage-baseline.js` 重放旧 A–D 缺陷。

## 范围

仅覆盖 FND-002 本地持久化探针、真实认证 Host 路由、迁移/归属/事务/幂等/生命周期保护及受影响 FND-001 回归。正式知识实体、账号/ACL、多用户协作、模型/RAG、jobs/outbox、安装包和 FND-003+ 仍未激活。
