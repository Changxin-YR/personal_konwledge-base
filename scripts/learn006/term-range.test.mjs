import assert from 'node:assert/strict'
import test from 'node:test'
import { coversTerm } from '../../packages/knowledgeos-panel/src/host/term-practice.ts'

const text = '🧪 索引与索引不是同一处选区。'
const start = text.lastIndexOf('索引')
const term = { asset_id: 'asset', version_id: 'v1', ordinal: 2, start, end: start + 2, source_hash: 'source' }

test('a citation must contain the entire selected occurrence in UTF-16 units', () => {
  assert.equal(coversTerm(term, term), true)
  assert.equal(coversTerm({ ...term, start: 0, end: text.length }, term), true)
  for (const [from, to] of [[text.indexOf('索引'), text.indexOf('索引') + 2], [start + 1, start + 2], [0, start + 1], [0, start]]) {
    assert.equal(coversTerm({ ...term, start: from, end: to }, term), false)
  }
})

test('page, file revision, text fingerprint and Office conversion remain independent source coordinates', () => {
  for (const different of [{ asset_id: 'other' }, { version_id: 'v2' }, { ordinal: 3 }, { source_hash: 'changed' }, { conversion_id: 'another-render' }]) {
    assert.equal(coversTerm({ ...term, ...different }, term), false)
  }
  const office = { ...term, conversion_id: 'stable-render' }
  assert.equal(coversTerm(office, office), true)
  assert.equal(coversTerm(term, office), false)
})
