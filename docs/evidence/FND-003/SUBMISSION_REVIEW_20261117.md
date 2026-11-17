# FND-003 提交复核 · 2026-11-17

## 结论

**需要返修，暂不能进入 FND-004。** 固定审查提交为 `b1ff9ae506d98420796a6dd84d90e345a6eaa2d7`，前置指令提交为 `ae805d0aaad2f937b10f5b74c48d38bf6c7192ee`。主体身份功能已有实现与真实运行记录，但六项产品/验收问题未关闭，原十二项PASS不能证明全部冻结义务已满足。

当前唯一指令已替换为CODEX_START.md v3.1.1，FND-003重新置为in_progress，新候选复测NOT_RUN。FND-001/FND-002继续passed，FND-004保持planned且未激活。本次只提交审查、反例、返修指令及状态，没有修改产品源码或构建产物。

## 已核实的成果与检查范围

远端tree为 `4ed0fae711d23ea925379f56d1f84e70c9b473d3`，575个blob；本次materialize的299个文本文件逐个核对Git blob SHA。候选manifest的21项字节长度和SHA-256全部匹配b1ff9ae检出。原r2十二项共有79条断言，独立r5九组23条断言，记录均为true。候选原计划/范围检查实跑通过。

r2到r10的产物变更可追溯：原T12篡改副本去掉人为追加换行，恰回到记录的旧hash；最终index.js变化集中于请求取消信号增加res.close及三处传入res，其余三个lib hash相同。这个差异可以解释，不将全部历史结果笼统判为无效。

本次另实际运行四个反例探针：真实候选HTTP适配/IdentityService/scrypt/临时SQLite；真实apply的受控Context；真实SQLite和实际账号脚本的受控DOM/fetch；提取实际测试检查表达式的隔离验证。**没有在当前环境重跑完整DSH Host或真实浏览器验收。** 反例范围与命令见 [复验材料](reviews/b1ff9ae/README.md)。

## FND003-R1：身份入口前置条件与IPv6不一致（P1）

定位：`src/host/index.ts`的inject、身份注册effect和ownerSetupPage；`identity-http.ts`的assertTrust/bootstrap。当前插件只声明webServer/clientModules，身份路由未绑定Connection服务生命周期；自有Host/Origin/专用头防护仍存在，但不能代替已约定的真实Connection依赖。全部业务身份入口也没有统一的loopback listener启用条件，只有bootstrap另查本机。

实际候选apply在无Connection的受控Context仍注册八个身份API，auth/status返回200、available=true；身份handler在listener事实为0.0.0.0时仍允许普通注册201并落库。IPv6 helper接受`::1`，但设置页先split(':')[0]后拒绝该地址。分别见 [组件输出](reviews/b1ff9ae/connection-result.json) 和 [身份输出](reviews/b1ff9ae/identity-result.json)。组件仅stub配置Schema依赖，不是完整DSH运行，更不宣称已证明公网越权。

固定上游依据：[WebServer源码](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/host/webserver/src/index.ts)的authorize在没有监听器时对anonymous默认allow；[ClientModules源码](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/modules/src/index.ts)只依赖loader并可选注入webServer，不保证Connection存在；[Connection契约](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/connection/README.md)明确来源检查由活跃Connection提供。

关闭要求：身份路由绑定真实Connection依赖及停用/恢复生命周期；非loopback listener不能启用本轮身份能力；设置页与bootstrap共用正确IP规范化，不以默认host/origin掩盖事实缺失。T01/T05/T12补生产适配器与真实Host依赖生命周期反例。

## FND003-R2：来源尝试限流及取消证明不足（P1）

定位：`identity.ts`的AuthRateLimiter、bootstrap/register/login；`scripts/fnd003/run-all.mjs`的T10。

来源计数只在失败登录时递增，注册与成功登录只check而不计数。使用实际候选scrypt和同一真实HTTP来源，31次成功登录在11,123ms内全部200，未出现429，违背同来源30次认证尝试/分钟的既定默认值。见 [身份输出](reviews/b1ff9ae/identity-result.json)。

原T10只覆盖同账号五次错密；KDF测试在2个运行和8个排队之后取消第12个请求，该请求此前已被超限拒绝，未证明有效排队或运行任务的取消。独立HTTP断开证明没有建用户，但未记录任务已运行及真实KDF峰值。429统一Retry-After=60也不能准确描述15分钟账号限制。

关闭要求：来源尝试与账号失败分别计数，合法DTO之后、KDF之前原子计入来源尝试，包含成功登录和注册；窗口/容量有界，Retry-After来自剩余窗口。补同来源成功/失败/混合请求、真实HTTP恢复，以及确已运行/确在队列的取消时序与无写库证明，不降低生产KDF成本。

## FND003-R3：DTO及不支持查询被静默忽略（P2）

定位：`identity-http.ts`的register及各handler。register允许`learning_tracks`，却读取`body.learningTracks`；实际传入architecture_exam后返回和保存为空数组。`/me?user_id=another-user&role=admin&service_id=another-service`返回200本人数据，没有发生越权，但未按冻结规则拒绝身份覆盖查询。见 [身份输出](reviews/b1ff9ae/identity-result.json)。

关闭要求：遵守原冻结DTO，bootstrap/register仅接受login_name、password、display_name、可选timezone；方向/主线/目标通过本人偏好PATCH保存并回读。全部身份API拒绝不支持的query和未知字段，不接受后丢弃。通过T03/T06/T07正反对照关闭。

## FND003-R4：身份切换与退出保留旧私人状态（P1）

定位：`identity-http.ts`的buildAccountHtml。运行实际页面脚本的受控DOM/fetch后发现：退出响应前旧资料仍可见；成功后仅隐藏profile、清who，goal/domains/tracks及两个密码框仍保留。切换乙期间，甲资料仍可见，乙登录成功而新/me未返回时仍能点击保存，实际产生包含甲goal和revision的PATCH；若新/me返回503，界面同时显示“未登录”和“登录成功”。见 [页面脚本输出](reviews/b1ff9ae/storage-ui-result.json)。

本次直接证明了错误PATCH的产生；真实浏览器新Cookie生效后可能把旧草稿写入新账号，尚未在完整DSH浏览器中重跑该跨账号写入路径，必须纳入修复后验收。

关闭要求：退出/切换开始立即清空旧私人状态、草稿、revision和密码并禁用旧身份写操作；新/me成功后才可编辑，所有迟到响应按身份代次丢弃；区分未初始化、401、503、429并防重复提交。修复此状态职责时沿用既定React/TypeScript/esbuild小页面构建，不新增框架或工作区。

原主T11先HTTP初始化再截图setup，成员甲复用带owner Cookie的context；独立T11在首次/me未完成、profile本来隐藏时程序click隐藏logout，未验证已有私人资料清空。新T11必须真实表单初始化、干净业务上下文、可见按钮操作，并检查甲→乙延迟/me期间的DOM、网络和数据库。

## FND003-R5：伪v2约束缺失可被接管，事务故障测试未走生产入口（P1）

定位：`storage.ts`的#assertV2Definitions和testOnlyIdentityTransactionFailure；主T08/T09及独立T09-gap。

真实SQLite反例只删除users.login_name的UNIQUE，保持表名/列名、版本、application_id和账本，候选仍available=true，把journal_mode从delete改为wal；初始化后两次同名注册都created，独立SQL确认重复登录名两行。见 [存储输出](reviews/b1ff9ae/storage-ui-result.json)。仅检查列名和少数SQL片段不足以核实真实schema约束。

原T09调用另写SQL的testOnlyIdentityTransactionFailure，未穿过生产bootstrap/register，也未真正写space和初始化标记；迁移反例是v1 SQL失败，并非v2失败保留旧v1数据。独立补充只是重名注册，不能替代三条生产事务故障义务。

关闭要求：修改性PRAGMA前核验真实类型、PK/NOT NULL、UNIQUE、FK、CHECK及允许对象，补缺用户名UNIQUE、缺personal owner UNIQUE、关键FK和错误类型反例，拒绝库保持不变、合法v2正常接受。通过生产bootstrap、register和v2迁移入口分别注入中途失败，验证多表/标记/账本原子性和v1哨兵，再解除故障走正常HTTP/启动恢复。

## FND003-R6：实际加载检查及独立失败退出不成立（P1）

定位：`scripts/fnd003/run-all.mjs`的T12，`independent-verification.mjs`的check与最终输出。

T12虽推导packageDir，实际循环只读REPO文件，packageDir只用于输出。隔离反例让profile指向篡改安装副本，其实际hash不同，但原比较仍0 mismatch；只有改临时REPO文件才失败。负例也只是计算新hash不同，没让实际加载检查器拒绝。另提取独立check逻辑注入false，JSON报告FAIL而进程仍exit0。见 [检查器反例](reviews/b1ff9ae/evidence-result.json)。

独立脚本未进入manifest，结果没有起止时间/运行版本/产物hash，candidate硬编码r2。旧记录的可追溯性保留，但不足以关闭真实加载与最终候选义务。

关闭要求：解析profile真实安装/包导出及realpath，对实际加载lib和页面资源与事先冻结manifest逐值比较；同一检查器对不匹配安装副本返回失败和非零。独立脚本断言失败、异常、缺项必须非零；将其及最终源码/测试/构建/配置/锁纳入候选，记录版本、起止时间和hash，最终候选重跑十二项及独立复核。

## 发布修正与交付门槛

三条历史失败JSON的error中共13个私人file URL前缀已替换为占位符：t02-06-check/T05、t11-check/T11、t12-check-r3/T12。只脱敏路径，不改失败、断言、时间或候选值；原字节可追溯b1ff9ae。原报告“绝对路径均未公开”的说法不成立，此处更正。未发布的原始.log仅是原执行机引用，不补造日志，不将摘要称为原始日志。

六项全部关闭、最终十二项与独立复核真实通过后，才更新本单元passed/test_result_status=PASS/independent_review_status=PASS/retest_status=PASS，completed_test_ids精确十二项，open为空，closed包含FND003-R1至R6，并填真实证据和完成时间。execution_state置awaiting_user，active_unit仍FND-003，正常提交推送后等待用户；不得自动开始第四部分。
