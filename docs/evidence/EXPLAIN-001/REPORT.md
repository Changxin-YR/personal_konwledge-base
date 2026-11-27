# EXPLAIN-001 单文件代码讲解验收报告

## 结果

EXPLAIN-001 当前单元验收为 `PASS`。固定候选的两次真实模型运行已经完成，各运行一次主跑和独立复跑。两次初始 runner 都在离线答复断言处报告 `FAIL`，真实答复已保存。修复 `scripts/explain001/host-oracle.mjs` 后，仅使用保存的 `actual-answer.json` 完成离线重验，两份答复均为 `PASS`。

真实模型调用次数为主跑 1 次、独立复跑 1 次，合计 2 次。离线重验和后续技术检查没有新增真实模型调用。

## 候选与固定输入

- 初始真实运行候选 SHA：`40ac5bdfbe628ec7ef486b69ba6cdf778fc6fa2d`
- 修复后冻结候选 SHA：`1a93562b68417bc31af568206c96dc7b367b6b68`
- 修复后候选树 SHA-1：`52624ca3419b880d2ae008374a78b49b64c39997`
- 上游 DSH 固定 SHA：`39163dd30f703a79079e2d2446545cff3c453738`
- 构建入口 SHA-256：`e13659019b9900fb8d2b4c5dd3f8a07ea359a0f17a6cf04a859f08478fc81213`
- 构建 SHA-256：`e53ef37bca33b91879fd35b244dbc2c29dac0be78f8d282b2bd7d1179e786c72`
- 提供方和模型：`tokease` / `deepseek-v4.1-flash-1017`
- 固定来源：`src/shipping-fee.js`，commit `61e02f2598f627b21a5d31d0bd3dc1ed6f82216f`，blob `a52c5e085ef41dcdcbf82660105276048bcaefd3`，选中第 2–6 行
- 脱敏请求和用量记录：`runs/sanitized-request-and-usage.json`
- 费率审批记录：`runs/price-approval.json`

## 初始失败与修复

主跑初始失败记录为 `runs/main-live-initial-summary.json`，失败信息是 `readings need evidence for fixture line 2`。主跑答复已返回第 2 行作为逐字事实，原断言却要求第 2 行必须出现在解读引用覆盖集合中。修复后，事实覆盖和解读对实现行 4、5 的覆盖分别检查。

独立复跑初始失败记录为 `runs/independent-live-initial-summary.json`，失败信息是 `contradictory fee for subtotal 50`。旧正则会把“50 时返回 0”这类条件描述当成 `50→0`，再与明确的 `50→8` 发生冲突。修复后的正则只接受明确箭头映射，因此保留了 `50→8` 和 `51→0` 的断言，并拒绝该误匹配。

初始失败证据和诊断记录保存在 `runs/initial-failures.json`。修复记录保存在 `runs/repair-retest.json`。

## 离线复验

`runs/offline-revalidation.json` 对两份保存答复分别执行 `verifyAnswer`，结果如下。

- 主跑实际答复：`runs/main-live-actual-answer.json`，`PASS`
- 独立复跑实际答复：`runs/independent-live-actual-answer.json`，`PASS`
- 固定事实覆盖第 2、4、5 行：`PASS`
- 解读引用实现第 4、5 行：`PASS`
- 明确费率映射 `50→8`、`51→0`：`PASS`
- “50 时返回 0”误匹配防护：`PASS`
- 注释与实现边界冲突及外部调用者未知局限：`PASS`
- 越界、未固定文件和哨兵文本泄露检查：`PASS`

真实答复和截图已从保存的两次运行归档。现有截图是初始 runner 在提交答复前保存的选中文件页面，分别为 `runs/main-live-selected-source.png` 和 `runs/independent-live-selected-source.png`。初始 runner 在答复断言处停止，因此没有额外生成答复分组截图。

## 技术检查

- `npm run typecheck`：`PASS`
- `npm run build`：`PASS`
- `node --experimental-transform-types --test scripts/explain001/source.test.mjs`：`PASS`，9 项
- `node scripts/verify-plan.mjs`：`PASS`，44 项需求、66 个验收场景、76 个单元
- `node scripts/test-verify-plan.mjs`：`PASS`，148 项计划门禁回归

直接执行 `node --test scripts/explain001/source.test.mjs` 会在当前 Node 24 环境因 TypeScript 参数属性的 strip-only 限制失败。按项目可用入口加入 `--experimental-transform-types` 后 9 项测试全部通过。该入口差异已保留在验收记录中。

## 证据索引

- `acceptance.json`：主跑单元结果
- `independent.json`：独立复核结果
- `summary.json`：单元汇总
- `runs/initial-failures.json`：两次真实运行的初始失败与诊断
- `runs/offline-revalidation.json`：保存答复离线重验
- `runs/repair-retest.json`：断言修复和零新增模型调用记录
- `runs/plan-gate-regression.json`：148 项计划门禁回归
- `runs/sanitized-request-and-usage.json`：脱敏请求哈希、用量和费用绑定
- `runs/price-approval.json`：费率审批
- `runs/*-actual-answer.json`：两份实际模型答复
- `runs/*-selected-source.png`：两次运行的选中文件截图

EXPLAIN-001 的后续单元仍按执行状态保持未激活。A20 和 P07 的完整跨单元验收继续由后续范围负责，当前报告只覆盖本单元的单文件讲解和固定来源证据。
