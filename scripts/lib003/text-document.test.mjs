import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { decodeText, TextInputError } from '../../packages/knowledgeos-panel/src/host/text-document.ts'

const plain = 'text/plain', md = 'text/markdown'
function check(bytes, media, source, expected, label) {
  const doc = decodeText(bytes, media, label)
  let pos = 0
  for (const block of doc.blocks) {
    assert.equal(block.start, pos)
    assert.ok(block.end > pos)
    assert.equal(block.text, source.slice(pos, block.end))
    assert.equal(block.anchor, createHash('sha256').update(block.text).digest('hex'))
    pos = block.end
  }
  assert.equal(pos, source.length)
  assert.equal(doc.blocks.map(b => b.text).join(''), source)
  assert.deepEqual(doc.blocks.map(b => [b.kind, b.text]), expected)
  return doc
}
function rejects(fn, code) {
  assert.throws(fn, err => err instanceof TextInputError && err.code === code)
}

test('UTF encodings share exact post-BOM UTF-16 offsets and content anchors', () => {
  const h = '# \u{1f600}\r\n', p = '\u4e2d e\u0301\rnext\n\ufeff', source = h + p
  let reference
  for (const encoding of ['utf-8', 'utf-16le', 'utf-16be']) {
    const data = Buffer.from('\ufeff' + source, encoding === 'utf-8' ? 'utf8' : 'utf16le')
    if (encoding === 'utf-16be') data.swap16()
    const padded = Buffer.concat([Buffer.from([255]), data, Buffer.from([255])])
    const doc = check(padded.subarray(1, -1), md, source, [['heading', h], ['paragraph', p]])
    assert.equal(doc.encoding, encoding)
    assert.equal(doc.blocks[0].end, 6)
    if (reference) assert.deepEqual(doc.blocks, reference)
    reference = doc.blocks
  }
})

test('plain text retains Markdown syntax, long mixed text, and blank separators', () => {
  const long = '# title\n~~~\n' + 'A\u{20000}\u4e2de\u0301'.repeat(65_536)
  const parts = [['blank', '\t\r'], ['paragraph', long + '\r\n'], ['blank', '\r\n \n'], ['paragraph', 'end']]
  const source = parts.map(([, s]) => s).join('')
  check(Buffer.from(source), plain, source, parts)
})

test('Markdown indexes top-level headings and opaque fences without rendering', () => {
  const parts = [
    ['paragraph', '#not a heading\n####### not a heading\n'], ['heading', '   ##\tx\r'],
    ['heading', 'setext\r\n=== \t\n'], ['blank', '\n'],
    ['code', '  ````js\r\n# hidden\n```\n~~~~\n```` tail\n   `````\t\r'],
    ['heading', '# next\n'], ['paragraph', '<script>throw Error()</script>\n'],
    ['code', '~~~\n# unclosed\r\n\n'],
  ]
  const source = parts.map(([, s]) => s).join('')
  check(Buffer.from(source), md, source, parts)
})

test('empty, BOM-only, double BOM, duplicate and relocated blocks', () => {
  for (const bytes of [[], [0xef,0xbb,0xbf], [0xff,0xfe], [0xfe,0xff]]) check(Uint8Array.from(bytes), plain, '', [])
  check(Buffer.from('\ufeff\ufeff'), plain, '\ufeff', [['paragraph', '\ufeff']])
  const source = '# a\n# a\n'
  const a = decodeText(Buffer.from(source), md).blocks
  const b = decodeText(Buffer.from('p\n' + source), md).blocks
  assert.deepEqual(a, decodeText(Buffer.from(source), md).blocks)
  assert.equal(a[0].anchor, a[1].anchor)
  assert.equal(a[0].anchor, b[1].anchor)
})

test('GB18030 requires opt-in; supports two- and four-byte sequences or rejects an unavailable codec', () => {
  const data = Buffer.from('d6d09439fc36', 'hex'), text = '\u4e2d\u{1f600}'
  rejects(() => decodeText(data, plain), 'TEXT_INVALID_ENCODING')
  try { new TextDecoder('gb18030', {fatal:true}) } catch {
    rejects(() => decodeText(data, plain, 'GB18030'), 'TEXT_UNSUPPORTED_ENCODING'); return
  }
  assert.equal(check(data, plain, text, [['paragraph', text]], 'GB18030').encoding, 'gb18030')
  rejects(() => decodeText(Buffer.from([0x81]), plain, 'gb18030'), 'TEXT_INVALID_ENCODING')
})

test('malformed sequences, binary controls, conflicting or unsupported labels fail explicitly', () => {
  for (const hex of ['c080', '61f09f98', 'fffe61', 'feffd800', 'fffe00dc'])
    rejects(() => decodeText(Buffer.from(hex, 'hex'), plain), 'TEXT_INVALID_ENCODING')
  for (const source of ['a\0b', 'ok\u001b', '\u007f', '\u0080'])
    rejects(() => decodeText(Buffer.from(source), plain), 'TEXT_BINARY')
  for (const label of ['windows-1252', 'utf-7', ''])
    rejects(() => decodeText(Buffer.from('abc'), plain, label), 'TEXT_UNSUPPORTED_ENCODING')
  rejects(() => decodeText(Buffer.from('fffe6100', 'hex'), plain, 'utf-8'), 'TEXT_INVALID_ENCODING')
  for (const hex of ['0000feff', 'fffe0000'])
    rejects(() => decodeText(Buffer.from(hex, 'hex'), plain), 'TEXT_UNSUPPORTED_ENCODING')
  rejects(() => decodeText(new Uint8Array(), 'text/html'), 'TEXT_INVALID_INPUT')
})

test('byte and structural limits accept the boundary and never return a partial index', () => {
  const limit = 8 * 1024 * 1024, data = Buffer.alloc(limit + 1, 97)
  assert.equal(decodeText(data.subarray(0, limit), plain).blocks[0].end, limit)
  rejects(() => decodeText(data, plain), 'TEXT_TOO_LARGE')
  const headings = Buffer.from('#\n'.repeat(16_385))
  assert.equal(decodeText(headings.subarray(2), md).blocks.length, 16_384)
  rejects(() => decodeText(headings, md), 'TEXT_TOO_LARGE')
})
