import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {makeLocator} from '../../packages/knowledgeos-panel/src/host/citation-locator.ts'
import {alignWordSelection,wordParagraphs} from '../../packages/knowledgeos-panel/src/host/word-locator.ts'
import {wordFixture} from './word-fixture.mjs'

const sha=s=>createHash('sha256').update(s).digest('hex')
test('Word locator binds conversion, enclosing structural block, neighboring text hashes and only the selected glyphs',async()=>{
  const text='before\nrepeat\nafter',s={kind:'office',conversion_id:'old conversion',version_id:'fixed',ordinal:1,ref:{sha256:sha('pdf')},wordOriginal:{sha256:sha('word')}}
  const word=await alignWordSelection(['before','repeat','after'],s.version_id,s.wordOriginal.sha256,1,text,7,8,1,async()=>text)
  const w={...s,word,sha256:s.ref.sha256,text,width:700,height:900,boxes:[{start:0,end:1,x:20,y:3,width:3,height:5},{start:7,end:8,x:1,y:9,width:3,height:6}]}
  const locator=makeLocator(s,text,7,8,{previous:null,next:null},w)
  assert.deepEqual([locator.context.block_start,locator.context.block_end],[7,13]);assert.equal(locator.context.previous,sha('before'));assert.equal(locator.context.next,sha('after'))
  assert.deepEqual(locator.geometry.boxes,[w.boxes[1]]);assert.equal(locator.geometry.page,1)
  assert.throws(()=>makeLocator(s,text,7,8,{previous:null,next:null},{...w,conversion_id:'different'}),{code:'CITATION_SOURCE_CHANGED'})
  assert.throws(()=>makeLocator(s,text,7,8,{previous:null,next:null},{...w,sha256:sha('other')}),{code:'CITATION_SOURCE_CHANGED'})
  assert.throws(()=>makeLocator(s,text,7,8,{previous:null,next:null},{...w,word:undefined}),{code:'WORD_STRUCTURE_UNVERIFIED'})
})

test('DOCX uses namespace-aware body paragraphs, joins runs, preserves structural breaks and rejects DTD',async()=>{
  const head='<z:document xmlns:z="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><z:body>',tail='</z:body></z:document>'
  const xml=head+'<z:p><z:r><z:t>A&amp;</z:t><z:tab/><z:t>&#x1F600;</z:t><z:br/></z:r><z:del><z:r><z:t>omitted</z:t></z:r></z:del><z:r><z:t>B</z:t></z:r></z:p><z:p/>'+tail
  assert.deepEqual(await wordParagraphs(wordFixture([],{xml})),['A&\t\u{1F600}\nB',''])
  await assert.rejects(wordParagraphs(wordFixture([],{xml:'<!DOCTYPE document [<!ENTITY x "bad">]>'+xml})))
  await assert.rejects(wordParagraphs(wordFixture([],{xml:xml.replace('<z:tab/>','<z:altChunk/>')})))
})

test('ordered alignment distinguishes repeated paragraphs and preserves cross-page UTF-16 offsets; no partial match',async()=>{
  const repeated='x\u{1F600} end',pages=['First\nx\u{1F600}\nend\nx\u{1F600}','end\nLast'],source=['First',repeated,repeated,'Last']
  const align=(n,a,b,p=pages)=>alignWordSelection(source,'version',sha('docx'),n,p[n-1],a,b,p.length,async n=>p[n-1])
  const first=(await align(1,6,9)).blocks[0],second=(await align(1,14,17)).blocks[0],continued=(await align(2,0,3)).blocks[0]
  assert.notEqual(first.block_id,second.block_id);assert.equal(second.block_id,continued.block_id)
  assert.deepEqual([first.ordinal,first.start,first.end,second.ordinal,second.start,second.end,continued.start,continued.end],[2,0,3,3,0,3,4,7])
  assert.deepEqual((await align(1,6,17)).blocks.map(b=>[b.ordinal,b.start,b.end]),[[2,0,7],[3,0,3]])
  assert.equal(await align(1,6,9,[pages[0],'Mismatched Last']),undefined)
  assert.equal(await align(1,9,10),undefined)
})
