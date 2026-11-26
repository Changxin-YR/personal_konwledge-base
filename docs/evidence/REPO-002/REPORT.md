# REPO-002 GitLab 只读快照

2026-11-26，候选 `77eeaaea6546c96827a08db88f9e5927a4b993b4` 的 T01、T02 在隔离 DSH Host、Chrome 和 SQLite 的主跑和独立复跑均通过。同一候选通过真实 GitHub 回归、9 项受影响测试、类型检查和构建。

- 在公开项目中导入两个不同的固定提交，核对根树、三处子模块、README blob、文件字节及来源链接。切换后首次打开旧 README 时按旧 blob SHA 请求。用完整 SHA 重连去重，重启后从本地回读固定文件，上游请求为零。两次各观察到 16 次成功的匿名 GitLab GET 和一次实际 404。 [主跑](runs/main.json) · [独立复跑](independent.json) · [桌面](runs/main-gitlab-old-fixed-file.png) · [移动端](runs/main-gitlab-restart-mobile.png)
- 已绑定但未配置的 GitLab 原生凭据返回 503，未知别名、跨平台别名和其他账号均在本地被拒绝。真实未知分支返回 404，失败前后快照及文件记录一致。私有 GitLab 凭据及真实撤权待有授权测试入口时验证。 [验收记录](acceptance.json)
- SQLite v34 以事务保留旧 GitHub 快照、文件和迁移记录，平台进入去重范围。初次并行启动在隔离 Host 就绪前超时，未访问仓库 API，随后顺序重跑通过。A19 还需 Gitee 和 AI 写入拒绝的集成路径。 [GitHub 回归](runs/github-regression.json) · [初次启动记录](runs/initial-main-start-timeout.json)

复跑时令 `KO_TEST_CACHE` 指向共享构建缓存，在 HEAD 等于候选的工作树执行验收记录中的命令。 [独立验收计划](../../../scripts/repo002/acceptance-plan.md)
