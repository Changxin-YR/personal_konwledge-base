import {readFileSync} from 'node:fs'

export const pdfPages = ['序言：盐析只用于分离。','校验：访问控制列表（ACL）；盐析。',
  '正文：待页朱砂；访问控制列表。','正文：故页玄铁；访问控制列表。','复核：墨晶。','']
export const revised = '修订本：铜版，访问控制列表（ACL）。'
export const mdBlocks = ['# 检索手册\n','\n','𠮷 这里用访问控制列表解释最小权限原则。\n','\n',
  '~~~ts\nconst acl = authzCheck(user_id);\n~~~\n','\n','例：缓存命中；随后缓存命中。\n']

export const chinesePdf = (version = 1) => readFileSync(new URL(`./fixtures/chinese-search-v${version}.pdf`,import.meta.url))

