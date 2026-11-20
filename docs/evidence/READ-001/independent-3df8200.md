# READ-001 首轮独立复核：FAIL

2026-11-20，独立干净工作树，Node v24.22.0。候选 `3df8200073e36318d18db77604bcf9b6d0eda35d`，树 `e4ea585debd3b28e8728b90742081be4d1a03cc5`，Host 入口 SHA-256 `cf5e960194a7cade03d9cc06a99ffb1691bd038d3c8eda958763c5ce73ac1abe`。

- PASS：独立执行 `host-text-citations.mjs`、`host-page-citations.mjs`、`host-browser.mjs`。固定旧版、重复短语第二处、Office 重转换、PDF 部分可读、重试、虚拟窗口均在所测范围内通过。
- FAIL（定位持久化）：PDF 高亮来自重渲染，数据库未保存选中坐标；Markdown 缺少相邻块锚点；Word 缺结构块及其邻锚。依据：数据契约 4.2。
- FAIL（T02 已开标签）：真实 Host 新请求与同键重放在撤权后均为 404。补测使用生产阅读页、Chrome、合成权限对端；前台静置 5 秒仍显示原页，切换结构文本可见已载入正文。手动刷新才清除原页、正文、版本和导航。没有观察到服务端在撤权后再次提供正文。

此记录只对应首轮候选，不作新候选验收或整场景通过的证据。
