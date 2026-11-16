# 验证证据

每次真实验证用独立记录，至少包含：日期/时区、产品提交、上游SHA、平台与运行环境、验收ID、输入来源性质、命令或操作、退出码/实际结果、产物路径/哈希、已知限制。

夹具、合成数据、真实模型与真实平台分别标记。`PASS` 只覆盖已经执行的场景；设计检查不能把 requirements 状态改为 verified。

公开仓库只存脱敏证据与摘要。真实教材、私人作答、模型密钥、会话令牌及未经授权的项目源文件留在本机；证据索引可记录其类型、大小和匿名标识。

后续建议记录：`M0_INTEGRATION.md`、`M1_IMPORT_SEARCH.md`、`M2_LEARNING.md`、`M3_ENGINEERING.md`、`M4_COLLAB_REMINDERS.md`、`M5_DISCUSSION.md`、`M6_WINDOWS_RELEASE.md`。这些文件在真实执行后创建，不预先填 PASS。
