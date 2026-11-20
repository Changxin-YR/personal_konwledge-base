// Source-level store tests: node --experimental-transform-types --test scripts/lib004/history.test.mjs
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {WORD_MEDIA} from '../../packages/knowledgeos-panel/src/host/office-schema.ts'

const blob=ext=>({key:randomUUID()+ext,sha256:'d'.repeat(64),byteLength:123})
async function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'lib004-history-')),s=new ProbeStorage({dataDir:dir}),identity=new IdentityService(s)
  t.after(async()=>{await identity.close();s.close();rmSync(dir,{recursive:true,force:true})})
  const credentials={loginName:'owner',password:'Synthetic password 2026!'}
  await identity.bootstrap({...credentials,displayName:'Owner'})
  const actor=identity.actor((await identity.login({...credentials,source:'isolated'})).token)
  const add=(extra={})=>s.assets.publish(actor,{key:randomUUID(),title:'history.docx',...extra},blob('.docx'),{media:WORD_MEDIA.docx}).receipt
  const asset=add(),args=[actor,asset.id,asset.version_id],o=s.office
  function ready(key=randomUUID()){
    const {id}=o.start(...args,key);assert.equal(o.complete(o.claim().token,blob('.pdf'),2,[]),true);return id
  }
  function cancelled(){const {id}=o.start(...args,randomUUID());o.cancel(...args,id);return id}
  const note=(conversion,body)=>({id:o.note(...args,conversion,randomUUID(),1,body).id,page:1,body})
  return {args,o,add,ready,cancelled,note,list:options=>structuredClone(o.list(...args,options))}
}

test('conversion cursor is exclusive across appends; newest ready PDF survives beyond the head window',async t=>{
  const {list,args,ready,cancelled,note}=await setup(t),version_id=args[2]
  assert.deepEqual(list(),{version_id,conversions:[]})
  const first=ready(),id=ready(),result={id,state:'ready',page_count:2,failure_code:null,missing_fonts:[],notes:[note(id,'checked')]}
  const ids=[first,id,...Array.from({length:8},cancelled)]
  assert.deepEqual(Object.keys(list()).sort(),['conversions','version_id']);assert.deepEqual(list().conversions[8],result)
  ids.push(...Array.from({length:13},cancelled));ids.reverse()
  const head=list();assert.deepEqual(head.latest_ready,result);assert.equal(head.next_before,ids[9]);assert.deepEqual(head.conversions.map(c=>c.id),ids.slice(0,10))
  cancelled();const middle=list({before:head.next_before});assert.deepEqual(middle.latest_ready,result);assert.equal(middle.next_before,ids[19])
  const tail=list({before:middle.next_before});assert.deepEqual(Object.keys(tail).sort(),['conversions','version_id'])
  assert.deepEqual([...head.conversions,...middle.conversions,...tail.conversions].map(c=>c.id),ids)
  assert.deepEqual(list({before:first}),{version_id,conversions:[],latest_ready:result})
})

test('notes return the newest chronological window and seek older windows without duplicates after an append',async t=>{
  const {list,ready,note,cancelled}=await setup(t),id=ready(),notes=Array.from({length:10},(_,i)=>note(id,'note '+i))
  assert.deepEqual(list().conversions[0].notes,notes);assert.ok(!('notes_next_before' in list().conversions[0]))
  notes.push(...Array.from({length:13},(_,i)=>note(id,'later '+i)));Array.from({length:10},cancelled)
  const initial=list().latest_ready;assert.deepEqual(initial.notes,notes.slice(-10));assert.equal(initial.notes_next_before,notes[13].id)
  const appended=note(id,'just added');const detail=opts=>list({conversion:id,...opts}).conversions[0]
  assert.equal(detail().notes.at(-1).id,appended.id)
  const middle=detail({notes_before:initial.notes_next_before}),tail=detail({notes_before:middle.notes_next_before})
  assert.equal(middle.notes_next_before,notes[3].id);assert.ok(!('notes_next_before' in tail))
  assert.deepEqual([...tail.notes,...middle.notes,...initial.notes],notes)
})

test('cursor lookups are scoped to the requested parent and authorized before validation',async t=>{
  const {o,args,add,list,note,ready}=await setup(t),id=ready(),second=ready(),n=note(id,'owner only')
  const v2=add({assetId:args[1],expectedVersion:1}),other=[args[0],args[1],v2.version_id]
  for(const options of [{before:id},{conversion:id},{conversion:randomUUID()}])assert.throws(()=>o.list(...other,options),{status:404})
  assert.throws(()=>list({conversion:second,notes_before:n.id}),{status:404});assert.throws(()=>list({before:randomUUID()}),{status:404})
  for(const opts of [{before:''},{before:'invalid'},{conversion:id,before:id},{notes_before:n.id},{offset:'1'}])assert.throws(()=>list(opts),{status:422})
  const denied={...args[0],sessionId:randomUUID()}
  assert.throws(()=>o.list(denied,args[1],args[2],{before:''}),{status:404})
})

test('missing engine only denies a new eligible start; it does not conceal results or replace earlier checks',async t=>{
  const {args,o,add,list,ready}=await setup(t),key=randomUUID(),id=ready(key)
  const start=(k=randomUUID())=>o.start(...args,k,false)
  assert.throws(()=>start(),{status:503,code:'OFFICE_UNAVAILABLE'});assert.equal(list().conversions.length,1)
  assert.equal(list().conversions[0].state,'ready');assert.deepEqual(start(key),{id,state:'ready',replayed:true})
  const active=o.start(...args,randomUUID());assert.throws(()=>start(),{code:'CONVERSION_IN_PROGRESS'})
  o.cancel(...args,active.id);add({assetId:args[1],expectedVersion:1});assert.throws(()=>start(),{code:'SOURCE_CHANGED'})
  assert.equal(start(key).id,id);assert.throws(()=>o.start({...args[0],sessionId:randomUUID()},args[1],args[2],key,false),{status:404})
})
