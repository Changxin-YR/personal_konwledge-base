# FND-004 权限矩阵

执行修订：3.2.1；证据来自固定 DSH Host 的真实 HTTP、真实登录会话和独立 SQLite 复核。

| 目标 | actor 条件 | read | comment | edit | export | manage_share | delete | review | view_learning_records |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 个人对象 owner | 同 service、personal space、对象 active | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 他人个人对象 | 仅 admin/member 标签 | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| 项目对象成员 | 有效 membership，无 grant | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| 项目对象成员 | 有效 membership + 对应 user grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant |
| 项目对象 project subject | 有效 membership + 对应 project grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant |
| 任意目标 | `valid_from > now`、`now >= expires_at`、`revoked_at` 非空、跨 service/space、对象非 active | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |

授权记录是逐动作的。`edit` 不蕴含 `delete` 或 `manage_share`；项目成员资格也不自动公开个人学习记录。无对象和无权对象使用统一安全错误，不返回标题、正文或存在性。

项目对象创建要求目标项目属于当前 service、状态有效且当前 actor 有有效 membership；管理员标签、伪造字段、非法项目标识和跨 service 目标都返回安全 404。`POST /knowledge/v1/grants/revoke` 以 `grant_id` 为契约字段，撤权竞争中只有一个请求得到 204，之后 GET、列表和 action 都重新判权并拒绝。
