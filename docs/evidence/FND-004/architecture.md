# FND-004 架构决定

日期：2026-11-17（Asia/Shanghai）

FND-004 沿用 `HTTP/API → 应用用例 → 领域授权规则 → SQLite 端口/适配器`。业务会话由 FND-003 的 `IdentityService.actor()` 生成，权限判断只接受该 actor、目标对象、动作和服务端时间；请求体中的 `actor_id`、`user_id`、`role`、`owner_user_id` 不参与授权。

本轮新增 v3 迁移，保留 v1/v2 SQL、账本和数据。新增 `knowledge_projects`、`project_memberships`、`knowledge_objects`、`resource_grants`。对象的 `scope_kind` 明确区分 `personal` 与 `project`；个人对象只允许 owner，项目对象必须同时满足有效项目成员资格和逐动作 grant。`valid_from <= now < expires_at`，`revoked_at` 非空或到期立即拒绝。动作集合固定为 `read/comment/edit/export/manage_share/delete/review/view_learning_records`，不会由 edit 推导 delete 或 manage_share。

列表、直接对象读取、修改、删除、动作检查和授权撤销都重新查询当前数据库状态；无权对象返回安全 404，不先把全量正文交给前端。管理员角色仅影响身份标签，不能读取他人个人对象。搜索、AI、导出、文件下载、邀请码和完整审核仍未实现，本轮不伪造通过。

共享入口只注册精确 KnowledgeOS 路由。普通业务 Cookie 通过独立 cookie 名称解析为业务 actor，不能注册为 DSH owner，也不进入 owner RPC、插件、Shell、Session 附件或任意文件接口。真实 DSH Host/Connection 停用恢复需要在固定上游环境另行留证；本地纯代码检查不代替真实 Host 证据。
