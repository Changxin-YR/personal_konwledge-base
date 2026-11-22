import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
import {MIGRATION_V22_CHECKSUM,MIGRATION_V26_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'

const sha=s=>createHash('sha256').update(s).digest('hex')
const blob=s=>({key:randomUUID(),sha256:sha(s),byteLength:Buffer.byteLength(s)})
const publish=(s,actor,text,media='text/plain')=>s.assets.publish(actor,{key:randomUUID(),title:'source'},blob(text),
  {media,...(media==='text/plain'?decodeText(Buffer.from(text),media):{})}).receipt
const target=doc=>({asset_id:doc.id,version_id:doc.version_id})
const point=(ordinal,offset,text)=>({ordinal,offset,source_hash:sha(text)})

test('v21 data and exact ledger survive injected v22 rollback, append and reopen',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-recall-v22-')),file=join(dir,'v21.mjs')
  writeFileSync(file,execFileSync('git',['show','7a0e482540177be4db68e977f8ba85d8bff224ec:packages/knowledgeos-panel/lib/test-support.js']))
  const v21=await import(pathToFileURL(file).href),{actor}=await seed(v21,dir),prior=new v21.ProbeStorage({dataDir:dir})
  const text='Historical original for a private note.',doc=publish(prior,actor,text)
  const citation=prior.citations.create(actor,{...target(doc),ordinal:1,start:0,end:text.length,source_hash:sha(text)},randomUUID()).data
  const note=prior.notes.create(actor,actor.userId,randomUUID(),{title:'Keep this note',body:'Note body',kind:'reading'},citation.id).data
  prior.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  const rows=table=>db.prepare(`SELECT ${table==='note_nodes'?'id,note_id,parent_id,order_key,body,body_revision':'*'} FROM ${table} ORDER BY rowid`).all()
  const version=()=>db.prepare('PRAGMA user_version').get().user_version
  const contents=()=>['notes','note_nodes','note_references','citations','citation_locators','asset_versions','blobs','text_blocks'].map(rows)
  const schema=()=>db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()
  const expected=contents(),ledger=rows('schema_migrations'),before=schema();let s
  try{
    assert.equal(version(),21)
    s=new lib.ProbeStorage({dataDir:dir,failureAt:'v22:after-schema'});assert.equal(s.available,false)
    assert.match(s.failure.cause.message,/v22:after-schema/);s.close()
    assert.equal(version(),21);assert.deepEqual(schema(),before);assert.deepEqual(contents(),expected);assert.deepEqual(rows('schema_migrations'),ledger)
    for(let i=0;i<2;i++){
      s=new lib.ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message)
      assert.equal(version(),26);assert.deepEqual(contents(),expected)
      assert.equal(db.prepare('SELECT COUNT(*) n FROM note_nodes WHERE archived_at IS NOT NULL').get().n,0)
      const applied=rows('schema_migrations');assert.equal(applied.pop().checksum,MIGRATION_V26_CHECKSUM);assert.equal(applied.pop().version,25);assert.equal(applied.pop().version,24);assert.equal(applied.pop().version,23);const last=applied.pop();assert.deepEqual([last.version,last.checksum],[22,MIGRATION_V22_CHECKSUM]);assert.deepEqual(applied,ledger)
      assert.equal(s.notes.get(actor,note.id).body,'Note body');assert.equal(s.citations.resolve(actor,citation.id).quote,text)
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);s.close()
    }
  }finally{s?.close();db.close()}
})

test('Word recall requires the pinned converted PDF, refuses gaps, and does not drift to another conversion',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-recall-word-')),{actor}=await seed(lib,dir),s=new lib.ProbeStorage({dataDir:dir})
  try{
    const doc=publish(s,actor,'Synthetic Word bytes','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    const first=s.office.start(actor,doc.id,doc.version_id,randomUUID()),job=s.office.claim()
    assert(s.office.complete(job.token,blob('first conversion'),4,[]))
    const src={...target(doc),conversion_id:first.id},lease=s.wordSearch.claim()
    const page1='old version paired',page3='old third page'
    assert(s.wordSearch.publish(lease.token,1,page1,'text'));assert(s.wordSearch.publish(lease.token,2,'','blank'));assert(s.wordSearch.publish(lease.token,3,page3,'text'))
    assert(s.wordSearch.publish(lease.token,4,'caption from partially unextracted page'))
    assert.throws(()=>s.recall.authorPage(actor,{...target(doc),ordinal:1}),{code:'RECALL_CONVERSION_REQUIRED'})
    assert.throws(()=>s.recall.authorPage(actor,{...src,ordinal:4}),{code:'RECALL_SOURCE_NOT_READY'})
    const masks=[{ordinal:1,start:0,end:11,group:1}],firstPoint=point(1,0,page1),key=randomUUID()
    assert.throws(()=>s.recall.create(actor,actor.userId,key,{...src,title:'Pinned',first:firstPoint,last:point(4,5,'caption from partially unextracted page'),interior_hashes:[sha(''),sha(page3)],masks}),{code:'RECALL_SOURCE_NOT_READY'})
    assert.deepEqual(s.recall.list(actor).items,[])
    const d=s.recall.create(actor,actor.userId,key,{...src,title:'Pinned',first:firstPoint,last:point(3,page3.length,page3),interior_hashes:[sha('')],masks}).data
    const next=s.office.start(actor,doc.id,doc.version_id,randomUUID()),second=s.office.claim();assert.notEqual(first.id,next.id)
    assert(s.office.complete(second.token,blob('second conversion'),1,[]));const index=s.wordSearch.claim()
    assert(s.wordSearch.publish(index.token,1,'different new answer','text'))
    const updated=s.recall.get(actor,d.material.id)
    assert(updated.source_changed);assert.equal(updated.material.conversion_id,first.id);assert.deepEqual(updated.runs,d.runs)
    assert.equal(s.recall.authorPage(actor,{...src,ordinal:1}).text,page1)
    const blank=s.recall.act(actor,actor.userId,d.material.id,randomUUID(),{event:'move',value:2,expected_revision:d.revision})
    assert.equal(blank.page_length,0);assert.deepEqual(blank.runs,[])
  }finally{s.close()}
})

test('a caption-only review page cannot become a recall source; a confirmed physical blank counts as a page',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-recall-pdf-')),{actor}=await seed(lib,dir),s=new lib.ProbeStorage({dataDir:dir})
  try{
    const doc=publish(s,actor,'Synthetic PDF bytes','application/pdf'),src=target(doc)
    s.parses.control(actor,doc.id,doc.version_id,'start');const job=s.parses.claim()
    assert(s.parses.initialize(job.token,3))
    assert(s.parses.publish(job.token,1,{text:'caption',needsReview:true,chapter:''}))
    assert(s.parses.publish(job.token,2,{text:'',needsReview:true,confirmedBlank:true,chapter:''}))
    assert(s.parses.publish(job.token,3,{text:'ready page',needsReview:false,chapter:''}))
    assert.throws(()=>s.recall.authorPage(actor,{...src,ordinal:1}),{code:'RECALL_SOURCE_NOT_READY'})
    assert.equal(s.recall.authorPage(actor,{...src,ordinal:2}).text,'')
    assert.equal(s.recall.authorPage(actor,{...src,ordinal:3}).text,'ready page')
  }finally{s.close()}
})
