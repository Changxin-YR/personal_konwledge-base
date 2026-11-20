# READ-001 Word 主运行

2026-11-20（Asia/Shanghai），Windows x64、Node `v24.22.0`、SQLite `3.53.4`。冻结候选 `fdac3b02fc5ac42eabef72374aee9b7050c942e3`，树 `5d26229022c037bde14be992696f4aef3101a921`，入口 SHA-256 `1dec38b8b02e79da9829afa27300cce61de9c8db203d6347ed59561d4df3df4b`。使用仓库锁定 DSH `39163dd30f703a79079e2d2446545cff3c453738` 的隔离真实 Host。

| 命令或运行 | 结果 |
| --- | --- |
| 插件 `npm run typecheck` / `npm run build` | PASS，退出码 0；生成入口与冻结产物一致 |
| `node --experimental-transform-types --test`，选择 `scripts/read001`、`scripts/lib004`、`scripts/lib005` 下所有 `*.test.mjs` | PASS，81/81 |
| `node scripts/read001/host-page-citations.mjs <候选 SHA> <入口 SHA-256>` | PASS，退出码 0 |
| `node scripts/verify-plan.mjs` / `node scripts/test-verify-plan.mjs` | PASS，结构回归 116/116；不算产品测试 |

真实 Host 断言：三段 DOCX（SHA-256 `c6df6245344eaf453899904591e2b450f2377f22f2268552dc72ec5e831e7456`）在固定 PDF 提取出 8 行；中间源段落的首词、尾词和全段取到同一源块 ID、同一组真实邻锚和不同精确源偏移。重新转换仍得同一源块 ID，旧链接仍指向旧转换；Host 重启后原引用与快照照常回读。另一 DOCX 中同文不同段得到不同 ID；长段自然跨 2 页，前后页选区同属源第 4 段且页坐标各自绑定。上游真实 Word 97 二进制样本（SHA-256 `2483a8cafde92910a0ea857cce49c07e6fa6bf58ab4a4f0852dfd2f488dedba1`）经 OfficeKit 转换并获得第 1 段 `[0,14)` 的源定位。部分 PDF、失败单页重试和 SQLite 快照回读复验通过。Host 原始摘要 SHA-256 `79c0995e430c65f94cc81da798431cf13af30d00ae39b3f4ce825a64af78a8a5`。

定位快照区分 Word 的源段落 ID、段内 UTF-16 区间与邻锚，以及固定 PDF 的页内选区和坐标。结构对齐要求整个可见正文除布局空白外按顺序一致；只有空白的选择、页眉/页脚引用、替代正文、超过界限或不一致的正文均不猜测定位。该保守限制不影响读页和已有链接，旧 v14/v15 记录不会回填或覆盖。XML、失配及上述边界由专项测试覆盖；本记录不将完整 P02、A09、A45 标记为通过。
