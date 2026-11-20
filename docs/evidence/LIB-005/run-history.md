# LIB-005 候选与复现

基线 `f4d3421f507654c6c82f6994f5dbd4012263685e`。数据全为生成样本；不需要用户的账号、资料或模型额度。

- `2ee8db22d4b85a4aaad8cdebcbfb1bf79118914b`：真实隔离 Host 与 Chrome 初跑通过，窄屏截图中有未经翻译的错误原因。后续候选补充状态及原因的中文说明。
- `4675aa7ed8ad1ac2501cdd2a63de769707ceaf5f`：插件入口 `463c464bc06ee56ced7291482403ca6b5e7fcadb509672e9b823169511d90b46`。真实 HTTP/SQLite 主运行见 `host-run.json`；真实 Chrome 主运行见 `browser-run.json`。前者的 `chrome: NOT_RUN` 与 `A05: NOT_RUN` 描述该运行器自己的覆盖范围，不能据此把单个运行器当作完整验收。
- 受影响专项和回归 42 项通过，包含 v8/v9/v12 历史升级、失败回滚、恢复重放、按用户隔离及 Chrome 夹具交互。夹具交互不计作真实 DSH 证据。计划一致性正反检查 116 项通过，不计作产品测试。

在 Windows 上使用包含锁定 DSH、Playwright 和 Node 24 的既有隔离测试缓存。从冻结候选的干净工作树执行（如跨工作树，设置 `KO_TEST_CACHE` 指向本机既有测试缓存）：

```powershell
$sha = '4675aa7ed8ad1ac2501cdd2a63de769707ceaf5f'
$entry = '463c464bc06ee56ced7291482403ca6b5e7fcadb509672e9b823169511d90b46'
node scripts/lib005/host-browser.mjs $sha $entry
node scripts/lib005/host-acceptance.mjs --run $sha $entry
node --experimental-transform-types --test scripts/lib005/*.test.mjs scripts/lib004/word-http.test.mjs scripts/lib004/word-original.test.mjs scripts/lib001/pdf-originals.test.mjs scripts/lib003/text-store.test.mjs scripts/lib004/office-migration.test.mjs
```

每次实跑使用新建本机回环 Host、独立测试数据库和私有原件目录。主运行下载并核对了原始 PDF、DOCX、Markdown、UTF-8 文本及 ZIP 选中项。未选成员不建资料；暂存原包不可用导致 503，恢复后使用同一请求键补齐成员，不增发已成功的版本。刷新与重启检查不使用模型夹具。大资料 P02/A06、外部模型及 Windows 安装升级均不在此次验收范围内。
