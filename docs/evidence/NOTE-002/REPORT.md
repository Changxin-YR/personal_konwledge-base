# NOTE-002 私人笔记层级大纲验收

冻结候选 `ac7fe69bd3bb55ea4c09e86e5c97858a239046e1`。真实隔离 DSH Web Host、Chrome、SQLite v26 的[主跑](runs/main-raw.json)和 [Epicurus 独立复跑](independent.json)都通过 T01/T02，服务进程和数据目录独立。正式判定见 [acceptance.json](acceptance.json)。A17 未运行，F21 保持进行中，待 NOTE-003 脑图双向验收。

| 检查 | 实测结果 |
| --- | --- |
| T01 | Chrome 创建三层节点并缩进、提升、上移、下移、跨分支移动和撤销。对照页面、HTTP 和 SQLite 验证稳定 ID、子树正文、顺序和父子位置。循环、跨笔记、非法位置及移动或删除根被拒绝；重启后固定版本的引用和原件仍可读取。 |
| T02 | 取消删除预览不写入；子树软回收和按原序提升子节点均经 Chrome 实测并撤销。缺失、异目标或过期预览以及另一有效账户的读写请求被拒绝。旧标签页移动、过期预览确认均返回 409；刷新保留两边实际文本且发出零次写请求。 |
| 独立发现与关闭 | `78fb044` 虽通过当时的脚本，独立审查发现回收含草稿的节点可能把草稿接到父节点。修复后，回收的节点草稿只读，保存/新增禁用，父节点保持原文；撤销只恢复到原节点 ID，主跑和独立复跑均覆盖。 |
| 迁移与回归 | v25 真实旧库升级失败后账本、SQL 定义、笔记与引用保留；v26 重试通过。注入修订更新失败后树、回收标记和撤销数据全部回滚。类型、构建、21 项受影响测试、NOTE-001 的 8 项真实浏览器检查通过。 |

[移动节点截图](runs/moved-branch.png) · [删除预览截图](runs/delete-preview.png) · [双标签冲突截图](runs/conflict.png) · [回收草稿保护截图](runs/removed-node-draft.png)。仅使用合成业务数据；未执行模型请求或 Windows 安装验收。

历史保留：`f918db1` 的[主跑](runs/superseded-main-raw.json)和[独立复跑](runs/superseded-independent-raw.json)在测试未等待节点选中前读输入框，T02 失败；`78fb044` 修复等待后[主跑](runs/pre-review-main-raw.json)和[独立复跑](runs/pre-review-independent-raw.json)通过当时断言，但未获代码审查放行。两者均未作为正式通过证据。
