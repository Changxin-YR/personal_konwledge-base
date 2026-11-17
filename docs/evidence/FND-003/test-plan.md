# FND-003 独立测试计划

> 历史记录：本文保留b1ff9ae提交时的架构或测试材料。当前FND-003已因提交复核进入v3.1.1返修，须按唯一CODEX_START.md更新本轮设计与测试计划；原PASS声明不代表当前验收通过。见 [提交复核](SUBMISSION_REVIEW_20261117.md)。

更新：2026-11-17（Asia/Shanghai）  
状态：冻结候选 `fnd003-candidate-20261117-r2` 的十二项真实验收已 PASS；独立复核结论单独记录，未将实现者摘要代替独立证据。
环境：Node 24.22.0、固定 DSH 39163dd30f703a79079e2d2446545cff3c453738、profile `knowledgeos-identity-test`、home `.cache/dsh-home-fnd003`、隔离业务 dataDir、端口 3101；合成账号和秘密只在本机临时目录。

## 运行与证据命令

- `node scripts/fnd003/run-all.mjs --out docs/evidence/FND-003/runs/<candidate> --run-id <id> --port 3101`
- `node scripts/fnd003/scope-check.mjs`
- `node packages/knowledgeos-panel/build.mjs`
- `node packages/knowledgeos-panel/node_modules/typescript/bin/tsc -p packages/knowledgeos-panel/tsconfig.json`
- `node scripts/verify-plan.mjs`

每项记录候选提交/工作树指纹、真实命令、退出码、起止时间、Node/SQLite/浏览器/profile/端口、脱敏 HTTP/SQL/浏览器证据。真实 HTTP/SQLite/浏览器和受控适配器分列。FAIL/BLOCKED/NOT_RUN 不计为 PASS。

## 十二项预期

| ID | 关键正常路径 | 必须反例与独立证据 |
|---|---|---|
| T01 | owner loopback bootstrap 一次成功，重启/并发后最多一个管理员 | 匿名、业务 Cookie、伪 owner、非 loopback/缺 Connection 拒绝；独立 SQL 校验单例、凭据、space、initialized_at |
| T02 | 管理员/甲/乙注册、登录、退出、重登，注册不自动登录 | 规范名重复/并发仅一次，member 角色和三 personal spaces 隔离；三 Cookie jar 脱敏记录 |
| T03 | owner/业务/匿名三上下文分离 | owner Cookie 无业务 actor；业务 Cookie 无 owner RPC/文件/插件；禁止身份覆盖字段；DB 前后无意外变化 |
| T04 | 12h opaque session，登录替换当前旧会话，logout 持久撤销，重启仍失效 | 伪造 token、客户端 session id、到期 now>=expires_at、disabled/revoked；Cookie 属性与仅哈希 SQL |
| T05 | 精确 Origin/Host + JSON + X-KnowledgeOS-Request 变更成功，GET 只读 | 外站/null/malformed Origin、错误头/media/simple form/Forwarded 伪造拒绝，拒绝不写库；Connection 缺失 503/拒绝 |
| T06 | 四领域、三主线、中文目标、IANA 时区保存并重读，spaces 仅本人 | 两会话同 revision 一次 200 一次 409；夹带他人标识拒绝；重启 SQL 对照 |
| T07 | scrypt 版本参数、随机 salt、统一 INVALID_CREDENTIALS、严格输入 | 密码边界/非法 Unicode/超 body/未知字段/SQL 文本；公开输出不含密码/token/path |
| T08 | 新库 v1→v2、旧 v1 升级、重复启动保持 v1 checksum/记录 | future/wrong app/bad checksum/unknown/prefix fixture 修改前拒绝；v2 外键/唯一/service_id |
| T09 | 初始化/注册/迁移故障注入回滚后可恢复 | 无孤立行/半提交；故障只在测试层，KDF 不在事务 |
| T10 | 2 running + 8 queued KDF、两级失败限流、真实恢复 | 429 + Retry-After、取消排队移除、运行任务回调前占槽，轻量 status 不阻塞 |
| T11 | 浏览器 setup→register→login→preferences→refresh→logout，双上下文 | loading/未初始化/未配置/401/429/503，迟到响应不串号，1366/1920 截图 |
| T12 | build/typecheck/scope/plan、profile hash、关闭/重启、旧 status/records 回归 | 篡改候选失败；无 FND-004 实现；所有证据绑定同一候选 |

独立角色执行时只读冻结源码和测试，失败先回传最小复现；不以实现者摘要代替真实结果。
