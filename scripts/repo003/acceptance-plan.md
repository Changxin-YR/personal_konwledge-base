# REPO-003 Gitee 独立验收预期

依据 F15、REPO-003-T01/T02 和 A19。主跑和独立复跑使用同一冻结提交及构建，分别启动真实 DSH Host、Chrome 和 SQLite。Gitee 已公开读取的固定输入由 gitee-oracle.mjs 记录。运行器核对该文件、脚本、候选提交和加载插件的哈希。

## 固定输入

2026-11-26 从 Gitee 匿名读取 oschina/repo，仓库 ID 10649736。公开元数据中 full_name 是 oschina/repo，owner.login 为 oschina-org。适配器以规范路径和稳定仓库 ID 处理平台身份。

| 分支 | 完整提交 | 根树 | README.md blob | 字节 | SHA-256 | 树项 |
|---|---|---|---|---:|---|---:|
| fork_flow | 8217772aa248da974b98148f43856ea19bf8f1a2 | a82868d0c8324e4812430a4ed44b9f35c463b27d | 18a7924cd89eae26c759f0cc1b646c2a7fb8caf7 | 5598 | f6ebfea2e5e7caf9f664651b7d1dddb4a75db9433e6e0a55903365883294a356 | 98 |
| master | 1f20776dbb3b87ba39928dc4baba58f9c2d17c80 | 5a5e1711ae9b00d0fc935a3e6b6bfa12c3b11d4f | 5519e9aa5e9cb1bd9f65465bfbb6d3ab30811e5b | 2090 | ac1e9e65ee668663caa84fc82a9aa71c9cda332406e4c1d082b847a205a656e0 | 96 |

两棵树各八个目录，均包含普通文件，无符号链接或 Git 子模块。递归树返回目录模式 40000；文件模式为 100644 或 100755。预检对每个目录与根树按 Git 对象格式独立计算 SHA-1，README 字节以无损 UTF-8 和 Git blob SHA 复核。用两条实际分支验证引用解析，分支移动时先复核公开输入；不能为得到固定预期直接按任意内容放宽测试。 [Gitee API 文档](https://gitee.com/api/v5/swagger) · [公开仓库](https://gitee.com/oschina/repo)

## T01 两份固定快照

1. 普通业务账号打开仓库页并选择 Gitee。从 fork_flow 导入第一棵树，保持 README 文件尚未固定。对照真实 Gitee 元数据、分支、树响应及 Chrome、HTTP 和 SQLite 的仓库路径、平台、提交、树、README blob 和大小。
2. 选择 master 导入另一棵树，同一步固定 README。核对两个不同快照均已持久化，再回到旧快照首次打开旧 README。旧读取只发仓库元数据复验和旧 Git blob SHA 的请求。旧文件显示原始 UTF-8 内容和带旧完整提交的 Gitee 链接，Chrome、授权 HTTP、SQL 的字节和引用互相一致。
3. 重启 Host，在另一 Chrome context 和窄窗口重开第一份快照，确认直接从 SQLite 读取原字节、页面无横向溢出，且零上游 GET。真实 GitHub/GitLab 回归分别留证。

## T02 权限、只读和错误

1. 第二业务账号不能列表或读取另一用户的公开仓库本地快照。未绑定 Gitee 别名、跨平台别名、直接输入伪造令牌及尝试 PATCH 已有快照，都应拒绝且没有上游请求。
2. 合法公开仓库的不存分支 knowledgeos-read-only-fixture-not-existing，应真实返回 404，应用报告无远端资源。核查失败保持快照和文件原样，SQLite 外键无异常。
3. 主跑只允许 Gitee API 同源匿名 GET；以 gitee-public 模式运行。活跃 Host 的 fetch 围栏使用 allowedPublicGiteeUrl，加方法固定 GET、无身份 Cookie 或凭据、无请求体、不跟随跳转条件。允许的资源是元数据、两个分支、两个完整提交、两个固定递归树、两个固定 blob 及一个真实 404 分支。只记录方法、路径、结果和计数，结果标记 gitee。
4. 在真实 Host 中用受控响应分别模拟上游 429 和 403，每项调用一次且无自动重试；已绑定但缺密钥的原生别名在本地返回 503。真实上游 404 单列。私库认证及授权撤销待有合法入口时验证。 [A19 产品内 AI 写入拒绝](a19-acceptance.md)

运行器预期路径 scripts/repo003/host-gitee.mjs，固定 oracle 路径 scripts/repo003/gitee-oracle.mjs。运行指令为 node scripts/repo003/host-gitee.mjs <frozen checkout> <candidate SHA> <entry SHA256>，KO_TEST_CACHE 指定锁定 DSH 构建与工具缓存。运行器在 TEMP 留存结果和脱敏截图。
