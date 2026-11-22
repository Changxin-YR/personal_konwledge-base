# REPO-001 GitHub 固定提交接入

日期：2026-11-22（Asia/Shanghai）。单元当前 **BLOCKED**：修复候选的真实 GitHub 主跑及独立复跑未执行。A19 和私有 GitHub 连接均未验收。

## 代码与实际结果

- 业务账号可从知识库进入仓库页面，将 GitHub 分支、标签或完整 SHA 固定为只读快照。新引用不改写历史；选择普通文件时按记录的 blob SHA 读取并校验正文。拒绝重定向、越权、非普通文件、超量和无效对象；仓库内容只作为文本展示，不执行、不加载外链。
- 初版候选 `c2085283bcba865e03efe2d4ba10c51070615f5e` 的主跑与 Epicurus 独立复跑都以 0 退出；各执行 11 次真实 GitHub GET，交叉验证公开测试仓库 `octocat/Hello-World` 的两个提交。原快照与首次保存的正文重启后可重读，零额外上游请求。独立审查不放行：前台复验遭遇网络错误时旧账号内容未清理；带 `Retry-After` 的次级限流误分类为无访问权限。
- 修复候选 `12afff5bc52dee947544e1010da4afdb5ef69819` 已通过实际 DSH Host / Chrome / SQLite **夹具回归**：账号切换后的悬置及失败复验屏蔽并清除内容；主、次限流都返回 429；取消、原子回滚与惯性文本路径通过。出站真实 GitHub 请求为 0，T01/T02 在此次夹具运行中均为 NOT_RUN。首轮 23 项受影响回归、修复候选 2 项重点回归、类型检查、构建和 148 项计划门禁均通过。无需重复支付或创建任何凭据。

## 凭据与限制

公开入口默认匿名。部署者如有获准的只读精细化 GitHub PAT，可在 DSH 原生凭据管理中绑定 `KO_GITHUB_*` 引用；KnowledgeOS Host 配置 `repositoryCredentials` 的 `actorId`、`repository`、`alias` 和 `credentialRef`，不接受令牌值。浏览器只录入对应 `github_*` 别名；数据库只保存别名。已导入文件是业务账号的固定本地副本，远端连接失败不把本地副本指向新版本。私库真实认证未测。

## 恢复条件

2026-11-22 12:33（北京时间）查询匿名 GitHub REST 核心限额，剩余 7 次，重置时间 2026-11-22 13:10:44（北京时间）。同一候选主跑和独立复跑各预计 15 次只读请求，当前不足；不消耗剩余额度试跑。额度恢复后对修复候选运行下面命令两次，其中独立角色使用独立 Host、Chrome 和 SQLite。也要确认改进后的测试：改换引用后，首次保存旧快照文件仍只按原 blob SHA 读取。A19 还需 GitLab、Gitee 和真实 AI 写拒绝。

```powershell
node scripts/repo001/host-repository.mjs 12afff5bc52dee947544e1010da4afdb5ef69819 066430d01fee08f21ef7a6d9fc1e5db916fc67c9a6e27714da427dc7eb0c4104
```

[初版主跑](runs/initial-main.json) · [初版独立复跑](runs/initial-independent.json) · [修复候选夹具回归](runs/fixed-fixture-regression.json) · [初版桌面截图](runs/initial-main-github-desktop.png) · [初版移动截图](runs/initial-main-github-mobile.png)
