# FND-003 验收报告

更新：2026-11-17（Asia/Shanghai）  
工作分支：codex/knowledgeos-fnd-003  
最终候选：fnd003-candidate-20261117-r16  
固定上游：39163dd30f703a79079e2d2446545cff3c453738  
最终运行：docs/evidence/FND-003/runs/fnd003-candidate-20261117-r16/summary.json  
独立复核：docs/evidence/FND-003/runs/independent-20261117-r9/summary.json

六项返修问题 FND003-R1 至 R6 已关闭。最终候选的 T01–T12 全部 PASS，独立复核全部 PASS；FND-003 标记 passed，FND-004 未开发。旧 r2、r5、r10 报告和运行结果保持历史原样。

## 修复内容

- R1：Connection 与 authentication 依赖进入 Host 注入和身份路由生命周期；身份能力要求真实 origin、loopback listener/socket 和有效 owner；IPv4、IPv6、mapped IPv6 统一校验。
- R2：来源认证尝试在严格 DTO 后、KDF 前计数，成功/失败注册与登录均计入；账号失败限流分离；KDF 限制为 2 个运行、8 个排队，运行取消等待真实回调，排队取消移除，动态 Retry-After。
- R3：bootstrap/register 严格 DTO；所有身份 API 拒绝 query 参数；领域、三条学习主线和目标只由 preferences 保存并回读。
- R4：退出/切换立即清空资料、草稿、revision 和密码并禁用保存；登录输入先捕获再清空；generation 丢弃迟到响应，防止旧草稿提交给新账号。
- R5：v2 预检覆盖列、类型、NOT NULL、PK、UNIQUE、FK、CHECK 和未知对象；bootstrap/register/v2 migration 生产事务故障均验证回滚与正常恢复。
- R6：冻结清单包含源码、构建产物、测试、独立脚本和实际加载检查器；检查真实 profile realpath、哈希和字节数；篡改安装副本由同一检查器以非零退出；候选与全部证据绑定。

## 环境与命令

Node 24.22.0；SQLite 3.53.4；Chrome 157.0.8103.52；固定 DSH Host；profile knowledgeos-identity-test；主端口 3101；独立端口 3115。

主要命令及退出码均为 0：

- node scripts/verify-plan.mjs
- node scripts/prepare-upstream.mjs --check
- node packages/knowledgeos-panel/build.mjs
- node packages/knowledgeos-panel/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json
- node scripts/fnd003/scope-check.mjs
- node scripts/fnd003/run-all.mjs --run-id fnd003-candidate-20261117-r16 --candidate fnd003-candidate-20261117-r16 --manifest docs/evidence/FND-003/candidate-manifest-r16.json --out docs/evidence/FND-003/runs/fnd003-candidate-20261117-r16 --port 3101
- node scripts/fnd003/independent-verification.mjs --run-id independent-20261117-r9 --candidate fnd003-candidate-20261117-r16 --out docs/evidence/FND-003/runs/independent-20261117-r9 --port 3115

## 结果

T01–T12 逐项 JSON 全部 PASS。T03 含八个身份 API 的 query 422 矩阵；T06 含四领域/三主线/中文目标/时区重读；T07 含 bootstrap/register 不支持字段 422 且无写入；T10 含真实来源限流、动态 Retry-After、运行/排队取消；T11 使用 owner、Alice、Bob 分离上下文和真实可见退出操作，验证字段清空、保存禁用及迟到 /me 不串号；T12 含实际 profile 加载路径校验和篡改副本非零门禁。

独立复核 T01-adapter、T04-gap、T05-gap、T06-gap、T07-gap、T08-gap、T09-gap、T10-gap、T11-gap 全部 PASS，失败退出逻辑也通过控制检查。

## 范围

本报告只关闭 FND-003 身份与个人偏好切片。完整 F03、对象 ACL、资料/学习计划/评分、模型/RAG、jobs/audit/outbox、Windows 安装与完整产品审查仍未验证；FND-004 保持未激活。
