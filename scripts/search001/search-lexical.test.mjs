import assert from 'node:assert/strict'
import test from 'node:test'
import {compileSearchQuery, indexSearchText, matchSearchText} from '../../packages/knowledgeos-panel/src/host/search-lexical.ts'

const match = (text, query) => matchSearchText(indexSearchText(text), compileSearchQuery(query))
const fixture = '\u4f7f\u7528 \uff33\uff31\uff2c\uff49\uff54\uff45\uff0c\u8c03\u7528 store.commit_tx()\uff1b\u68c0\u6d4b\u6b7b\u9501\u3002'

test('fixed Chinese short and long terms, mixed symbols, and explicit bilingual aliases', () => {
  for (const [query, quote] of [
    ['\u6b7b', '\u6b7b'], ['\u68c0\u6d4b\u6b7b\u9501', '\u68c0\u6d4b\u6b7b\u9501'],
    ['sqlite', '\uff33\uff31\uff2c\uff49\uff54\uff45'], ['store.commit_tx()', 'store.commit_tx'],
    ['deadlock', '\u6b7b\u9501'],
  ]) {
    const found = match(fixture, query)
    assert(found, query)
    assert.equal(fixture.slice(found.start, found.end), quote)
  }
  assert.equal(match(fixture, 'commit-tx'), null)
  assert.equal(match(fixture, '\u96c6\u7fa4'), null)
  assert.equal(match(fixture, 'sqlite missing'), null)
})

test('matches point back to whole original graphemes with UTF-16 offsets', () => {
  const original = '\u{1f9ed} e\u0301 \ufb03 \u6b7b\u9501'
  for (const [query, quote] of [['\u00e9','e\u0301'], ['ffi','\ufb03'], ['\u9501','\u9501']]) {
    const found = match(original, query)
    assert(found)
    assert.equal(found.start, original.indexOf(quote))
    assert.equal(original.slice(found.start, found.end), quote)
  }
})

test('grams are only an accelerator, never proof of a contiguous term', () => {
  assert.equal(match('abc bcd cde', 'abcde'), null)
  assert.equal(match('notwithstanding', 'standing')?.start, 7)
  const direct = match('deadlock', 'deadlock')
  const alias = match('\u6b7b\u9501', 'deadlock')
  assert(direct && alias && direct.score > alias.score)
})

test('bounded normalized input and default AND across mixed terms', () => {
  assert.throws(() => compileSearchQuery('() []'), /INVALID_SEARCH_QUERY/)
  assert.throws(() => compileSearchQuery('a'.repeat(129)), /INVALID_SEARCH_QUERY/)
  assert.throws(() => compileSearchQuery(Array.from({length: 13}, (_, i) => 't'+i).join(' ')), /INVALID_SEARCH_QUERY/)
  assert(match(fixture, 'sqlite\uff0c deadlock'))
  assert.equal(match(fixture, 'sqlite; prototype'), null)
})
