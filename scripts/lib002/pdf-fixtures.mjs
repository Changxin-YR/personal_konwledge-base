import { deflateSync } from 'node:zlib'

// Small, deterministic, in-memory PDF with a real byte-offset cross-reference table.
export function fixture({ pages = ['first', 'second'], bookmarks = [], link, unicode = false, withImage = false } = {}) {
  const objects = []
  const object = body => (objects.push(body), objects.length)
  const stream = (dict, data) => {
    const bytes = deflateSync(data)
    return object(Buffer.concat([Buffer.from('<< ' + dict + ' /Filter /FlateDecode /Length ' + bytes.length + ' >>\nstream\n'), bytes, Buffer.from('\nendstream')]))
  }
  const catalog = object(''), tree = object('')
  const cmap = unicode && stream('', Buffer.from('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapType 2 def 1 begincodespacerange <00> <ff> endcodespacerange 1 beginbfchar <41> <4E2D> endbfchar endcmap end end'))
  const font = object('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica' + (cmap ? ' /ToUnicode ' + cmap + ' 0 R' : '') + ' >>')
  const image = stream('/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8', Buffer.from([0]))
  const annot = link && object('<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (' + link + ') >> >>')
  const refs = pages.map(text => {
    const data = text === null ? 'q 64 0 0 64 10 10 cm /Im Do Q' : 'BT /F0 12 Tf 12 100 Td <' + Buffer.from(text, 'latin1').toString('hex') + '> Tj ET'
    const content = stream('', Buffer.from(data + (withImage ? ' q /Im Do Q' : '')))
    return object('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F0 ' + font + ' 0 R >> /XObject << /Im ' + image + ' 0 R >> >> /Contents ' + content + ' 0 R' + (annot ? ' /Annots [' + annot + ' 0 R]' : '') + ' >>')
  })
  objects[tree-1] = '<< /Type /Pages /Count ' + refs.length + ' /Kids [' + refs.map(n => n + ' 0 R').join(' ') + '] >>'
  const outline = bookmarks.length && object('')
  for (const [i, [page, title]] of bookmarks.entries()) {
    const id = objects.length + 1
    object('<< /Title (' + title + ') /Parent ' + outline + ' 0 R /Dest [' + refs[page-1] + ' 0 R /Fit]' + (i ? ' /Prev ' + (id-1) + ' 0 R' : '') + (i+1 < bookmarks.length ? ' /Next ' + (id+1) + ' 0 R' : '') + ' >>')
  }
  if (outline) objects[outline-1] = '<< /Type /Outlines /First ' + (outline+1) + ' 0 R /Last ' + objects.length + ' 0 R /Count ' + bookmarks.length + ' >>'
  objects[catalog-1] = '<< /Type /Catalog /Pages 2 0 R' + (outline ? ' /Outlines ' + outline + ' 0 R' : '') + ' >>'
  const chunks = [], offsets = [0]
  let length = 0
  function put(data) { const b = Buffer.from(data); chunks.push(b); length += b.length }
  put('%PDF-1.7\n')
  objects.forEach((body, i) => { offsets.push(length); put((i+1) + ' 0 obj\n'); put(body); put('\nendobj\n') })
  const start = length
  put('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n')
  for (const n of offsets.slice(1)) put(String(n).padStart(10,'0') + ' 00000 n \n')
  put('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n')
  return Buffer.concat(chunks)
}
