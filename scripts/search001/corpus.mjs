export const pdfPages = ['序言：盐析只用于分离。','校验：访问控制列表（ACL）；盐析。',
  '正文：待页朱砂；访问控制列表。','正文：故页玄铁；访问控制列表。','复核：墨晶。','']
export const revised = '修订本：铜版，访问控制列表（ACL）。'
export const mdBlocks = ['# 检索手册\n','\n','𠮷 这里用访问控制列表解释最小权限原则。\n','\n',
  '~~~ts\nconst acl = authzCheck(user_id);\n~~~\n','\n','例：缓存命中；随后缓存命中。\n']

const unicode = text => Buffer.from(text,'utf16le').swap16().toString('hex')
const stream = content => `<< /Length ${content.length} >>\nstream\n${content}\nendstream`

// Map actual PDF page glyphs to Unicode. Neither parser nor index sees fixture text directly.
export function chinesePdf(pages = pdfPages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${6+i*2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>',
    stream('/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /FixtureUCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n1 beginbfrange\n<0000> <ffff> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'),
  ]
  for(const [i,text] of pages.entries()) {
    const mark = text ? `BT /F1 14 Tf 30 144 Td <${unicode(text)}> Tj ET` : 'q 0.6 0.8 0.8 rg 30 30 120 80 re f Q'
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 470 220] /Resources << /Font << /F1 3 0 R >> >> /Contents ${7+i*2} 0 R >>`,stream(mark))
  }
  let body='%PDF-1.4\n'
  const xref=['0000000000 65535 f ']
  for(const [i,obj] of objects.entries()){
    xref.push(String(body.length).padStart(10,'0')+' 00000 n ')
    body+=`${i+1} 0 obj\n${obj}\nendobj\n`
  }
  return Buffer.from(body+`xref\n0 ${xref.length}\n${xref.join('\n')}\ntrailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`,'ascii')
}
