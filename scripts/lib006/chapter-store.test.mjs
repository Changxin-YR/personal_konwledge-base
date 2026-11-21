import assert from 'node:assert/strict'
import test from 'node:test'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import {ProbeStorage,MIGRATION_V20_CHECKSUM} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {seed} from '../fnd006/independent/common.mjs'

const page=n=>({text:`sample page ${n}`,chapter:'fixture',needsReview:false})
function add(s,a){return s.assets.publish(a,{key:randomUUID(),title:'fixture.pdf'},{key:randomUUID(),byteLength:100,sha256:'0'.repeat(64)}).receipt}

test('v20 rollback preserves a working whole-document task; chapter plan fences publish, cancellation and resume',async()=>{
  const local=mkdtempSync(join(tmpdir(),'kos-v20-')),prior=join(local,'v19.mjs')
  writeFileSync(prior,execFileSync('git',['show','5483832b337004717da9af2ff7702a7f13bc31a3:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(prior).href),{actor}=await seed(old,local),before=new old.ProbeStorage({dataDir:local})
  const whole=add(before,actor);before.parses.control(actor,whole.id,whole.version_id,'start')
  const priorJob=before.parses.claim();assert(before.parses.initialize(priorJob.token,3));assert(before.parses.publish(priorJob.token,1,page(1)))
  before.parses.control(actor,whole.id,whole.version_id,'cancel');before.close()
  const db=new DatabaseSync(join(local,'knowledgeos.sqlite'));let s
  const snapshot=()=>({version:db.prepare('PRAGMA user_version').get().user_version,ledger:db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
    runs:db.prepare('SELECT * FROM pdf_parse_runs').all(),pages:db.prepare('SELECT * FROM pdf_pages').all(),schema:db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY name').all()})
  try{
    const v19=snapshot(),failed=new ProbeStorage({dataDir:local,failureAt:'v20:after-schema'});assert.equal(v19.version,19)
    assert.equal(failed.available,false);assert.match(failed.failure.cause.message,/v20:after-schema/);failed.close();assert.deepEqual(snapshot(),v19)
    s=new ProbeStorage({dataDir:local});assert(s.available,s.failure?.message)
    const after=snapshot();assert.equal(after.version,21);assert.deepEqual(after.ledger.slice(0,19),v19.ledger)
    assert.equal(after.ledger[19].checksum,MIGRATION_V20_CHECKSUM);assert.deepEqual(after.runs,v19.runs);assert.deepEqual(after.pages,v19.pages)
    assert.equal(s.parses.control(actor,whole.id,whole.version_id,'status').chapters,undefined)
    s.parses.control(actor,whole.id,whole.version_id,'start');const continued=s.parses.claim();assert.equal(s.parses.next(continued.token),2)
    assert(s.parses.publish(continued.token,2,page(2)));assert(s.parses.publish(continued.token,3,page(3)));assert.equal(s.parses.next(continued.token),null)
    assert.equal(s.parses.control(actor,whole.id,whole.version_id,'status').state,'complete')

    const doc=add(s,actor),plan=[[2,3],[5,5]],op=(name,args)=>s.parses.control(actor,doc.id,doc.version_id,name,undefined,args)
    assert.throws(()=>op('chapters',[[2,3],[3,6]]),{status:422});assert.equal(op('status').state,'idle')
    assert.deepEqual(op('chapters',plan).chapters,plan)
    assert.throws(()=>op('chapters',[[2,4]]),{status:409});assert.deepEqual(op('chapters',plan).chapters,plan)
    let job=s.parses.claim();assert(s.parses.initialize(job.token,6));assert.equal(s.parses.next(job.token),2)
    assert.equal(s.parses.publish(job.token,1,page(1)),false);assert(s.parses.publish(job.token,2,page(2)))
    const stopped=op('cancel');assert.equal(stopped.state,'cancelled');assert.equal(s.parses.publish(job.token,3,page(3)),undefined)
    assert.deepEqual(stopped.pages.map(p=>[p.page,p.state,p.selected]),[[1,'pending',0],[2,'ready',1],[3,'pending',1],[4,'pending',0],[5,'pending',1],[6,'pending',0]])
    s.close();s=new ProbeStorage({dataDir:local});op('start');job=s.parses.claim();assert.equal(s.parses.next(job.token),3)
    assert(s.parses.publish(job.token,3,null));assert.equal(s.parses.next(job.token),5);assert(s.parses.publish(job.token,5,page(5)))
    assert.equal(s.parses.next(job.token),null);assert.equal(op('status').state,'partial')
    assert.throws(()=>s.parses.control(actor,doc.id,doc.version_id,'retry',4),{status:409})
    s.parses.control(actor,doc.id,doc.version_id,'retry',3);job=s.parses.claim();assert.equal(s.parses.next(job.token),3)
    assert(s.parses.publish(job.token,3,page(3)));assert.equal(s.parses.next(job.token),null);assert.equal(op('status').state,'complete')
    assert.deepEqual(db.prepare('SELECT generation FROM pdf_pages WHERE version_id=? ORDER BY page').all(doc.version_id).map(row=>row.generation),[0,1,2,0,1,0])
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{s?.close();db.close()}
})

test('PDF page count rejects a mismatched plan before publishing any text and permits corrected input',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-chapter-correction-')), {actor}=await seed({ProbeStorage,IdentityService},dir)
  const storage=new ProbeStorage({dataDir:dir});try{
    const p=storage.parses, doc=add(storage,actor),op=(cmd,ranges)=>p.control(actor,doc.id,doc.version_id,cmd,undefined,ranges)
    op('chapters',[[3,7]]);let job=p.claim();assert.equal(p.initialize(job.token,6),false)
    const failed=op('status');assert.deepEqual([failed.state,failed.error,failed.total,failed.pages],['failed','CHAPTER_RANGE_OUTSIDE_DOCUMENT',0,[]]);assert.throws(()=>op('start'),{status:409})
    op('chapters',[[6,6]]);job=p.claim();assert(p.initialize(job.token,6));assert.equal(p.next(job.token),6)
    assert(p.publish(job.token,6,page(6)));assert.equal(p.next(job.token),null);assert.equal(op('status').state,'complete')
  }finally{storage.close()}
})
