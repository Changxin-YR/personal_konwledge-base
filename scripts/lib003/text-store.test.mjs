import assert from 'node:assert/strict'
import test from 'node:test'
import {execFileSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import {ProbeStorage} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'

const dir=()=>mkdtempSync(join(tmpdir(),'kos-text-db-'))
const blob=(bytes,ext)=>({key:randomUUID()+ext,sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length})
test('v8 populated PDF, checkpoints, foreign keys, and replay survive v9 failure and upgrade',async()=>{
  const root=dir(),old=join(root,'v8.mjs');writeFileSync(old,execFileSync('git',['show','971f6bd14f6d12e4ab508091180b4eba0473a7e7:packages/knowledgeos-panel/lib/test-support.js']))
  const lib=await import(pathToFileURL(old).href),{actor}=await seed(lib,root),v8=new lib.ProbeStorage({dataDir:root})
  const spec={title:'v8.pdf',key:randomUUID()},b=blob(Buffer.from('v8 metadata fixture'),'.pdf'),{receipt:r}=v8.assets.publish(actor,spec,b)
  v8.parses.control(actor,r.id,r.version_id,'start');const job=v8.parses.claim();v8.parses.initialize(job.token,1);v8.parses.publish(job.token,1,{text:'v8 page',needsReview:false,chapter:'v8 chapter'});v8.parses.next(job.token);v8.close()
  const db=new DatabaseSync(join(root,'knowledgeos.sqlite'));const snapshot=()=>Object.fromEntries(['schema_migrations','blobs','assets','asset_versions','pdf_parse_runs','pdf_pages','knowledge_objects'].map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]))
  try{
    const before=snapshot();let s=new ProbeStorage({dataDir:root,failureAt:'v9:after-schema'});assert.equal(s.available,false);s.close();assert.deepEqual(snapshot(),before)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,8);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'text_%'").get().n,0)
    for(let i=0;i<2;i++){
      s=new ProbeStorage({dataDir:root});try{assert(s.available,s.failure?.message);const after=snapshot();assert.deepEqual(after.schema_migrations.splice(before.schema_migrations.length).map(m=>m.version),[9,10,11,12]);assert.deepEqual(after,before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.deepEqual(s.assets.publish(actor,spec,b),{receipt:r,replayed:true});assert.equal(s.parses.pages(actor,r.id,r.version_id,1,1).pages[0].text,'v8 page')}finally{s.close()}
    }
  }finally{db.close()}
})
test('text block failure rolls back publication; replay binds media and encoding; old offsets are immutable',async()=>{
  const root=dir(),{actor}=await seed(await import('../../packages/knowledgeos-panel/lib/test-support.js'),root),s=new ProbeStorage({dataDir:root}),db=new DatabaseSync(join(root,'knowledgeos.sqlite'))
  const bytes=Buffer.from('# 标题\r\n\r\nA😀B\n'),b=blob(bytes,'.txt'),text={media:'text/markdown',...decodeText(bytes,'text/markdown')},spec={key:randomUUID(),title:'sample.md'}
  try{
    db.exec("CREATE TRIGGER fixture_abort BEFORE INSERT ON text_blocks WHEN NEW.ordinal=2 BEGIN SELECT RAISE(ABORT,'fixture'); END")
    assert.throws(()=>s.assets.publish(actor,spec,b,text));for(const t of ['assets','blobs','asset_versions','text_versions','text_blocks'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+t).get().n,0)
    db.exec('DROP TRIGGER fixture_abort');const {receipt:r}=s.assets.publish(actor,spec,b,text);assert.equal(r.media_type,'text/markdown');const old=s.assets.blocks(actor,r.id,r.version_id,1,10)
    assert.equal(old.blocks.map(b=>b.text).join(''),bytes.toString());assert.deepEqual(s.assets.publish(actor,spec,b,text),{receipt:r,replayed:true})
    for(const replacement of [{...text,media:'text/plain'},{...text,encoding:'gb18030'}])assert.throws(()=>s.assets.publish(actor,spec,b,replacement),e=>e.code==='IDEMPOTENCY_CONFLICT')
    const changed=Buffer.from('new version'),b2=blob(changed,'.txt'),{receipt:v2}=s.assets.publish(actor,{...spec,key:randomUUID(),assetId:r.id,expectedVersion:1},b2,{media:'text/plain',...decodeText(changed,'text/plain')})
    assert.deepEqual(s.assets.blocks(actor,r.id,r.version_id,1,10),old);assert.equal(s.assets.blocks(actor,r.id,v2.version_id,1,1).blocks[0].text,'new version');assert.equal(s.assets.list(actor)[0].media_type,'text/plain')
    assert.throws(()=>s.parses.control(actor,r.id,r.version_id,'start'),e=>e.code==='ASSET_NOT_FOUND');assert.equal(db.prepare('SELECT COUNT(*) n FROM pdf_parse_runs').get().n,0)
    assert.throws(()=>s.assets.blocks({...actor,sessionId:randomUUID()},r.id,r.version_id,1,5),e=>e.code==='AUTH_REQUIRED')
  }finally{s.close();db.close()}
})
