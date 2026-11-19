# DeepSeek HS14 真实业务调用，2026-11-19

真实读写闭环通过，FND-005 原 GPT 验收仍为 BLOCKED。此次测试没有把 DeepSeek 计作 GPT，也没有重新验收 FND-001～004 或启动后续单元。

- 产品提交 `3d539e5618d4f4a1f446dfc768d089c490a8037b`；固定 DSH SHA 和加载插件 SHA-256 见 [真实运行记录](summary.json)。运行命令：`node scripts/fnd005/hs14-live-check.mjs --live-hs14 3d539e5618d4f4a1f446dfc768d089c490a8037b`。这是会向提供方发送请求的命令。
- 桌面配置是 `api` / `deepseek-v4.1-flash-1017/hs14`，专用 Host 原配置仅有无后缀模型，未绑定业务 AI。测试使用同一专用 profile 的临时 DSH overlay、原生凭据解析、新数据库和回环端口 3167；不修改两个常用配置。不从聊天或仓库读取 API Key。预检校验中转方提供的同名模型和 `hs14` 渠道公开价格。总预算上限 USD 0.10，不是供应商账单。
- 随机口令注册的普通业务用户在 Chrome 登录，只操作自己的合成对象。临时 owner 凭据仅用于新数据库管理员初始化，没有进入业务浏览器或模型请求。
- 两次 UI prepare 均成功，返回指定路由和预期工具。只读操作后正文 `HS14 synthetic baseline`、revision 1、0 条写入回执。更新携带 `expected_revision=1`，提交后正文 `HS14 synthetic committed update`、revision 2、1 条写入回执。界面重新读取、HTTP 执行结果和独立只读 SQLite 查询均作了核验。未使用模型夹具；未采集供应商侧账单或线级流量。
- [读取截图](revision-1.png) / [更新截图](revision-2.png)：旧版下拉项在重新读取后仍显示 revision 1，但详情及 SQLite 已为 revision 2。后续修复将收到的对象标题和版本同步至对应选项，没有修改模型路由或存储逻辑。
- 修复后运行 `node scripts/fnd005/browser-checks.mjs docs/evidence/FND-005/live-hs14-Oaxv9B/post-fix-fixture`。[修复后 Chrome 回归](post-fix-fixture/summary.json)：10 项通过，针对所选项新增版本文字及 `data-revision` 断言。这是受控模型夹具和真实浏览器、HTTP、SQLite，不是第三次 DeepSeek 请求。修复后的产物 SHA 与实测产物 SHA 分别保留。TypeScript 检查和插件构建通过。

本记录不将本轮自测当作独立验收，不把实测报告推广为全部 GPT T01–T09 通过。
