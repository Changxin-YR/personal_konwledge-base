import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {ProbeStorage,SCHEMA_VERSION,MIGRATION_V7_CHECKSUM,MIGRATION_V8_CHECKSUM,MIGRATION_V9_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'

test('data-bearing v6 rolls back, upgrades, reopens; publication preserves old bytes and idempotency',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-lib001-db-')),old=join(dir,'v6.mjs')
  writeFileSync(old,execFileSync('git',['show','164cbc3:packages/knowledgeos-panel/lib/test-support.js']))
  const {actor,object}=await seed(await import(pathToFileURL(old).href),dir)
  function facts(){const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true});try{return {v:db.prepare('PRAGMA user_version').get().user_version,ledger:db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),objects:db.prepare('SELECT * FROM knowledge_objects ORDER BY id').all(),assets:db.prepare("SELECT name FROM sqlite_master WHERE name IN ('assets','asset_versions','blobs') ORDER BY name").all()}}finally{db.close()}}
  const before=facts();assert.equal(before.v,6);assert.equal(before.objects[0].id,object.id)
  const failed=new ProbeStorage({dataDir:dir,failureAt:'v7:after-schema'});assert.equal(failed.available,false);failed.close();assert.deepEqual(facts(),before)
  let store=new ProbeStorage({dataDir:dir});assert(store.available,store.failure?.message);const after=facts();assert.equal(after.v,SCHEMA_VERSION);assert.equal(after.assets.length,3);assert.deepEqual(after.ledger.slice(0,6),before.ledger);assert.deepEqual(after.objects,before.objects)
  assert.deepEqual(after.ledger.slice(6,9).map(r=>[r.version,r.checksum]),[[7,MIGRATION_V7_CHECKSUM],[8,MIGRATION_V8_CHECKSUM],[9,MIGRATION_V9_CHECKSUM]])
  assert.deepEqual(after.ledger.slice(6).map(r=>r.version),Array.from({length:SCHEMA_VERSION-6},(_,i)=>7+i))
  const first={title:'第一版.pdf',key:randomUUID()},blob={key:randomUUID()+'.pdf',sha256:'1'.repeat(64),byteLength:130}
  let r;try{r=store.assets.publish(actor,first,blob);assert(!r.replayed);assert.equal(r.receipt.version,1)}finally{store.close()}
  store=new ProbeStorage({dataDir:dir});try{
    assert(store.available);const duplicate=store.assets.publish(actor,first,{...blob,key:randomUUID()+'.pdf'});assert.deepEqual(duplicate.receipt,r.receipt);assert(duplicate.replayed)
    assert.throws(()=>store.assets.publish(actor,{...first,title:'changed.pdf'},blob),e=>e.code==='IDEMPOTENCY_CONFLICT');
    const v2={title:'新版本.pdf',assetId:r.receipt.id,expectedVersion:1,key:randomUUID()},blob2={key:randomUUID()+'.pdf',sha256:'2'.repeat(64),byteLength:150};const second=store.assets.publish(actor,v2,blob2)
    assert.equal(second.receipt.version,2);assert.notEqual(second.receipt.version_id,r.receipt.version_id)
    assert.throws(()=>store.assets.publish(actor,{...v2,key:randomUUID()},blob2),e=>e.code==='VERSION_CONFLICT');assert.deepEqual(store.assets.original(actor,r.receipt.id,r.receipt.version_id,false),blob)
    assert.deepEqual(store.assets.list(actor),[second.receipt,r.receipt])
    assert.throws(()=>store.assets.original({...actor,sessionId:randomUUID()},r.receipt.id,r.receipt.version_id,false),e=>e.code==='AUTH_REQUIRED')
  }finally{store.close()}
})
