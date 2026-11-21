# LEARN-004 开发检查点

已核对 F11、P04、A45 和当前 CitationStore/ReaderService。唯一活动单元 LEARN-004；[验收计划](../../../scripts/learn004/acceptance-plan.md) 已独立设计核对。旧读者只支持当前容器内的页段引用；长文需要独立的连续选择视图和服务器练习投影，不能用多个单页引用或 CSS 把答案藏在页面里。

本检查点实现连续页段的 UTF-16 区间与逐页哈希、跨页遮挡分组校验和未揭示答案过滤。`node --experimental-transform-types --test scripts/learn004/recall-range.test.mjs` 4/4 通过；`npm run typecheck --prefix packages/knowledgeos-panel` 退出 0。独立审查提供三页合成 PDF、真实鼠标拖选和权限负例的验收设计，没有运行产品验收。

`LEARN-004-T01/T02`、P04 和独立运行均 `NOT_RUN`。接下来在隔离 SQLite 追加 v22，将范围和分组保存为按版本组织的页段，练习状态记录提示、揭示、独立回忆、自评和当前页；再接真实 Host 与浏览器。创建时按同一来源版本重验所有页，读取与每次变更重查个人所有权和实时源权限。Word 只接受已绑定的转换版本及渲染证据，不拿其他转换或相似文本重定位。做带真实旧笔记和引用数据的 v21 故障回滚、完整主跑与独立复跑后才登记。P04 与单元证据分开统计；A45 等 LIFE-003；SHARE-001 保持就绪，不并行启动生产实现。
