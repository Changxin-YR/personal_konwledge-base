# FND-003 独立测试计划

更新：2026-11-17（Asia/Shanghai）  
状态：最终候选 fnd003-candidate-20261117-r16 已完成 T01–T12；独立复核 independent-20261117-r9 已 PASS。旧 r2/r5/r10 目录与报告保留为历史证据。

环境：Node 24.22.0、SQLite 3.53.4、Chrome 157.0.8103.52、固定 DSH 39163dd30f703a79079e2d2446545cff3c453738、profile knowledgeos-identity-test、home .cache/dsh-home-fnd003、主端口 3101、独立复核端口 3115。

## 验收命令

- node scripts/verify-plan.mjs
- node scripts/prepare-upstream.mjs --check
- node packages/knowledgeos-panel/build.mjs
- node packages/knowledgeos-panel/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json
- node scripts/fnd003/scope-check.mjs
- node scripts/fnd003/freeze-candidate.mjs --candidate fnd003-candidate-20261117-r16 --out docs/evidence/FND-003/candidate-manifest-r16.json
- node scripts/fnd003/run-all.mjs --run-id fnd003-candidate-20261117-r16 --candidate fnd003-candidate-20261117-r16 --manifest docs/evidence/FND-003/candidate-manifest-r16.json --out docs/evidence/FND-003/runs/fnd003-candidate-20261117-r16 --port 3101
- node scripts/fnd003/independent-verification.mjs --run-id independent-20261117-r9 --candidate fnd003-candidate-20261117-r16 --out docs/evidence/FND-003/runs/independent-20261117-r9 --port 3115

任何断言失败、异常、缺项或检查器非零均保持 FAIL；不以历史 PASS 或结构检查替代真实运行。

## T01–T12 覆盖

| ID | 实际覆盖 |
|---|---|
| T01 | 真实 owner 初始化、并发唯一性、重启标记；IPv4/IPv6/mapped 和 Connection/loopback 准入 |
| T02 | 管理员、甲、乙独立业务会话、重名冲突、personal space |
| T03 | owner/业务权限分离、八个身份 API query 422、禁止身份覆盖字段、数据库不变 |
| T04 | opaque session、替换/注销/到期/disabled/重启 |
| T05 | Origin/Host/Fetch-Metadata/JSON/专用头和 Forwarded 反例 |
| T06 | 四领域、三主线、中文目标、时区、重启持久化和 revision 冲突 |
| T07 | 严格 DTO、密码/KDF、非法 UTF-8、未知字段、SQL 文本和证据脱敏 |
| T08 | 真实 v1→v2、完整约束预检、伪 v2/未知对象拒绝且原库不变 |
| T09 | bootstrap/register/v2 migration 生产事务故障回滚与正常恢复 |
| T10 | 来源/账号双层限流、动态 Retry-After、2 running + queue、运行/排队取消与恢复 |
| T11 | 真实 Chrome setup、Alice/Bob 独立上下文、退出清空、迟到 /me 与禁写竞态 |
| T12 | 构建、类型、scope、真实 profile realpath/hash、篡改安装检查器非零、关闭与 FND-002 回归 |

真实 Host、浏览器、受控适配器和测试夹具在逐项 JSON 中分列；所有账号、密码和目标均为合成数据。
