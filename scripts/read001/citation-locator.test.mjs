import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {makeLocator} from '../../packages/knowledgeos-panel/src/host/citation-locator.ts'

const sha=s=>createHash('sha256').update(s).digest('hex')
test('Word locator binds conversion, enclosing structural block, neighboring text hashes and only the selected glyphs',()=>{
  const text='before\nrepeat\nafter',s={kind:'office',conversion_id:'old conversion',version_id:'fixed',ordinal:3,ref:{sha256:sha('pdf')}}
  const w={...s,sha256:s.ref.sha256,text,width:700,height:900,boxes:[{start:0,end:1,x:20,y:3,width:3,height:5},{start:7,end:8,x:1,y:9,width:3,height:6}]}
  const locator=makeLocator(s,text,7,8,{previous:null,next:null},w)
  assert.deepEqual([locator.context.block_start,locator.context.block_end],[7,13]);assert.equal(locator.context.previous,sha('before'));assert.equal(locator.context.next,sha('after'))
  assert.deepEqual(locator.geometry.boxes,[w.boxes[1]]);assert.equal(locator.geometry.page,3)
  assert.throws(()=>makeLocator(s,text,7,8,{previous:null,next:null},{...w,conversion_id:'different'}),{code:'CITATION_SOURCE_CHANGED'})
  assert.throws(()=>makeLocator(s,text,7,8,{previous:null,next:null},{...w,sha256:sha('other')}),{code:'CITATION_SOURCE_CHANGED'})
})
