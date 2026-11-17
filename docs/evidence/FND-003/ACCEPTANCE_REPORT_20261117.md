# FND-003 最终验收报告

更新：2026-11-17（Asia/Shanghai）  
工作分支：`codex/knowledgeos-fnd-003`  
最终候选：`fnd003-candidate-20261117-r21`  
固定上游：`39163dd30f703a79079e2d2446545cff3c453738`  
主运行：`docs/evidence/FND-003/runs/fnd003-candidate-20261117-r21/summary.json`  
独立复核：`docs/evidence/FND-003/runs/independent-20261117-r13/summary.json`

FND003-R1 至 R6 已关闭。最终候选 T01–T12 全部真实 PASS，独立复核全部 PASS；没有 FAIL、BLOCKED 或 NOT_RUN 被计为 PASS。FND-003 标记 `passed / awaiting_user`，FND-004 未开发。

## 本轮收口

- **普通身份本机准入**：`identityAvailable()` 现在统一要求活跃 `connection.authentication`、未终止的 browser Peer、已绑定的真实 WebServer 端口、有效 `getOrigin()`，并同时验证 listener host 与 origin hostname 为严格 loopback。地址判断覆盖 IPv4、IPv6、IPv4-mapped IPv6、括号和非法地址；`/knowledgeos/account`、`/knowledgeos/setup` 与八个身份 API 共用该门禁。
- **Connection 生命周期**：独立复核分别记录受控适配器与实际 Host。适配器覆盖 Connection 正常、缺失、停用、非 loopback 和恢复；实际固定版本 Host 覆盖运行时 200、Host/Connection 停止后的不可用（请求无匿名回退）以及重启后的 200 恢复。
- **真实浏览器初始化**：T11 从空数据库启动，真实 Chrome 打开 `/knowledgeos/setup`，填写管理员登录名、显示名和密码并点击创建；数据库核对恰有一个管理员。重复初始化返回 `409 ALREADY_INITIALIZED`，随后普通注册、登录、偏好保存和 Alice/Bob 身份竞态均通过。
- **安装篡改负例**：T12 先复制完整有效安装目录，只追加篡改到 `lib/index.js`，运行同一个 `check-loaded-artifacts.mjs`。未修改副本通过；篡改副本退出码为 1，唯一 mismatch 是 `packages/knowledgeos-panel/lib/index.js`，并明确给出 expected/actual SHA-256。
- **证据脱敏**：新候选 JSON、独立摘要和报告只保留相对路径、状态、字节数及 SHA-256；本机绝对路径、Cookie、密码、token 未进入公开摘要。历史 r16、r9、r2、r5、r10 结果保持原样。

## 环境与检查

Node 24.22.0；SQLite 3.53.4；Chrome 157.0.8103.52；固定 DSH Host；profile `knowledgeos-identity-test`；主端口 3101；独立端口 3115。

已执行并通过：

- `node scripts/verify-plan.mjs`
- `node packages/knowledgeos-panel/build.mjs`
- `node packages/knowledgeos-panel/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json`
- `node scripts/fnd003/scope-check.mjs`
- 冻结候选 r21
- 主运行 T01–T12
- 独立复核 r13
- 实际 profile 加载器校验与受影响 FND-002 status/records 回归

`node scripts/prepare-upstream.mjs --check` 返回 `SOURCE_READY`，确认固定提交 `39163dd30f703a79079e2d2446545cff3c453738` 与上游源码目录可用。

## 结果与范围

T01–T12 逐项 JSON 全部 PASS。T01 包含生产 loopback 地址解析与 owner 初始化；T03 包含八个身份 API 的 query 422 矩阵；T06 包含四领域、三主线、中文目标和时区重读；T07 包含 bootstrap/register 不支持字段 422 且无写入；T10 包含真实来源限流、动态 Retry-After、运行/排队取消；T11 包含空数据库真实浏览器初始化、单管理员核对、重复初始化拒绝、普通注册登录及迟到 `/me` 保护；T12 包含完整安装副本的单文件 SHA-256 篡改负例和 FND-002 回归。

本报告只关闭 FND-003 身份与个人偏好切片。完整 F03、对象 ACL、资料/学习计划/评分、模型/RAG、jobs/audit/outbox、Windows 安装和完整产品审查仍未验证；FND-004 保持未激活。现在停止，等待用户批准 FND-004。
