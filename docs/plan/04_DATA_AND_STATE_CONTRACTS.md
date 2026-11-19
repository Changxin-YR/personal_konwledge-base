# KnowledgeOS｜数据与状态契约


> FND-006 是唯一已激活单元，正式依赖为已通过的 FND-004。FND-005 保持 blocked；继承代码不等于继承验收。完整产品审查未激活。
> 此页是全周期目标；实际实施范围以唯一 CODEX_START.md 为准。

- 版本：1.0，2026-11-16（Asia/Shanghai）。
- 状态：**planned**。以下为拟实现的 KnowledgeOS 数据规则，不代表 DSH 已提供这些业务能力，也不代表已运行验证。
- 适用：`Changxin-YR/personal_konwledge-base`；DSH 固定上游 `39163dd30f703a79079e2d2446545cff3c453738`。
- 需求权威：`01_REQUIREMENTS_BASELINE.md`；验收权威：`07_ACCEPTANCE_MATRIX.md`。本文件负责数据一致性、版本、事务和状态转换。

## 0. FND-003 身份切片（历史边界）

FND-002两表/v1及归属修复已验收。当前在同一knowledgeos.sqlite新增原子v2身份迁移，实际职责限定为service_identity、users、password_credentials、auth_sessions和spaces；保留application_id、旧v1 SQL/checksum/账本和探针记录。当前精确字段与默认值在唯一 [CODEX_START.md](../../CODEX_START.md) 冻结。

账号/凭据/personal空间同事务创建；首次管理员还需可信DSH owner本机请求和一次性标记。普通注册始终member，初始化状态不由“用户表为空”推断。服务端会话确定本人，用户输入不能覆盖角色/owner/service/space。密码安全派生，会话仅存原令牌哈希，退出持久撤销；偏好带revision。个人空间不提前实现知识内容或项目权限。

本轮注册用规范登录名唯一约束防重复，登录每次新会话、退出幂等、偏好更新版本前置；通用业务幂等、审计/outbox属于后续FND-006等工作，不在本轮建空平台。这是明确的当前适用边界，不代表下文全周期规则已完成或被删除。

已有库先只读验证归属、版本、全部对象和迁移checksum，再做修改性配置/v2迁移。R1字面sqlite_前缀保护保留；未知/未来/错配库拒绝，不删库、不改路径假成功。未配置dataDir保留原status，身份路由明确503。

## 1. 数据权威与部署边界

**同一份内容只能有一个权威写入服务。** 个人模式在本机使用领域服务和 SQLite；协作模式由一个 KnowledgeOS 服务保存账号、每人的私人空间、项目、资料、授权、训练记录、任务、评分与提醒。本机私人资料不会因连接协作服务而自动上传；跨服务迁移必须是显式、可预览的导入/导出动作。多个桌面端调用该服务，不直接打开它的数据库文件。SQLite 数据库、WAL 和原件目录均位于服务本机磁盘；不把数据库放在 SMB、同步盘或 NAS 上供多个进程直接写入。

协作服务可以部署在管理员可持续运行的电脑上。该电脑关闭时，远端操作等待恢复；不承诺用户电脑之间自动对等同步。个人模式和协作模式共用领域规则，但采用不同 `service_id`；不把两个服务中相同的本地记录号自动视为同一对象。切换服务前显示目标，尚未同步的草稿留在原服务名下。

每位用户的 DSH 桌面 Host 保持本机访问。共享服务仅提供 KnowledgeOS 自己的认证与业务 API；原生 owner RPC、通用文件读取、Session 附件和插件管理不作为共享访问入口。最小 DSH `knowledgeos-server` profile 的组合可行性属于 M0 验证；此数据契约不依赖上游已有多租户能力。

服务采用一个数据库写入拥有者；请求处理与后台任务通过同一领域事务层提交。耗时 PDF 解析、仓库分析和模型请求在事务外进行，返回时重新校验身份、权限和输入版本，再提交结果。业务数据库与 DSH Session/插件配置目录分开，不能把 DSH 的 JSON 文档 KV 当作本项目跨表事务库。上游 SQLite 驱动已核对为 `node:sqlite` 的 `DatabaseSync`；本项目复用该驱动路线但自行实现关系模式与事务。持久化单元验证 Node 与可用真实 Desktop Host 的模块、WAL 与原子事务，打包后的同项复验归发布单元；不能以开发机 Node 成功代替桌面运行证据。

同一对象由 `(service_id, object_id)` 唯一标识。每位用户默认只有一个 `planning_home` 服务拥有每日计划、复习排程、日评分和 F30 发送权；其他服务中的任务仅保留来源引用与待同步状态。首版完整闭环在单服务内运行，不做跨服务双主同步或自动合并两个服务的评分。更换 `planning_home` 需停用旧服务的该用户计划执行权并迁移账本，不能留下两个同时发送的调度主。

## 2. 通用字段、版本和约束

### 2.1 通用记录

| 字段 | 含义与规则 |
|---|---|
| `id` | 不可猜测的稳定对象标识；不能代替权限判断 |
| `service_id` | 当前权威服务标识，导出及恢复时保留来源 |
| `scope_id` | 所属个人空间或项目空间；查询必须带有效范围 |
| `owner_user_id` / `created_by` | 归属人与操作者分别记录，二者不一定相同 |
| `revision` | 可变聚合的乐观锁版本，每次成功变更加一 |
| `created_at` / `updated_at` | 服务端生成的 UTC 时间；客户端不能覆盖 |
| `deleted_at` / `purge_after` | 回收站标记和永久清理时间；正常内容为空 |
| `last_event_seq` | 产生当前投影的最后事件序号，用于恢复和核对 |

所有外部时间保存 UTC；计划日另存 `plan_date` 和 IANA `timezone`。今天、休息日和提醒时段以计划日历的时区计算，不能取服务器本地日期。客户端时间只作诊断信息。不得用浮点数存储需要精确累计的评分权重或费用；采用整数基点/最小单位或明确小数语义。

版本分为两类：`revision` 表示某个可变对象当前版本；`content_version_id`、`submission_id`、`decision_id` 等表示不可变历史版本。编辑一份资料不能覆盖历史提交所引用的旧内容。事件序号单调递增，业务状态允许经正式记录纠正或重新打开，不能把“状态只能向前”错误地用于阻止复议改判。

### 2.2 实现必须具备的约束

- 外键启用；删除使用领域操作，禁止无审计的级联删除业务历史。
- 每个权威服务内 `id` 唯一；关联对象必须属于允许的空间关系，不允许只凭传入 ID 跨空间关联。
- 内容版本、首次答案、正式提交、裁决、投票、冻结成果和审计事件在业务接口中不可覆盖；纠错追加新版本并记录替代关系。
- 默认列表索引包含 `scope_id`、可见状态及排序字段；个人学习查询包含 `user_id`。根据真实查询计划添加索引，不能先取全量再由前端过滤。
- 对外更新携带预期 `revision`；不一致返回冲突，保留双方内容，不静默最后写入获胜。
- 操作幂等键按 `(service_id, actor_user_id, action_name, idempotency_key)` 唯一；同键不同请求摘要拒绝。
- 数据库事务中一起写业务变化、审计事件和 outbox，三者不能分开提交。

## 3. 账号、空间、授权与邀请码

| 表/聚合 | 必需字段与约束 |
|---|---|
| `users` | `id, login_name, credential_ref, status, timezone, planning_home_service_id, created_at`；登录名规范化后唯一，凭据不进入日志或导出样例 |
| `auth_sessions` | `id, user_id, token_hash, created_at, expires_at, revoked_at`；注销/撤销后下次请求失效，业务登录与 DSH owner 身份分开 |
| `spaces` | `id, kind(personal/project), owner_user_id, status`；个人空间默认私有 |
| `project_memberships` | `project_id, user_id, role, valid_from, expires_at, revoked_at, source_invitation_id`；加入项目不自动授权个人训练记录 |
| `resource_grants` | `resource_type, resource_id, subject_type, subject_id, actions, valid_from, expires_at, revoked_at, source_invitation_id`；权限动作显式列举 |
| `invitations` | `id, token_hash, issuer_id, scope, actions, issued_at, expires_at, max_redemptions, redeemed_count, revoked_at, revision`；令牌原文只在创建时展示 |
| `invitation_redemptions` | `invitation_id, user_id, redeemed_at, resulting_grant_id`；同一邀请和用户的兑换唯一，重复提交返回既有结果 |
| `acl_epochs` | 空间/资源授权变更版本，用于缓存失效和任务结果复验 |

权限至少区分 `read`、`comment`、`edit`、`export`、`manage_share`、`delete`、`review`、`view_learning_records`。是否允许某个动作必须由服务端根据资源、身份、当前时间及关联关系作出决定；`edit` 不包含 `delete` 或 `manage_share`。系统管理员可以管理账号和授权范围内的项目，不能仅凭管理员标签读取全部私人内容。

邀请码默认有效期七天，允许在创建时设定其他时长。邀请展示一个绝对 `expires_at`；其派生授权使用同一时间。第六天兑换只获得剩余有效时间。邀请续期不能静默延长历史授权，应有明确续期动作、受影响授权集合与审计。尚有效邀请的整组续期在同一事务中同步更新源邀请及其全部仍有效派生授权的 `expires_at`；由邀请派生的授权不得单独改变期限。仅为一个成员续期、或原邀请已经过期/撤销时，创建新的邀请和授权，并保留旧记录，不复活旧授权。非邀请创建的授权按自身规则续期。撤销邀请的接口必须明确是否同时撤销已兑换授权，本版统一采用同时撤销其仍有效的派生授权，预览影响后执行。此撤销联动属于实施默认值，界面必须直接说明。

兑换事务依次检查有效期、撤销状态、兑换次数、权限上限及当前发行者管理权限，然后创建授权并记录兑换。一条邀请不能授予发行者已经失去的权限；并发最后一个名额只能成功一次。`now >= expires_at` 即已过期。

每次读取、下载、搜索命中、答案揭示、模型取材、后台处理及导出都重新判定权限。权限到期还需使索引结果缓存、流式订阅和待执行任务失效。后台任务不继承“入队那一刻永远有效”的授权。

## 4. 资料、版本、引用与检索

### 4.1 资料及处理记录

| 表/聚合 | 必需字段与约束 |
|---|---|
| `assets` | `id, scope_id, title, media_kind, current_version_id, lifecycle_state, revision`；资料身份稳定 |
| `asset_versions` | `id, asset_id, parent_version_id, blob_id, sha256, byte_length, media_type, source_uri, created_by, created_at`；已发布版本不可覆盖 |
| `blobs` | `id, storage_key, sha256, byte_length, media_type, state`；外部 API 不返回真实绝对文件路径 |
| `processing_jobs` | `id, asset_version_id, job_kind, actor_id, input_hash, extractor_version, state, checkpoint, lease_until, retry_count, last_error` |
| `document_pages` | `asset_version_id, page_index, original_page_label, text_blob, text_hash, extraction_state, quality_flags`；`(asset_version_id,page_index)` 唯一 |
| `document_sections` | `asset_version_id, parent_id, title, start_locator, end_locator, order_key` |
| `content_chunks` | `id, asset_version_id, start_locator, end_locator, text_hash, parser_version, index_revision`；正文与定位共存 |
| `derived_artifacts` | `id, source_version_ids, transform_kind, transform_version, output_asset_version_id, warnings, confirmed_at`；格式转换单独成品 |
| `citations` | `id, source_type, source_id, source_version_id, locator, quote_hash, lineage_policy, state` |
| `reading_states` | `user_id, asset_id, version_id, locator, updated_at`；每人独立，不改变他人进度 |
| `bookmarks` / `annotations` | `user_id, asset_version_id, locator, body, visibility, revision`；正文可私有，引用受源权限限制 |

原件先完整落盘到临时对象并核对哈希，再在事务中发布 `asset_version`。崩溃遗留临时文件由回收任务按可证明无引用的规则清理；不能把尚在上传的原件误判为垃圾。接收成功、解析成功和质量复核分别记录。

处理任务状态为 `queued → running → partial/ready/needs_review/failed/cancelled`。`partial` 可继续排队处理未完成页；局部失败不能把整本标记为“已完成”。`ready` 表示指定处理范围完成，不表示每个提取结果准确。解析质量待复核页继续有明确标记。任务恢复从已提交 checkpoint 开始，重复页结果通过唯一键和输入哈希去重。

压缩包解压清单保留原文件名、解压后的规范路径、大小与选中状态。拒绝路径穿越、链接逃逸及超出已声明资源预算的展开；支持用户选择内部文件。具体解压数量、展开体积和解析并发属于技术配置，M0/M1 根据真实大文件测试确定，不能用短字数限制绕开长文要求。

### 4.2 可复现引用

PDF 定位保存版本、原页索引、文本区间及锚点摘要；有文本层时保留原页坐标用于高亮。Word/Markdown 定位保存结构块 ID、字符偏移及相邻锚点。代码定位保存平台、仓库身份、完整提交 SHA、路径、行范围及片段哈希。页面显示文字可易读，底层定位不能只存“第 3 章”或“当前 HEAD”。

版本更新产生新解析结果。旧引用继续指向旧版本，新旧对应关系只形成迁移建议。无法可靠重定位时标为 `needs_review`，不得偷偷绑定一段相似文本。源权限变化、回收站或永久删除时，引用保留必要元数据并分别显示 `restricted`、`trashed`、`purged`；这些状态不返回受限正文、遮挡答案或摘要副本。

### 4.3 检索记录

检索最少保存 `query_id, actor_id, scope_filter, normalized_query, parser/index_version, result_source_versions, ranking_inputs, created_at`。一次回答的引用保存实际采用的结果快照，便于说明为什么命中该页。中文分词/子串与向量策略由实现选择并以中文测试集验收，不把“装了向量库”视作中文检索通过。

授权过滤在权威服务进行。索引即使尚未完成异步清理，返回、引用预览、模型上下文和下载仍需按当前 ACL 二次检查。索引中保存正文或向量不构成新的公开副本；其生命周期和可见性随源版本管理。删除源后先禁止读取，再异步物理清理索引，不能等待索引任务完成才撤销访问。

## 5. 知识、本体、笔记与学习记录

### 5.1 知识和笔记

| 表/聚合 | 必需字段与约束 |
|---|---|
| `knowledge_items` | `id, scope_id, kind(term/concept/case/solution), domain, current_version_id, confirmation_state` |
| `knowledge_versions` | `item_id, version_id, definition, plain_explanation, context, citations, author_kind, created_by` |
| `ontology_types` / `relation_types` | 类型及允许的起点/终点类型、方向、领域；定义变更有版本 |
| `knowledge_relations` | `from_id, relation_type_id, to_id, evidence_citations, proposal_actor, state, reviewed_by, reviewed_at, revision` |
| `notes` | `id, scope_id, owner_user_id, title, current_revision, note_kind` |
| `note_nodes` | `id, note_id, parent_id, order_key, body, body_revision`；列表与脑图共用此树 |
| `note_references` | `node_id, citation_id, render_mode, lineage_policy`；引用移除不删除源 |

关系状态为 `proposed → confirmed/rejected`，来源改变后可进入 `needs_review`，纠正产生修订记录。自循环、重复边、方向和类型合法性由关系定义决定，不能完全放给模型自由生成。关系的成立须有证据及确认人，模型置信度只作附加信息。

笔记树移动在事务中校验父节点属于同一笔记、不会形成环且目标位置合法。节点删除明确选择“连同子树回收”或“子节点提升”；本版默认先预览影响，再以显式操作提交，不能由脑图和大纲各自使用不同删除规则。相同节点的不同视图共享 `revision`，并发编辑冲突需保留双方草稿。

### 5.2 题目与个人表现分开

| 表/聚合 | 必需字段与约束 |
|---|---|
| `questions` / `question_versions` | 共用题干、选项、答案、解析、题型、来源版本、质量状态；版本不可覆盖已作答题目 |
| `practice_sessions` | `id, user_id, scope, mode, question_version_ids, started_at, completed_at` |
| `attempts` | `id, user_id, question_version_id, practice_session_id, sequence, answer, first_submitted_at, confidence, hints_used, grading_state, evidence` |
| `personal_question_states` | `(user_id,question_id)` 唯一；`wrong_reason, mastery_state, next_review_at, last_attempt_id, revision` |
| `recall_materials` | `id, owner/scope, source_version_id, complete_selection, mask_groups, title, revision` |
| `recall_attempts` | `user_id, material_revision, active_segment, revealed_ranges, hints, independent_recall, self_rating, started_at, completed_at` |
| `learning_assessments` | `user_id, domain, rule_version, supporting_attempt_ids, engineering_evidence_ids, assistance_level, confidence_limits, created_at` |
| `direction_change_proposals` | `user_id, proposed_change, evidence_ids, status, confirmed_by, confirmed_at` |

首次答案写入后再允许揭示答案。随后修改、新练习和复测生成新 attempt；不能覆盖首次错误以提高成绩。填空题的规范化规则、可接受答案及评判依据绑定题目版本；有争议时先进入 `disputed`，不让不确定模型判分直接改变正式能力结论。

错题库是个人状态的视图与记录，不是题目全局的 `is_wrong` 标志。题目撤回或答案更正后保留旧作答，并将受影响评价标为待重算；新结论追加 assessment，不改写当时用户答过什么。管理员查看个人表现需要显式授权。

长文遮挡保存完整选区及全部分段定位，不以模型上下文窗口或 UI 单次渲染上限截断原选择。分段加载和练习仅影响呈现；隐藏答案不能通过普通预览、导出或失权后的缓存接口泄露。用户自评、独立回忆、提示和揭示分别记录，不强行折成一次对错。

每日复习预算默认 `计划学习分钟 × 10%`，可由用户调整；这是已确认的可调整默认值。安排记录引用既有题目和个人状态。队列超出预算的条目处于 `deferred`，不会挤占已承诺任务。改变学习方向的提案仅在本人确认后应用；已授权的复习排程可以自动执行。

## 6. 仓库、工程训练与证据

| 表/聚合 | 必需字段与约束 |
|---|---|
| `repository_connections` | `platform, repository_id, display_url, credential_ref, allowed_actions, owner_id`；默认只读，凭据不进正文 |
| `repository_snapshots` | `repository_id, full_commit_sha, ref_observed, fetched_at, file_manifest_hash`；分析固定快照 |
| `engineering_cases` | `scope_id, objective, context, original_analysis_id, current_state, related_knowledge_ids` |
| `engineering_steps` | `case_id, stage, immutable_revision, actor_kind, hypotheses, evidence_ids, assistance_level, created_at` |
| `verification_evidence` | `id, case_id, source_kind, command_or_method, environment_summary, code_commit, exit_code, result_location, hash, observed_at, verification_level` |

工程阶段依次涵盖业务理解、问题发现、复现、定位、方案、修改验证、复盘迁移。允许带理由回到前一阶段；最初独立分析保留。每项验证明确属于真实执行、外部导入待核实、合成夹具或模型建议。测试说明文本和通过截图不能自动获得“已在目标环境实测”的级别。

仓库内容默认作为可阅读数据，不能在导入时自动执行其中的脚本、安装命令或代理指令。写代码、运行测试和推送由独立明确动作授权管理。生成案例需要区分“已形成分析”“已有修复补丁”“验证完成”；后者必须关联具体代码版本与验证证据。

## 7. 项目任务、提交、审核与复议

### 7.1 核心记录

| 表/聚合 | 必需字段与约束 |
|---|---|
| `tasks` | `id, project_id, issuer_id, assignee_id, task_kind, criteria_version_id, due_at, reviewer_policy_id, current_state, revision` |
| `task_criteria_versions` | `id, task_id, acceptance_items, weights, effective_submission_rule, created_at`；历史不覆盖 |
| `task_dependencies` | `task_id, prerequisite_task_id, condition`；禁止依赖环 |
| `task_progress` | `task_id, actor_id, progress_note, evidence_ids, created_at` |
| `task_blockers` | `task_id, reason, external_party, proposed_by, accepted_by, expires_or_review_at, state` |
| `task_submissions` | `id, task_id, author_id, criteria_version_id, content_version_refs, submitted_at, replaces_submission_id`；重新提交生成新记录 |
| `review_decisions` | `id, submission_id, reviewer_id, stage(peer/final), verdict, criteria_results, reasons, evidence_refs, decided_at, supersedes_decision_id` |
| `appeals` | `id, decision_id, requester_id, reasons, evidence_refs, status, resolved_by, resolution_decision_id` |

`tasks.current_state` 是上述记录的可重建投影；正式裁决、复议和提交才是事实。负责人提交时间以成功接收事务时间为准，审核晚完成不使提交变为逾期。

### 7.2 状态转换

| 当前情况 | 允许操作 | 形成的状态与要求 |
|---|---|---|
| `draft` | 有权人发布 | `assigned`；目标、标准、期限、负责人、审核路径完整 |
| `assigned/in_progress/returned` | 负责人提交 | `submitted`；关联不可变提交版本 |
| `submitted` | 预审 | `awaiting_admin_review` 或 `returned`；管理员派发任务不能由预审直接完成 |
| `submitted/awaiting_admin_review` | 指定终审人裁决 | `accepted/returned/failed`；依据标准逐项给出结果 |
| 任何等待执行状态 | 报告外部阻塞 | `blocked_pending`；获认可后 `blocked`，仍需复核期限 |
| 待审核但材料失权 | 恢复授权/更换材料 | `awaiting_material_access`；不能直接判执行人失败 |
| 有正式裁决 | 提出复议 | 追加 appeal；关键裁决对评分的影响进入争议状态 |
| 复议/管理纠正 | 有权人作出新裁决 | 新 decision 替代旧 decision 的当前效力；重新投影任务、评分和提醒 |

`overdue` 是时间状态，`returned` 是修改要求，`blocked` 是客观条件，`failed` 是正式结果，不能合并。管理员任务的成功与失败均走管理员终审。普通协作任务按事先指定审核人裁定；管理员纠正须在授权范围内，保留理由和前后结果。

改判事务同时更新裁决效力与受影响对象的 `recalculation_required` 标记，并将重算任务写入 outbox。重算完成前，受影响日评分和提醒发送进入受阻状态，不能沿用已知可能失效的旧分数继续催促。

## 8. 今日计划、执行时段与日评分

### 8.1 数据模型

| 表/聚合 | 必需字段与约束 |
|---|---|
| `daily_plans` | `user_id, plan_date, timezone, calendar_kind, learning_budget_minutes, review_ratio, committed_revision, scoring_rule_version, state`；同用户同计划日唯一 |
| `daily_plan_items` | `plan_id, linked_type, linked_id, promised_outcome, weight_units, expected_minutes, dependency_refs, state` |
| `execution_sessions` | `id, user_id, plan_item_id, task_id, started_at, planned_end_at, ended_at, actual_duration, progress_refs, state` |
| `daily_score_versions` | `id, plan_id, rule_version, input_decision_versions, weighted_result, grade, state, reason, supersedes_score_id, calculated_at` |
| `reminder_windows` | `user_id, calendar_rule, timezone, effective_from, version`；记录用户约定，不预设已同意具体时段 |

同一任务在项目和今日计划出现时引用同一 `task_id`。执行记录只保存一次，报表按唯一执行记录汇总；不能在两个模块各累加时长。并行任务耗时统计按明确口径展示，人实际投入时间不能把重叠区间重复计入总投入。

执行时段必须有 `planned_end_at`。开始时先检查任务当前可行动且未在等待审核、认可阻塞或已完成状态。到期后重新判定，用户可通过新的计划时段继续执行并记录进展；不以一个永久 `running=true` 豁免所有提醒。延长、结束和恢复都追加执行事件；不引入键鼠监控。

### 8.2 评分结算

评分状态为 `pending_record → pending_settlement → settled`；影响档位的复议或材料争议进入 `disputed`，结论确定后追加新版 `settled`。缺少记录不自动为 D；休息和批准请假不产生低分。计划中没有需要评分的承诺时显示“无评分”，不能默认奖励 A。

评分公式、任务权重和 A/B/C/D 阈值尚未由用户具体给定。实施时提供透明且有版本的默认值，例如依据事先约定权重的成果达成率；不能仅用在线时长或 AI 主观印象结算。若采用 A≥90%、B≥75%、C≥50%、D<50%，必须标为实施默认值，可配置，并在计划承诺时固定当日规则。改计划、改标准和改规则不能悄悄抬高历史成绩。

待审核项可能改变档位时暂缓结算。若待定结果在所有可能取值下都落在同一档位，可以按显式规则结算并保留待定项；该判断需要保存区间计算证据。没有实现这项区间计算时使用更保守的待结算状态，不能直接假设不影响。

计划日按日期顺序检查，排除已确认休息日和批准请假；A/B 中断低分，C/D 计入，待结算/争议/缺失的应计划日形成未知屏障。不能跨过未知日拼接前后的低分。`C → 待审核 → D` 不满足三天；中间结算为 C 后才成立，为 B 后不成立。回补历史、时区调整与裁决更正统一触发重算。

## 9. F30 强提醒数据与发送算法

**强提醒规则始终启用。** 应用内所有角色的数据与管理接口均不提供可写的 `enabled=false`、`paused` 或 `opt_out`；部署管理员的应用内页面也不能关闭该规则。系统按条件不发送与关闭规则是不同事情；休息、请假、有效执行、材料待审及认可阻塞都必须有相应业务记录。

| 表/聚合 | 必需字段与约束 |
|---|---|
| `reminder_evaluations` | `user_id, evaluation_seq, score_version_ids, actionable_item_ids, window_version, policy_version, outcome, reasons, evaluated_at` |
| `reminder_episodes` | `id, user_id, trigger_evidence, opened_at, closed_at, close_reason`；结束不会停用规则 |
| `reminder_delivery_state` | `user_id` 唯一；`last_published_at, reserved_notice_id, revision`，跨设备共享冷却 |
| `notifications` | `id, user_id, kind, episode_id, evaluation_seq, content_refs, published_at, acknowledged_at`；通知本身是可去重的业务记录 |
| `notification_deliveries` | `notice_id, device_id, attempt_id, status, last_attempt_at, provider_ack`；不把系统弹窗返回值当作用户已读 |

判定需要全部成立：三个连续已结算低分计划日；处于约定提醒时段；存在当前可行动的未完成事项；没有影响条件判断的未完成重算。有效执行只在有限时段内影响发送。一个任务被阻塞不豁免其他可行动任务。若用户正在当前有效执行时段，依据已确认规则暂不催促；时段到期必须重新判定。

事务算法如下，具体 API 属于待实现设计：

1. 读取权威时间、当前计划、评分版本、提醒时段、任务/执行状态以及用户发送账本。
2. 计算可发送状态；不满足则仅记录原因并按需要结束当前 episode，不生成待发通知。
3. 若当前没有能够接收应用通知的运行端，记录当前状态，避免每小时创建离线积压。运行端指接收组件和有效连接可用，后台/托盘运行也属于运行端；不以窗口是否前台、用户是否点击或键鼠活动作为送达条件。重新连接时重新评估一次。
4. 满足条件后，进入可发送状态时生成一次提醒；之后与上一次实际发布到应用通知中心的时间至少间隔 3600 秒。冷却基于用户发送账本，不能因重启、新 episode、多个任务或窗口切换重置。
5. 用乐观锁或事务锁取得本用户的发送资格；再次校验评价所依赖的版本未变化，在同一事务中创建唯一通知、更新发送账本、写发送 outbox。
6. 客户端按 `notice_id` 去重展示，多个连接看到同一个通知对象；原生弹窗只由选定的活跃主设备接收。重试同一投递使用相同 `notice_id`。

“发送”在产品中以通知已经持久发布、可在应用通知中心读取为准，原生系统弹窗是附加投递渠道。进程在外部弹窗已送达但确认未写入时崩溃，存在外部投递结果不确定的窗口；应保留 `unknown`，恢复时通过固定通知 ID 去重和对账，不能承诺跨操作系统的绝对 exactly-once 送达。

补结算历史、恢复联网或进入新提醒时段时只针对当前状态重评一次，不逐小时补发。当前任务完成或评分更正后取消尚未发布的失效提醒，结束对应 episode。已发布通知保留，并注明“其依据后已更正”；不删除历史。

提醒时段可配置，但修改须形成计划日历版本并显示生效范围；不能提供等价于“永久关闭”的个人快捷操作。初次使用需要选择实际时段，默认时区可以是 Asia/Shanghai，此默认不表示用户已同意任意具体钟点。应用关闭、系统休眠或 OS 通知不可用时如实显示能力限制，不阻止系统退出。

## 10. 多智能体讨论、评审与冻结

| 表/聚合 | 必需字段与约束 |
|---|---|
| `discussions` | `id, scope_id, objective, stage_definition_version, active_stage, status, created_by` |
| `discussion_stages` | `discussion_id, stage_index, max_rounds(5), reviewer_seat_config, threshold_rule, status` |
| `proposal_versions` | `id, stage_id, round_no, content_hash, source_version_refs, main_agent_route, created_at`；正文不可覆盖 |
| `review_seats` | `stage_id, seat_id, role, configured_route, config_revision`；阶段内席位集合固定 |
| `review_attempts` | `proposal_id, seat_id, attempt_no, provider_request_id, state, error, usage`；传输重试独立记录 |
| `reviews` | `(proposal_id,seat_id)` 唯一有效评审；`vote, findings, evidence, completion_state, model_route` |
| `findings` | `proposal_id, finding_id, severity, blocking, evidence, resolution, resolved_by, verified_revision` |
| `stage_freezes` | `stage_id, proposal_id, proposal_hash, review_ids, threshold_result, unresolved_blockers, frozen_by, frozen_at` |

阶段主状态为 `draft → reviewing → needs_revision/blocked/ready_to_freeze → frozen`。达到第五轮仍未满足条件转为 `awaiting_user_decision`。传输失败可按预算有限重试，不自动产生新一轮；方案正文修改后产生新版本和新评审，旧投票不继承。

冻结必须在同一事务中核对：所有既定席位已对当前内容哈希完成有效评审；赞成数至少 `ceil(2 × N / 3)`；重大阻断问题已解决；轮次不超过五轮。默认 N=3，二票赞成加一席失败仍受阻；二票赞成加一票有效反对且无未处理重大阻断，可以达到门槛。

调用失败、结构化输出无效或证据缺失属于无效评审，不能计为弃权后缩小分母。用户在第五轮裁定后可接受有明确分歧说明的版本，或开启新的明确阶段/修订流程；记录为 `user_decided`，不伪装成算法门槛自动通过。冻结只证明指定版本完成了设计评审，不证明代码、任务或修复通过实际验收。

## 11. 事件、outbox、后台任务和断网

### 11.1 事务事件

`domain_events` 保存 `seq, event_id, aggregate_type, aggregate_id, aggregate_revision, actor_id, event_type, payload_schema_version, payload, occurred_at, causation_id, correlation_id`。事件中仅保存审计与恢复必需字段；受限正文使用版本引用，不能把整份原文复制到无权限的公共日志。

关键事件包括资料版本发布/回收/恢复、授权授予/到期/撤销、答案提交、任务提交、裁决形成/更正、日评分结算/争议、提醒发布、评审完成和阶段冻结。事件名称属于 KnowledgeOS 命名空间，不能伪造为上游已经存在的 SessionEvent。

`outbox` 与业务事务一起提交；消费者使用 `(consumer_name,event_id)` 唯一的消费记录。消费者崩溃可重复收到事件，但重复处理不得重复生成作答、裁决、评分或通知。事件处理失败保留错误、尝试次数与下次重试时间；达到预算后进入可见失败队列，不静默丢弃。

### 11.2 后台任务租约

`jobs` 保存 `id, owner_user_id, scope_id, operation, input_version_refs, acl_epoch_at_enqueue, state, checkpoint, worker_id, lease_until, attempt, error`。工作者领取和续租均使用事务条件；过期租约允许恢复，不允许两个工作者同时发布同一个结果。提交结果时核对源版本、ACL 和操作取消状态。

网络或模型错误通常可重试；权限撤销、源版本失效、无效格式属于需用户/规则处理的状态，不能无限重试。删除源后正在运行的任务先取消，迟到结果在发布事务被拒绝或隔离为不可见待清理数据。

### 11.3 离线与冲突

客户端可持久保存自己创建的草稿、表单输入和待提交动作。断网时不能伪造权威服务的“提交成功”“审核完成”或“已评分”。恢复后先按幂等键查询既有结果，再校验当前权限和 `revision` 后提交。

受控共享正文的默认离线策略为不新增长期明文缓存。已知到期时间到达后隐藏受控预览和答案；重连即刷新授权。已经显示、下载或由用户手动复制的内容无法靠服务端撤权物理收回，产品只承诺阻止后续受控访问，不能宣称能擦除任何离线副本。需要支持离线长期阅读的扩展须另行定义授权租约与缓存保护，不默认引入。

## 12. 回收站、永久删除、备份与恢复

回收事务标记对象、计算 `purge_after = deleted_at + 30 days`、停止正常访问与旧分享、写出受影响引用和任务。三十天规则只作用于回收站对象，不能定时清理正常知识、笔记和学习历史。

恢复先预览原位置、重名、依赖和当前权限，再以事务恢复。过期或撤销授权不复活；旧分享保持关闭，拥有管理权限的人重新确认后建立新的有效授权。正文恢复和授权恢复为两个有独立审计的动作。

永久清理先检查未删除对象是否仍引用共享物理 blob。只删除已无有效引用的字节；逻辑引用转为 `purged`。有审计保留需求的元数据和事件不保存已删除正文。知识条目中确属独立原创的解释或笔记可保留，但源原文副本、答案和受约束派生内容继续受源策略控制。

备份包含一致性数据库快照、被该快照引用的 blob 清单及哈希、schema 版本、authority ID、应用/上游版本和必要关联。运行中的 SQLite 不能简单复制单个主数据库文件后忽略 WAL；采用经过验证的一致快照机制，且实际恢复一次再判定备份有效。密钥另用安全凭据机制管理，公开 GitHub 仓库不承载用户数据库、私密原件、API 密钥或带凭据日志。

恢复默认写入新的隔离数据目录，执行 schema/哈希/引用核对并生成预览，不直接覆盖当前数据。切换前保存现有快照。恢复旧备份时，过期授权按当前时间失效；最新撤销信息若可得必须合并，若无法证明授权仍有效则旧分享关闭并重新确认。恢复不能让旧账户会话或邀请令牌无条件重新有效。

## 13. 必须建立的行为验证

实现阶段至少覆盖：两身份互相猜 ID 不可读；邀请第六天兑换同日截止；并发兑换最后名额；资料更新保留旧页引用；长文跨页遮挡无截断；个人错题隔离；脑图/列表并发冲突；管理员任务同伴通过仍待终审；C/待审/D 不拼接；改判后重算与取消提醒；执行时段到期恢复判定；多进程/多窗口只生成一个小时提醒；离线恢复无重复提交；旧备份不复活授权；两票赞成一席失败不能冻结。

这些用例与 `07_ACCEPTANCE_MATRIX.md` 对齐。每次验证须记录代码提交、输入版本、环境、实际结果和证据位置；本文件的存在本身不能使任一项从 planned 变为 passed。
