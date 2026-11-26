# REPO-002 GitLab 独立验收预期

依据 F15、REPO-002-T01/T02 和开发计划的三平台目标。主跑和独立复跑分别使用同一冻结提交、同一构建和 runner 的隔离真实 DSH Host、Chrome、SQLite。记录提交、产物、runner、HTTP、上游 egress、重启和数据库的证据。浏览器只允许回环服务，上游仅使用白名单内的 GitLab.com API 只读 GET，禁止重定向和文件执行。公开内容只记录路径、尺寸与哈希，预检未配置凭据。

## 已确认的公开输入

2026-11-26 从 GitLab.com 的公开测试项目 gitlab-org/gitlab-test 读取。项目 ID 为 72724。两个快照都含 UTF-8 纯文本 README.md，使用元数据、固定 SHA 递归树、按 blob SHA 取内容核对。README 中的代码和链接作为文本处理。两棵根树的 SHA 由完整响应按 Git 对象格式计算，每个目录的推导 SHA 与 API 返回 ID 一致。

| 引用 | 完整提交 SHA | 根树 SHA | README blob SHA | 字节 | 内容 SHA-256 | 树项 |
|---|---|---|---|---:|---|---:|
| master | ddd0f15ae83993f5cb66a927a28673882e99100b | 7dc7f517af9a53aa9817a6b8c33dc94371a7cdad | ea20973903d3800ac659d503596f9105f0a7423f | 833 | 471500105a0881cd0208d791494f59e1d5b973a9229c63792208befd91a57e3e | 59 |
| branch-merged | 498214de67004b1da3d820901307bed2a68a8ef6 | 06a736b30226509bcb4bae41df06c9be8f93a716 | faaf198af3a36dbf41961466703cc1d47c61d051 | 55 | 0753d44b11c2fa87069a0b674072fc449f1462decf49aff1bd52e975d44690ef | 54 |

[公开项目](https://gitlab.com/gitlab-org/gitlab-test) · [master 固定文件](https://gitlab.com/gitlab-org/gitlab-test/-/blob/ddd0f15ae83993f5cb66a927a28673882e99100b/README.md) · [branch-merged 固定文件](https://gitlab.com/gitlab-org/gitlab-test/-/blob/498214de67004b1da3d820901307bed2a68a8ef6/README.md)

## T01 真实平台固定版本

1. 以实际业务账号打开仓库页，选择 GitLab，以分支 master 导入树且不预先固定 README。核对一次真实平台项目解析结果为 canonical namespace 和数值 ID 72724，分支 API 的 commit.id 为完整 SHA，树请求只以该 SHA 为 ref。若公开分支已移动，记录实际观察并使用上表完整 SHA 做不可变对照。验证浏览器、API、SQLite 的平台、提交、根树、README blob ID 与所有目录/文件标识一致，页面生成 GitLab 固定提交链接。该项目的两棵树都含三个 gitlink，页面不能像普通文件一样打开它们。
2. 从同一页面切换到 branch-merged 导入，核对不同提交及不同 README blob ID，然后第一次打开旧 master 快照的 README。上游只使用 GitLab 元数据复验和旧 blob SHA，不请求分支或按路径找最新版本。对照固定字节大小、SHA-256、Git blob SHA，以及带旧提交 SHA 的文件链接。再读取新快照文件，验证两份字节不同且各自固定。首次提交并发或重复操作不能形成重复快照和文件。
3. 再用完整 SHA 连接一次并验证去重及引用记录。源身份、版本与限定项目范围来自正式元数据，当前账号之外的业务身份不可查阅。重启 Host 并用新的 Chrome context 读取旧快照，确认 SQLite 和界面仍展示旧字节且零上游网络。记录上游坏状态对任何新本地记录无副作用。

## T02 权限和错误

1. 在真实 Host 请求未绑定 GitLab 别名、另一个业务账号的别名和 GitHub 别名，验证拒绝、无外发、无新快照。配置仅供测试的合法原生引用名称但不填密钥，验证产品返回未配置的原生凭据错误，零上游请求。私库授权和实际上游撤权在无授权私库目标时记 BLOCKED 或 NOT_RUN，公共匿名实跑范围及失败行为分开记录。真实上游 404 可由公开项目的随机不存在分支演练。
2. 独立负例夹具覆盖 401/403/404、429、显式限流 403、慢响应、断开取消、跳转到其他源、分页重复和跨页路径冲突、元数据 ID/可见性变化、坏 Git 对象、文件/目录配额。失败后对照 SQLite 和上一可读快照。网络日志仅保留脱敏请求方法、路径、结果和计数。A19 留 NOT_RUN，等 Gitee 与真实 AI 写入拒绝的集成场景。

## 响应形状和回归断言

- GitLab 项目元数据使用 id、path_with_namespace、visibility。分支和标签按不同端点核对返回名称与 commit.id，完整 SHA 路径直接比较 id。树输入必须来自已经固定的提交。 [项目 API](https://docs.gitlab.com/api/projects/) · [分支 API](https://docs.gitlab.com/api/branches/) · [标签 API](https://docs.gitlab.com/api/tags/) · [提交 API](https://docs.gitlab.com/api/commits/)
- 递归树是条目数组，条目含 id、name、type、path、mode；无独立根 SHA 或普通文件尺寸。测试只包含完整树的持久化，单页夹具应增加恰好满页、缺分页头、重复页和空末页用例。GitLab.com 可不返回部分分页头。分页应固定已验证 origin、项目 ID 和 commit，受控递增页码并累计限额。恶意或不相关链接不可导致跨源请求。 [树 API](https://docs.gitlab.com/api/repositories/#list-all-repository-trees-in-a-project) · [分页](https://docs.gitlab.com/api/rest/#pagination)
- Git 树校验按目录归组，路径 basename 是原始 UTF-8 字节，目录名比较以斜杠结尾，其余项以 NUL 结尾。对象项为无前导零的模式、空格、原始名称、NUL、20 字节对象 ID。计算 tree 存储对象的 SHA-1 并与目录 id 比对。单独测试名称 foo、foo.bar、foo-x、Unicode 路径、空树、符号链接和 gitlink。根树 SHA 是树对象哈希，固定 commit 是 GitLab 的请求选择器。
- GitLab 普通文件实际大小在 pin 时核实。核对 GitLab blob SHA、编码、Base64、解码字节数和 Git blob 对象哈希。Repository Files API 可能转码非 UTF-8 文本，从该接口取得的内容或 SHA-256不能用作原始字节预言。 [按 blob SHA 读取](https://docs.gitlab.com/api/repositories/#retrieve-a-blob-from-a-repository) · [文件 API 转码规则](https://docs.gitlab.com/api/repository_files/#retrieve-a-file-from-a-repository)
- v28 历史 GitHub 快照和文件迁移后保持 ID、树、blob、payload、来源 URL、去重和无凭据兼容行为。测试相同业务账号、remote ID 和 commit SHA 的跨平台隔离。回归 REPO-001 的两个真实 GitHub 固定引用、换 ref 后首次固定旧 blob、前台权限失败时清屏、主/次限流、字面 README、关联约束与故障回滚。
