# REPO-003 三平台只读接入与 A19

2026-11-26，冻结候选 `067de230947b8fa44435de544647fddb15c1e4f0` 的 T01、T02 和完整 A19 主跑、独立复跑均通过。两个角色各使用真实 DSH Host、Chrome 和不同 SQLite 数据库。

- GitHub、GitLab、Gitee 都完成两个固定提交的导入。切换版本后按原 blob SHA 首次读取旧文件，重启后直接读取本地快照，来源链接带固定提交。每轮记录 11 次 GitHub、17 次 GitLab 和 17 次 Gitee 匿名 GET。两个平台的未知引用返回真实 404。 [主跑集成](runs/A19-main.json) · [独立复跑](runs/A19-independent.json)
- Gitee 缺密钥的原生别名请求在本地拒绝。上游 429 和 403 分别由受控响应触发，均只请求一次。真实私库认证及撤权需要有授权测试入口。SQLite v35 升级和注入故障回滚保留历史快照与原文件。 [Gitee 实跑](runs/main-gitee.json) · [测试结果](runs/affected-tests.txt)
- 实际业务页面收到模型提出的直接推送操作后返回 `422 TOOL_NOT_ALLOWED`，执行按钮保持禁用。没有执行工具、仓库外发或数据写入，正对照读取成功。模型回复和拒绝测试的前置数据使用本地夹具。三平台读回由前述真实上游请求单独验证。 [拒绝证据](runs/main-ai.json) · [界面](runs/main-a19-ai-repository-push-denied.png)

[单元验收](acceptance.json) · [A19 集成证据](A19.json) · [Gitee API](https://gitee.com/api/v5/swagger)
