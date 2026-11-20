import assert from 'node:assert/strict'
import test from 'node:test'
import {citationAnchor,resolveCitationText} from '../../packages/knowledgeos-panel/src/host/citation-anchor.ts'

test('second identical passage stays in its original UTF-16 range',()=>{
  const text='A\u{1f642}\r\nA\u{1f642}',anchor=citationAnchor(text,5,8)
  assert.equal(resolveCitationText(text,anchor),'A\u{1f642}');assert.equal(anchor.start,5)
  assert.equal(citationAnchor(text,0,3).quote_hash,anchor.quote_hash)
  assert.throws(()=>resolveCitationText('X'+text,anchor),{code:'CITATION_SOURCE_CHANGED'})
  assert.throws(()=>resolveCitationText(text,{...anchor,quote_hash:'0'.repeat(64)}),{code:'CITATION_SOURCE_CHANGED'})
})
test('invalid, empty and split-surrogate ranges cannot produce an anchor',()=>{
  for(const [a,b] of [[1,2],[2,3],[1,1],[-1,1],[1,4],[0,1.2]])assert.throws(()=>citationAnchor('A\u{1f642}',a,b),{code:'INVALID_CITATION_RANGE'})
})
