# FND-004 3.2.1 冻结候选

候选标签：`FND-004-FINAL-20261118`
冻结基线：`d2ad59e470e699b10a3db605134959f05c0e80b2`
固定 DSH：`39163dd30f703a79079e2d2446545cff3c453738`
工作 profile：`knowledgeos-identity-test`（loopback 专用共享 profile）

## 构建产物 SHA-256

- `packages/knowledgeos-panel/lib/index.js` — `6933b0ebb47b0f9b801cdb1e6b4ff39eb3e40343c2f264d1ed43611cbcfde37d`
- `packages/knowledgeos-panel/lib/storage.js` — `32fa986b666f6d3b05b8b71590340f64195dd58026819d8289eee464bc8155fb`
- `packages/knowledgeos-panel/lib/test-support.js` — `410b9745385799ffd95b9455c164fbf6fd6f869a77573e31cd2669da1b79e81f`
- `packages/knowledgeos-panel/lib/client.js` — `dfa4a5e2fb8afcaf85657f22048185e3cb86444db87e8e6e4ec1d4b0bbe2e1a9`

## 源码与执行材料指纹

- `src/host/objects-http.ts` — `3fc836ab7839c44c6deef34c2f22f5e7f0a6d21338de61a0b64a272267fa5fdd`
- `src/host/storage.ts` — `17bd6119597b402b0c227e78fc445aee18e9a66754f76e28cf2c61e1f66959b1`
- `scripts/fnd004/run-all.mjs` — `30db8f8f8eac1197bc235a20dd644b24e04ff9f5da952df8efbd5d341ae15327`
- `scripts/fnd004/independent-verification.mjs` — `f274c3264f4758d5f8aed5e07dc57be26cee780aa1cf3b5cdff2c3de78227626`
- `scripts/fnd004/affected-regression.mjs` — `0bf3a646d4f98972ba185df6e2960a09c9821dd97025a1ee13c110c5b6e70a06`
- `scripts/fnd004/harness.mjs` — `856136698eb2db4457e63e96477dd9df2da4e22f22283de064cc85a3d5f0557d`
- `CODEX_START.md` — `ec29b4379d20e2f36970f2f0da945e8b2ccefa9074b7ed4ad7b68a74ef5b38df`

## 运行证据

- `runs/final-20261118/summary.json`：T01–T07 全部 `PASS`。
- `independent/final-20261118/summary.json`：新 Host、真实登录、对象授权、撤权和高权限入口独立复核 `PASS`。
- `runs/affected-regression-final-20261118/summary.json`：FND-001、FND-002、FND-003 受影响回归 `PASS`。
- `runs/fnd002-regression-20261118/T01.json`：旧 v1-only 检查器 `FAIL`，保留为历史契约不兼容证据，不计入 PASS。

完整 A02/A34/A46、搜索索引、AI 摘要/答案、文件下载、邀请码兑换和完整缓存失效保持 `NOT_RUN`；Connection 独立停用/恢复保持 `BLOCKED`。

最终复验批次：2026-11-18。类型检查、构建、计划检查、T01–T07、独立复核和受影响回归退出码均为 `0`；最终候选工作树指纹以本文件和 `final-20261118` 证据为准。
