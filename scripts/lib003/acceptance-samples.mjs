// Independent originals and readback oracle. No product decoder or parser imports.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const md = 'text/markdown', plain = 'text/plain'
const literal = '<b>原样 & literal</b>'
function markdown(revision) {
  const parts = [
    ['heading', `# 第${revision}版 🧭\r\n`], ['blank', '\r\n'],
    ['paragraph', `${literal} cafe\u0301，English。\r\n`], ['blank', '\r\n'],
    ['code', '```txt\r\n# not a heading\r\n```\r\n'], ['blank', '\r\n'],
    ['heading', '## 长段\r\n'], ['paragraph', `START${'汉a🧭'.repeat(2400)}END-${revision}`],
  ]
  const source = parts.map(p => p[1]).join('')
  return { title: '合成笔记.md', media: md, encoding: 'utf-8', source, parts, literal,
    bytes: Buffer.from('\uFEFF' + source) }
}
export const first = markdown(1), updated = markdown(2)
const utf16Source = '# 纯文本 🧭\r\n不是标题 <em>literal</em>'
export const utf16 = { title: '合成文本.txt', media: plain, encoding: 'utf-16le', source: utf16Source,
  bytes: Buffer.from('\uFEFF' + utf16Source, 'utf16le'), parts: [['paragraph', utf16Source]] }
export const gb = { title: '旧编码.txt', media: plain, encoding: 'gb18030', hint: 'gb18030', source: '中文 GB18030',
  bytes: Buffer.concat([Buffer.from('d6d0cec4', 'hex'), Buffer.from(' GB18030')]), parts: [['paragraph', '中文 GB18030']] }
export const bad = { title: '无效.txt', media: plain, bytes: Buffer.from([0xc3, 0x28]) }

// Splitting a long paragraph is fine; dropping a code unit, reclassifying a
// fence as prose, changing CRLF, or normalizing a combining mark is not.
export function checkBlocks(sample, blocks) {
  let cursor = 0, partIndex = 0, partEnd = sample.parts[0][1].length
  for (const [i, b] of blocks.entries()) {
    assert.equal(b.ordinal, i + 1); assert.equal(b.start, cursor)
    assert(Number.isSafeInteger(b.end) && b.end > cursor && b.end <= partEnd)
    assert.equal(b.kind, sample.parts[partIndex][0]); assert.equal(b.text, sample.source.slice(cursor, b.end))
    assert.equal(b.anchor, digest(b.text)); cursor = b.end
    if (cursor === partEnd && ++partIndex < sample.parts.length) partEnd += sample.parts[partIndex][1].length
  }
  assert.equal(cursor, sample.source.length); assert.equal(partIndex, sample.parts.length)
}
