# READ-001 阅读页集成与验收

Host 注册 GET /knowledgeos/reader → buildReaderHtml()，返回 UTF-8 HTML；此提交不注册路由、不生成构建物。页面仅使用同源、cookie 认证、no-store 的业务 API。

| 真实 Host 操作 | DOM 选择器 |
| --- | --- |
| PDF 解析进度中进入某个 ready/review 章节页 | #parse-pages li a（定位相应章节行） |
| 打开某个 ready 的 Word 历史转换 | #office-attempts li a（定位含转换 UUID 的行） |
| 切换原页 / 文本 | #paper / #structured |
| 建立选区 | #text 的文本节点；初次加载结构文本时为 firstChild |
| 生成 / 打开引用 | #cite / #link[href] |
| 检查文本 / 原页高亮 | #text mark / #original .highlight（0 至多个） |
| 当前页及状态 | #number、#count、#version、#status |

- 页面 URL 必须绑定 asset、version；unit 从 1 开始，conversion 固定一个转换。引用链接只携带 asset、version、citation；打开时先 resolve 再 GET 目标单元，不先读第 1 页。Word 首次未指定 conversion 时由服务端选择，之后用实际 conversion_id。
- DOM Range 使用 UTF-16 半开区间；不要用 indexOf 在重复文本中找选区。POST 的 source_hash 是完整单元文本的 UTF-8 SHA-256（reader.anchor），quote_hash 是选区文本哈希。超时或响应丢失后用同一选区重试；幂等键只在本页面内存中保留，不跨账号或整页重载。
- boxes 使用左上原点像素坐标。只有边界与选区一致且覆盖所选非空白文字时才叠加；不猜测一个 run 内的字形坐标。没有精确框时切到结构文本查看 mark。
- 虚拟页号窗口只挂载可见按钮及少量缓冲；正文仅加载选中的单元，不预取整份资料。状态非 ready/review 不提供文本引用。
- /assets 可证明本人资料的历史版本。对列表未收录的共享对象，仅能显示固定版本，不能声称最新；若要为分享接收者可靠显示旧版，请在受 ACL 保护的 reader 响应提供布尔型 is_latest。
- 浏览器测试使用真实 Chrome、生产 HTML 和受控 HTTP 对端。命令：node --test scripts/read001/reader-ui.test.mjs；KO_TEST_CACHE 指向已有 panel-builder 缓存。真实 Host 的路由注册、数据库 ACL、实际 PDF/Word 渲染须在整合后独立验收。
