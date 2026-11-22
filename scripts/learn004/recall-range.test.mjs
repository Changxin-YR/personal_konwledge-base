import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {test} from 'node:test'
import {recallSelection,recallMasks,recallPractice} from '../../packages/knowledgeos-panel/src/host/recall-range.ts'

const sha=s=>createHash('sha256').update(s).digest('hex')
const pages=['skip '+ 'alpha '.repeat(1200),'middle '+ 'beta '.repeat(1700),'gamma '.repeat(1300)+' skip']
const read=n=>pages[n-1]
const point=(ordinal,offset,text=read(ordinal))=>({ordinal,offset,source_hash:sha(text)})

test('retains the complete large contiguous selection without joining or truncating pages',()=>{
  const range=recallSelection(point(1,5),point(3,7000),[sha(read(2))],3,read)
  assert.deepEqual(range.map(({ordinal,start,end})=>[ordinal,start,end]),[[1,5,pages[0].length],[2,0,pages[1].length],[3,0,7000]])
  const selected=range.map(s=>recallPractice(s,[],new Set(),read(s.ordinal)).map(r=>r.text).join(''))
  assert.deepEqual(selected,[pages[0].slice(5),pages[1],pages[2].slice(0,7000)])
  assert(selected.reduce((n,s)=>n+s.length,0)>22_000)
})

test('accounts for a parsed blank page but fails closed for a missing interior page',()=>{
  const range=recallSelection(point(1,5),point(3,12),[sha('')],3,n=>n===2?'':read(n))
  assert.deepEqual(range[1],{ordinal:2,start:0,end:0,source_hash:sha('')})
  assert.throws(()=>recallSelection(point(1,5),point(3,12),[sha('')],3,n=>n===2?undefined:read(n)),{code:'RECALL_SOURCE_NOT_READY'})
})

test('group spans consecutive units; unselected and unrevealed bytes never enter the practice response',()=>{
  const source=['before A PRIVATE1','PRIVATE2 B HIDDEN2 C','end'];const get=n=>source[n-1]
  const range=recallSelection(point(1,7,get(1)),point(3,1,get(3)),[sha(get(2))],3,get)
  const masks=recallMasks(range, [{ordinal:2,start:11,end:18,group:2},{ordinal:2,start:0,end:8,group:1},{ordinal:1,start:9,end:17,group:1}],get)
  const one=recallPractice(range[0],masks,new Set(),source[0]);assert.deepEqual(one,[{kind:'text',text:'A '},{kind:'hidden',group:1,length:8}])
  const two=recallPractice(range[1],masks,new Set([1]),source[1]);assert.deepEqual(two,[{kind:'text',text:'PRIVATE2'},{kind:'text',text:' B '},{kind:'hidden',group:2,length:7},{kind:'text',text:' C'}])
  assert(!JSON.stringify([one,two]).includes('HIDDEN2'));assert(!JSON.stringify(one).includes('PRIVATE1'))
})

test('rejects overlap, out-of-range and split Unicode surrogate masks and stale source digests',()=>{
  const get=()=> 'a🙂bc', range=recallSelection(point(1,1,get()),point(1,5,get()),[],1,get), mask=(start,end,group=1)=>({ordinal:1,start,end,group})
  for(const invalid of [[mask(1,3),mask(1,4,2)],[mask(0,1)],[mask(2,3)],[mask(3,4,0)]])assert.throws(()=>recallMasks(range,invalid,get),{code:'INVALID_RECALL_RANGE'})
  assert.throws(()=>recallSelection(point(1,2,get()),point(1,5,get()),[],1,get),{code:'INVALID_RECALL_RANGE'})
  const newer=()=> 'a🙂xy';assert.throws(()=>recallPractice(range[0],[],new Set(),newer()),{code:'RECALL_SOURCE_CHANGED'})
  assert.throws(()=>recallSelection(point(1,1,get()),point(1,5,get()),[],1,newer),{code:'RECALL_SOURCE_CHANGED'})
})
