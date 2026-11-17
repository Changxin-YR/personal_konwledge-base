# FND-004 权限矩阵

| 目标 | actor 条件 | read | comment | edit | export | manage_share | delete | review | view_learning_records |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 个人对象 owner | 同 service、personal space、对象 active | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 他人个人对象 | 仅 admin/member 标签 | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| 项目对象成员 | 有效 membership，无 grant | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| 项目对象成员 | 有效 membership + 对应 user grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant |
| 项目对象 project subject | 有效 membership + 对应 project grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant | 按 grant |
| 任意目标 | `valid_from > now`、`now >= expires_at`、`revoked_at` 非空、跨 service/space、对象非 active | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |

授权记录是逐动作的。`edit` 不蕴含 `delete` 或 `manage_share`；项目成员资格也不自动公开个人学习记录。无对象和无权对象使用统一安全错误，不返回标题、正文或存在性。
