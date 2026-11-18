# FND-005 预先测试契约

架构与断言在产品编码前建立；独立角色另写需求断言并在冻结候选上复核。所有测试使用合成账号与合成知识对象；凭据、Cookie 和密钥不保存到证据。

| 测试 | 必测断言 | 证据类别 |
|---|---|---|
| T01 | 真实 GPT 选择 read 工具，业务登录身份正确，UI 显示有权对象 | real_provider + real_http_sqlite + real_ui |
| T02 | 真实 GPT 选择 update，revision 只增加一次；UI/HTTP 重读与 SQL 一致 | real_provider + real_http_sqlite + real_ui |
| T03 | 甲的 AI 工具读取乙私人对象拒绝；伪造身份字段拒绝，失败无私有内容 | controlled_model_fixture + real_http_sqlite |
| T04 | 先 prepare，后撤权/成员到期/登出，execute 拒绝且数据库未改变 | controlled_model_fixture + real_http_sqlite |
| T05 | 重复相同参数回放原始结果；变更参数复用键409；重启仍无重复写入 | controlled_model_fixture + real_http_sqlite |
| T06 | stale expected_revision 返回409；内容不覆盖、无幂等成功行 | controlled_model_fixture + real_http_sqlite |
| T07 | 模型不存在、无凭据、额度、权限、超时、取消、非法调用均独立断言 | controlled_model_fixture；实际配置另留证 |
| T08 | 真实浏览器登录、模型名称、状态、工具、结果及重读变化 | real_ui；真实模型未完成时不计全部通过 |
| T09 | 类型/构建、固定 Host 启停重启、迁移回滚、FND001～004受影响回归 | real_host + real_http_sqlite + static |

冻结清单覆盖源码、构建产物、脚本与锁文件；证据包含运行命令、退出码、候选文件 SHA-256、实际状态和明确局限。最终若缺真实 GPT，整体必须 BLOCKED，不以模拟响应或桌面产品订阅代替 API 权限。
