# FND-004 架构决定

日期：2026-11-18（Asia/Shanghai），执行提示词修订 3.2.1

FND-004 沿用 `HTTP/API → 应用用例 → 领域授权规则 → SQLite 端口/适配器`。业务会话由 FND-003 的 `IdentityService.actor()` 生成，权限判断只接受该 actor、目标对象、动作和服务端时间；请求体中的 `actor_id`、`user_id`、`role`、`owner_user_id` 不参与授权。

本轮新增 v3 迁移，保留 v1/v2 SQL、账本和数据。新增 `knowledge_projects`、`project_memberships`、`knowledge_objects`、`resource_grants`。对象的 `scope_kind` 明确区分 `personal` 与 `project`；个人对象只允许 owner，项目对象创建先核对当前登录 actor、目标 project 的 service/status 和当前时刻有效 membership，再执行写入；非成员不能借创建对象得到项目授权。项目对象读取仍必须同时满足有效 membership 和逐动作 grant。`valid_from <= now < expires_at`，`revoked_at` 非空或到期立即拒绝。动作集合固定为 `read/comment/edit/export/manage_share/delete/review/view_learning_records`，不会由 edit 推导 delete 或 manage_share。

列表、直接对象读取、修改、删除、动作检查和授权撤销都重新查询当前数据库状态；撤权请求接受 `grant_id`，先核对 grant 所属 service/object 和当前 actor 的 `manage_share`，数据库更新只允许一个未撤销记录获胜。无权对象返回安全 404，不先把全量正文交给前端；有权对象的 stale `expected_revision` 返回 409。管理员角色仅影响身份标签，不能读取他人个人对象。搜索、AI、导出、文件下载、邀请码和完整审核仍未实现，本轮不伪造通过。

共享入口只注册精确 KnowledgeOS 路由。普通业务 Cookie 通过独立 cookie 名称解析为业务 actor，不能注册为 DSH owner，也不进入 owner RPC、插件、Shell、Session 附件或任意文件接口。3.2.1 在固定上游 DSH `39163dd30f703a79079e2d2446545cff3c453738` 的专用共享 profile 上，用真实登录和三个隔离 Cookie 做了 HTTP 探测；本机 owner Host 与业务共享 profile 分开记录。Connection 停用恢复的上游限制仍不宣称为本轮完整通过。
