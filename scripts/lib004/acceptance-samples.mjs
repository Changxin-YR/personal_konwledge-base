// Small, deterministic originals. No Office installation, converter or npm packages.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crc32 } from 'node:zlib'

// A classic ZIP with stored entries, ASCII part names and fixed DOS date 1980-01-01.
function zip(parts) {
  const local = [], directory = []
  let offset = 0
  for (const [path, value] of Object.entries(parts)) {
    const name = Buffer.from(path), data = Buffer.from(value)
    const entry = Buffer.alloc(30)
    entry.writeUInt32LE(0x04034b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(33, 12)
    entry.writeUInt32LE(crc32(data), 14); entry.writeUInt32LE(data.length, 18)
    entry.writeUInt32LE(data.length, 22); entry.writeUInt16LE(name.length, 26)
    local.push(entry, name, data)
    const index = Buffer.alloc(46)
    index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4)
    entry.copy(index, 6, 4, 30); index.writeUInt32LE(offset, 42)
    directory.push(index, name); offset += entry.length + name.length + data.length
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length / 2, 8)
  end.writeUInt16LE(directory.length / 2, 10); end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, central, end])
}

// Synthetic 32x32 RGB PNG. The gold upper-right corner makes rotation visible.
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAR0lEQVR4nGNUSV3FQAo46tFOknomBhoDplELCIHRICIIRoOIIBgNohEQRIyk1gcjL4iYRi0gBEaDiCAYDSKCYDSICAKaBxEAKhQEObeHusAAAAAASUVORK5CYII=', 'base64')
const ns = 'http://schemas.openxmlformats.org'
const office = `${ns}/officeDocument/2006/relationships`
const rel = (type, target) => `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${office}/${type}" Target="${target}"/></Relationships>`

function word(revision) {
  const p = (text, format = '') => `<w:p><w:r><w:rPr>${format}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  const code = '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'
  const rows = [['Item', 'Count'], ['Quartz', revision === 1 ? '17' : '29']]
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="6" w:color="555555"/>`).join('')
  const table = `<w:tbl><w:tblPr><w:tblW w:w="4800" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>${rows.map(row => `<w:tr>${row.map(cell => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${p(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
  const drawing = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/>
    <wp:docPr id="1" name="Quadrants" descr="Gold upper right on blue"/>
    <a:graphic><a:graphicData uri="${ns}/drawingml/2006/picture"><pic:pic>
    <pic:nvPicPr><pic:cNvPr id="0" name="quadrants.png"/><pic:cNvPicPr/></pic:nvPicPr>
    <pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
    </pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  return zip({
    '[Content_Types].xml': `<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': rel('officeDocument', 'word/document.xml'),
    'word/document.xml': `<w:document xmlns:w="${ns}/wordprocessingml/2006/main" xmlns:wp="${ns}/drawingml/2006/wordprocessingDrawing" xmlns:a="${ns}/drawingml/2006/main" xmlns:pic="${ns}/drawingml/2006/picture" xmlns:r="${office}"><w:body>
      ${p(`A08 sample V${revision}`, '<w:b/><w:sz w:val="40"/>')}${table}${drawing}${p('if count &lt; 20:', code)}${p('    mark(count)', code)}
      <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    'word/_rels/document.xml.rels': rel('image', 'media/quadrants.png'),
    'word/media/quadrants.png': image,
  })
}

function referencePdf() {
  const text = (font, size, x, y, literal) => `BT /${font} ${size} Tf ${x} ${y} Td (${literal.replace(/[()\\]/g, '\\$&')}) Tj ET`
  const content = [text('Title', 20, 72, 700, 'A08 sample V1'),
    '0.75 w 72 628 240 48 re 72 652 m 312 652 l 192 628 m 192 676 l S',
    text('Body', 12, 78, 660, 'Item'), text('Body', 12, 198, 660, 'Count'),
    text('Body', 12, 78, 636, 'Quartz'), text('Body', 12, 198, 636, '17'),
    'q 72 0 0 72 72 540 cm /Quadrants Do Q', text('Code', 12, 72, 516, 'if count < 20:'),
    text('Code', 12, 72, 500, '    mark(count)')].join('\n')
  // ASCIIHex keeps every PDF byte ASCII, so string lengths are byte offsets.
  const stream = (dict, bytes) => `<< ${dict} /Length ${bytes.length} >>\nstream\n${bytes}\nendstream`
  const font = name => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} >>`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Title 4 0 R /Body 5 0 R /Code 6 0 R >> /XObject << /Quadrants 7 0 R >> >> /Contents 8 0 R >>',
    font('Helvetica-Bold'), font('Helvetica'), font('Courier'),
    stream('/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode', '2465aae9ad312465aa2465aa>'), stream('', content)]
  let body = '%PDF-1.4\n'
  const offsets = ['0000000000 65535 f ']
  for (const [i, object] of objects.entries()) {
    offsets.push(`${String(body.length).padStart(10, '0')} 00000 n `)
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  }
  return Buffer.from(`${body}xref\n0 ${offsets.length}\n${offsets.join('\n')}\ntrailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`, 'ascii')
}

export function acceptanceSamples() {
  return { 'a08-v1.docx': word(1), 'a08-reference.pdf': referencePdf(), 'a08-v2.docx': word(2) }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw Error('Usage: node acceptance-samples.mjs <new-output-directory>')
  const dir = resolve(process.argv[2])
  mkdirSync(dir) // Refuse to overwrite an earlier run or accidentally write into a checkout.
  for (const [name, bytes] of Object.entries(acceptanceSamples())) {
    writeFileSync(join(dir, name), bytes, { flag: 'wx' })
    console.log(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)
  }
}
