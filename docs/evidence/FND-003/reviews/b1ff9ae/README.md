# FND-003 提交复核反例

复核对象：`b1ff9ae506d98420796a6dd84d90e345a6eaa2d7`。日期：2026-11-17。运行环境：Node `24.22.1`、SQLite `3.53.4`、Linux。

本目录保存对该固定候选的三组受控反例，共四个可执行探针。脚本使用候选实际源码或构建产物，移植时只将固定工作区路径改为两个命令行参数：候选检出根目录、输出 JSON 文件。验证逻辑未改变。移植后的四个命令已对上述原候选再次运行，均正常结束，输出见本目录 JSON；没有声称已在返修后的产品候选上运行。

## 文件与验证边界

| 分组 | 脚本与实际输出 | 证明范围 |
|---|---|---|
| 身份与准入 | [identity-probe.mjs](identity-probe.mjs)、[identity-result.json](identity-result.json) | 真实候选身份 HTTP handler、IdentityService、scrypt、临时 SQLite；HTTP 服务与 listener 事实为受控适配器，不是完整 DSH Host |
| 身份与准入 | [connection-probe.mjs](connection-probe.mjs)、[schema-loader.mjs](schema-loader.mjs)、[connection-result.json](connection-result.json) | 实际候选 `apply()` 在受控 WebServer/ClientModules Context 下的路由注册；仅配置声明依赖 `@deepseek-ai/schemastery` 使用最小 stub，没有真实 DSH Connection 服务 |
| 存储与界面 | [storage-ui-probe.mjs](storage-ui-probe.mjs)、[storage-ui-result.json](storage-ui-result.json) | 临时 SQLite 中构造缺少唯一约束的 v2 库；读取并执行候选账号页面的原始脚本，DOM/fetch 受控，不是真实浏览器验证 |
| 验收工具 | [evidence-probe.mjs](evidence-probe.mjs)、[evidence-result.json](evidence-result.json) | 隔离复现候选验收脚本的哈希比较/路径解析表达式和独立检查函数，证明比较对象及退出码问题；没有运行完整 Host 验收 |

这些探针均只使用合成数据和临时目录。脚本中的密码常量仅用于运行时临时创建的合成账号；输出 JSON 不包含密码、Cookie、会话令牌或个人目录。探针结束后清理自身创建的临时数据库和副本，不修改候选产品文件。

## 复验方式

从本仓库根目录运行以下命令，将两个占位符分别替换为固定提交 `b1ff9ae` 的检出目录和新的输出文件路径。输出文件的父目录须已存在。候选目录应保留该提交的源码、`lib/`、脚本和候选 manifest；不要用返修指令分支的状态文件替代原候选文件。

```sh
node --experimental-transform-types docs/evidence/FND-003/reviews/b1ff9ae/identity-probe.mjs "<候选检出根目录>" "<新输出JSON路径>"

node --experimental-transform-types --experimental-loader ./docs/evidence/FND-003/reviews/b1ff9ae/schema-loader.mjs docs/evidence/FND-003/reviews/b1ff9ae/connection-probe.mjs "<候选检出根目录>" "<新输出JSON路径>"

node docs/evidence/FND-003/reviews/b1ff9ae/storage-ui-probe.mjs "<候选检出根目录>" "<新输出JSON路径>"

node docs/evidence/FND-003/reviews/b1ff9ae/evidence-probe.mjs "<候选检出根目录>" "<新输出JSON路径>"
```

Node 的实验性类型转换及 loader 警告不属于产品结论。第一组使用真实密码计算，运行约十余秒；具体时间以输出为准。

## 如何解释输出

**进程 exit 0 只表示反例探针正常执行完毕，不代表产品通过。** 身份结果中的 `outcome=FAIL` 表示实际候选违反对应预期；存储/UI 结果的 `reproduced=true` 表示缺陷已复现。验收工具结果用明确布尔值记录反例，其中嵌套的 `independent_false_assertion_exit_code=0` 是待修正工具行为本身。

本次再次运行确认：

- 非 loopback listener 事实下仍能注册；缺 Connection 的受控组件仍注册身份路由并报告 available；IPv6 setup 判断不一致。
- 接受的 `learning_tracks` 被忽略；不支持的身份 query 返回本人资料而非拒绝，未据此声称越权；同来源 31 次成功登录均未被来源尝试限额拒绝。
- 缺少登录名唯一约束的伪 v2 库被接受，journal 变为 WAL，能够创建两个同名账号。
- 退出保留旧私人草稿及密码字段；账号切换窗口仍可提交上一身份的偏好内容；503 被页面吞成未登录。
- 实际安装目录产物不同，原比较表达式仍可报告仓库文件匹配；独立检查函数出现 FAIL 时进程仍可退出 0。

本目录是原候选的复核证据，不是新的执行入口，也不能替代返修后的完整 T01–T12、真实 DSH Host、真实浏览器及独立验收。返修后应从当前执行提示词取得测试范围，冻结新候选、建立新运行目录并保留原反例记录。
