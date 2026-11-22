import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import {ProbeStorage,MIGRATION_V8_CHECKSUM,MIGRATION_V9_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'kos-v8-')),old=join(dir,'v7.mjs')
  writeFileSync(old,execFileSync('git',['show','5d9dc58866d518c496677b3e85ba60c217323291:packages/knowledgeos-panel/lib/test-support.js']))
  const lib=await import(pathToFileURL(old).href),{actor}=await seed(lib,dir),oldStore=new lib.ProbeStorage({dataDir:dir})
  const blob={key:randomUUID()+'.pdf',sha256:'1'.repeat(64),byteLength:128},spec={key:randomUUID(),title:'Sample.pdf'}
  const {receipt:r}=oldStore.assets.publish(actor,spec,blob);oldStore.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'))
  function snap(){return Object.fromEntries(['schema_migrations','asset_versions','blobs','knowledge_objects'].map(t=>[t,db.prepare('SELECT * FROM '+t).all()]))}
  return {dir,db,actor,r,blob,spec,snap}
}
const ok={text:'first page',needsReview:false,chapter:'section one'}
test('populated v7 upgrade is atomic and reopens without mutating older records or checksums', async()=>{
  const {dir,db,actor,r,blob,spec,snap}=await fixture();try{
    const before=snap();assert.equal(db.prepare('PRAGMA user_version').get().user_version,7)
    let s=new ProbeStorage({dataDir:dir,failureAt:'v8:after-schema'});assert(!s.available);s.close();assert.deepEqual(snap(),before)
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'pdf_%'").get().n,0)
    s=new ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message);s.close()
    const after=snap(),applied=after.schema_migrations.splice(7);
    assert.deepEqual(applied.map(r=>r.version),[8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]);
    assert.deepEqual(applied.slice(0,2).map(r=>r.checksum),[MIGRATION_V8_CHECKSUM,MIGRATION_V9_CHECKSUM]);assert.deepEqual(after,before)
    s=new ProbeStorage({dataDir:dir});try{assert(s.available);assert.deepEqual(s.assets.original(actor,r.id,r.version_id,false),blob);assert(s.assets.publish(actor,spec,blob).replayed)}finally{s.close()}
  }finally{db.close()}
})
test('per-page checkpoints fence replay, cancellation and expired workers; only the requested failed page is retried',async()=>{
  const {dir,db,actor,r}=await fixture(),s=new ProbeStorage({dataDir:dir}),p=s.parses,control=(op,n)=>p.control(actor,r.id,r.version_id,op,n)
  try{
    assert.equal(control('status').state,'idle');assert.equal(control('start').state,'queued');assert.equal(control('start').state,'queued')
    const first=p.claim();assert(first);assert.equal(p.claim(),undefined);assert(p.initialize(first.token,4));assert.equal(p.next(first.token),1)
    assert(p.publish(first.token,1,ok));assert.equal(p.publish(first.token,1,{...ok,text:'changed'}),false)
    assert.equal(control('cancel').state,'cancelled');assert.equal(p.publish(first.token,2,ok),undefined);assert.equal(p.renew(first.token),undefined)
    control('start');const stale=p.claim();db.prepare('UPDATE pdf_parse_runs SET deadline=0 WHERE version_id=?').run(r.version_id)
    const running=p.claim();assert.notEqual(stale.token,running.token);assert.equal(p.publish(stale.token,2,ok),undefined);assert(p.initialize(running.token,4));assert.equal(p.next(running.token),2)
    assert(p.publish(running.token,2,null));assert(p.publish(running.token,3,{...ok,text:'',needsReview:true}));assert(p.publish(running.token,4,ok));assert.equal(p.next(running.token),null)
    const partial=control('status');assert.equal(partial.state,'partial');assert.deepEqual(partial.pages.map(x=>x.state),['ready','failed','review','ready'])
    assert.throws(()=>control('retry',1),e=>e.code==='PAGE_NOT_RETRYABLE');control('retry',2);const retry=p.claim();assert.equal(p.next(retry.token),2);assert(p.publish(retry.token,2,ok));assert.equal(p.next(retry.token),null)
    assert.deepEqual(db.prepare('SELECT generation FROM pdf_pages ORDER BY page').all().map(x=>x.generation),[1,2,1,1]);assert.equal(db.prepare('SELECT text FROM pdf_pages WHERE page=1').get().text,ok.text)
  }finally{s.close();db.close()}
})
test('revoked session cannot publish pending work or read progress',async()=>{
  const {dir,db,actor,r}=await fixture(),s=new ProbeStorage({dataDir:dir}),p=s.parses;try{
    p.control(actor,r.id,r.version_id,'start');const job=p.claim();p.initialize(job.token,1)
    db.prepare('UPDATE auth_sessions SET revoked_at=created_at WHERE id=?').run(actor.sessionId)
    assert.equal(p.publish(job.token,1,ok),undefined);assert.equal(db.prepare('SELECT state FROM pdf_pages').get().state,'pending');assert.equal(db.prepare('SELECT error FROM pdf_parse_runs').get().error,'AUTHORIZATION_LOST')
    assert.throws(()=>p.control(actor,r.id,r.version_id,'status'),e=>e.code==='ASSET_NOT_FOUND')
  }finally{s.close();db.close()}
})
test('retry keeps legacy citation offsets through indentation-only changes and transient failures',async()=>{
  const {dir,db,actor,r}=await fixture(),s=new ProbeStorage({dataDir:dir}),p=s.parses,control=op=>p.control(actor,r.id,r.version_id,op,1)
  const source=()=>s.citations.source(actor,{asset_id:r.id,version_id:r.version_id,ordinal:1})
  try{
    control('start');const first=p.claim();p.initialize(first.token,1);assert(p.publish(first.token,1,{...ok,needsReview:true}));p.next(first.token)
    function retry(result){control('retry');assert.equal(source().text,'');const job=p.claim();assert(p.publish(job.token,1,result));p.next(job.token)}
    retry(null);assert.deepEqual([source().state,source().text],['failed','']);assert.equal(p.pages(actor,r.id,r.version_id,1,1).pages[0].text,null)
    retry({...ok,text:'\u00a0   '+ok.text,needsReview:true});assert.deepEqual([source().state,source().text],['review',ok.text])
    retry({...ok,text:'   changed content'});assert.equal(source().text,'   changed content')
  }finally{s.close();db.close()}
})
test('a failed page transaction leaves no text or progress, and retry does not resume a cancelled document',async()=>{
  const {dir,db,actor,r}=await fixture(),s=new ProbeStorage({dataDir:dir}),p=s.parses,control=(op,n)=>p.control(actor,r.id,r.version_id,op,n)
  try{
    control('start');const job=p.claim();p.initialize(job.token,3);assert(p.publish(job.token,1,null))
    // A real post-write failure inside the writer's transaction (isolated fixture).
    db.exec(`CREATE TRIGGER stop_publish AFTER UPDATE OF text ON pdf_pages WHEN NEW.page=2 BEGIN SELECT RAISE(ABORT,'fixture disk fault'); END`)
    assert.throws(()=>p.publish(job.token,2,ok));assert.equal(p.next(job.token),2)
    const row=db.prepare('SELECT text,state,generation FROM pdf_pages WHERE page=2').get();assert.deepEqual({...row},{text:'',state:'pending',generation:0})
    db.exec('DROP TRIGGER stop_publish');p.control(actor,r.id,r.version_id,'cancel');assert.throws(()=>control('retry',1),e=>e.code==='PAGE_NOT_RETRYABLE')
    assert.equal(control('status').state,'cancelled');assert.equal(p.claim(),undefined)
  }finally{s.close();db.close()}
})
