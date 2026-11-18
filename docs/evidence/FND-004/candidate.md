# FND-004 3.2.2 冻结候选

候选标签：`FND-004-FINAL-20261118-v3.2.2`
冻结基线：`518ce35a51ef07623480bc8cd75dc0e93262557d`
固定 DSH：`39163dd30f703a79079e2d2446545cff3c453738`
工作 profile：`knowledgeos-identity-test`（loopback 专用共享 profile）

## 构建产物 SHA-256

- `packages/knowledgeos-panel/lib/index.js` — `82d803879f7d66fbae95ab5987a56a81b0de5c5ccbb2960958addfe90522a1ff`
- `packages/knowledgeos-panel/lib/storage.js` — `e3b0ffe52dff3bdc148363eb99dd4964a9fe991c04b0c9f7dcb073a9d2965514`
- `packages/knowledgeos-panel/lib/test-support.js` — `5b95ab2360a9ca529171a4214e476148718699390e7ba86a26aa726647bbd49c`
- `packages/knowledgeos-panel/lib/client.js` — `dfa4a5e2fb8afcaf85657f22048185e3cb86444db87e8e6e4ec1d4b0bbe2e1a9`

## 源码与执行材料 SHA-256

- `packages/knowledgeos-panel/src/host/authorization.ts` — `515b78499fd8d5b42280f3959063934fe974fcf85b2f8dfe3e599b1eea22242c`
- `packages/knowledgeos-panel/src/host/storage.ts` — `878fa9d58a1ae04b0cadd97ad7f2d79105715d46061e73a1f2eef2085b791e2c`
- `packages/knowledgeos-panel/src/host/test-support.ts` — `b07755d4cc7f00ad1c842da13aa13fca7d09fe86c1ab3de108e143da8550399a`
- `scripts/fnd004/run-all.mjs` — `7e1b05e46b0413e664177de601e376ffd6d731fce95ade80947234e2ff81e99d`
- `scripts/fnd004/independent-verification.mjs` — `541322c90560e1fb64b945f376a38f3f1dd7235d2013f047349f37804c3e175a`
- `scripts/fnd004/affected-regression.mjs` — `e90af21d84c8bd7d9724eed427435ac97126c7a0b10fa0d3a0edb522c38d6a86`
- `scripts/fnd004/harness.mjs` — `856136698eb2db4457e63e96477dd9df2da4e22f22283de064cc85a3d5f0557d`
- `CODEX_START.md` — `f76f6f0351740fe22d0de9591a69ae280898beb35b300e715afe62a1afbbc60a`

## 运行证据

- `runs/v322-candidate/summary.json`：T01–T07 全部 `PASS`，含 R1 五类操作和 R2 历史 SQL 断言。
- `independent/v322-candidate/summary.json`：新 Host、真实登录、R1/R2、对象授权和高权限入口独立复核 `PASS`。
- `runs/v322-affected-regression/summary.json`：FND-001、FND-002、FND-003 受影响回归 `PASS`，重启后 user_version `4`、账本 `4`。
- `runs/fnd002-regression-20261118/T01.json`：旧 v1-only 检查器 `FAIL`，保留为历史契约不兼容证据，不计入 PASS。

完整 A02/A34/A46、搜索索引、AI 摘要/答案、文件下载、邀请码兑换和完整缓存失效保持 `NOT_RUN`；Connection 独立停用/恢复保持 `BLOCKED`。

最终复验批次：2026-11-18。类型检查、构建、计划检查、T01–T07、独立真实 HTTP/SQL 复核、v3→v4 升级、故障回滚、重启和受影响回归退出码均为 `0`；此前 3.2.1 的 `final-20261118` 系列证据保留为历史材料。
