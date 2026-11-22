import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
import {ProbeStorage,MIGRATION_V18_CHECKSUM,MIGRATION_V19_CHECKSUM,MIGRATION_V20_CHECKSUM,MIGRATION_V21_CHECKSUM,MIGRATION_V22_CHECKSUM,MIGRATION_V23_CHECKSUM,MIGRATION_V24_CHECKSUM,MIGRATION_V25_CHECKSUM,MIGRATION_V26_CHECKSUM} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {seed} from '../fnd006/independent/common.mjs'

const live={ProbeStorage,IdentityService}, dbAt=dir=>new DatabaseSync(join(dir,'knowledgeos.sqlite'))
const digest=b=>createHash('sha256').update(b).digest('hex')
const publish=(s,a,title,text,previous)=>{
  const bytes=Buffer.from(text), key=randomUUID(), pdf=title.endsWith('.pdf')
  return s.assets.publish(a,{title,key,...(previous?{assetId:previous.id,expectedVersion:previous.version}:{})},
    {key,sha256:digest(bytes),byteLength:bytes.length},pdf?undefined:{media:'text/markdown',...decodeText(bytes,'text/markdown')}).receipt
}

test('search reaches a known physical page after a real-book-sized authorized corpus and still fails closed above its work bound',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-search-volume-')), {actor}=await seed(live,dir)
  const s=new ProbeStorage({dataDir:dir}),db=dbAt(dir)
  try{
    const book=publish(s,actor,'volume.pdf','PDF metadata fixture')
    const total=1600, mark='physicalpageneedle', clause='scope, systems and sources '.repeat(110)
    db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state,total) VALUES(?,?,?,'partial',?)")
      .run(book.version_id,actor.sessionId,actor.userId,total)
    const insert=db.prepare("INSERT INTO pdf_pages(version_id,page,state,text) VALUES(?,?,'ready',?)")
    db.exec('BEGIN')
    for(let page=1;page<=710;page++)insert.run(book.version_id,page,clause+(page===700?mark:'')+page)
    db.exec('COMMIT')
    const got=s.search.search(actor,mark)
    assert.deepEqual(got.items.map(r=>[r.version_id,r.ordinal,r.quote]),[[book.version_id,700,mark]])
    assert.equal(s.search.revalidate(actor,got.query_id).query_id,got.query_id)
    db.exec('BEGIN')
    for(let page=711;page<=total;page++)insert.run(book.version_id,page,clause+page)
    db.exec('COMMIT')
    assert.throws(()=>s.search.search(actor,mark),{status:503,code:'SEARCH_WORK_LIMIT'})
    assert.equal(db.prepare('SELECT count(*) AS n FROM search_queries').get().n,1)
  }finally{db.close();s.close()}
})

test('ranker excludes private content, can search separately granted project content, and rejects a cached query after revoke',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-search-acl-')), {actor:owner}=await seed(live,dir)
  const s=new ProbeStorage({dataDir:dir}), db=dbAt(dir), u=new IdentityService(s)
  try{
    const password=randomUUID(),name='search-reviewer'
    await u.register({loginName:name,displayName:name,password})
    const reader=u.actor((await u.login({loginName:name,password,source:'fixture'})).token),now=new Date().toISOString()
    const mine=publish(s,reader,'visible.md','needle only')
    const base=s.search.search(reader,'needle')
    assert.deepEqual(base.items.map(i=>i.asset_id),[mine.id])
    const hidden=publish(s,owner,'unreadable.md','needle needle secret')
    assert.equal(s.search.search(owner,'secret').items[0].asset_id,hidden.id)
    const after=s.search.search(reader,'needle')
    assert.equal(after.count,1);assert.deepEqual(after.items,base.items);assert.equal(s.search.search(reader,'secret').count,0)
    const shared=publish(s,owner,'project.md','needle specific marker')
    const project=s.createProject({id:randomUUID(),ownerUserId:owner.userId,serviceId:owner.serviceId,name:'synthetic',now})
    s.addProjectMembership({projectId:project.id,userId:reader.userId,role:'member',validFrom:now})
    db.prepare("UPDATE knowledge_objects SET scope_kind='project',project_id=? WHERE id=?").run(project.id,shared.id)
    const grant=randomUUID()
    db.prepare(`INSERT INTO resource_grants(id,service_id,resource_type,resource_id,subject_type,subject_id,action,valid_from,created_at)
      VALUES (?,?,'knowledge_object',?,'user',?,'read',?,?)`).run(grant,owner.serviceId,shared.id,reader.userId,now,now)
    assert.equal(s.assets.list(reader).some(i=>i.id===shared.id),false)
    const result=s.search.search(reader,'needle')
    assert.equal(result.count,2)
    const found=result.items.find(i=>i.asset_id===shared.id)
    assert.deepEqual([found.version_id,found.ordinal,found.start,found.end,found.quote,found.source_hash],
      [shared.version_id,1,0,6,'needle',digest('needle specific marker')])
    assert.equal(s.search.revalidate(reader,result.query_id).query_id,result.query_id)
    assert.throws(()=>s.search.revalidate(owner,result.query_id),{status:404})
    db.prepare('UPDATE resource_grants SET revoked_at=? WHERE id=?').run(new Date().toISOString(),grant)
    assert.throws(()=>s.search.revalidate(reader,result.query_id),{status:404})
    assert.throws(()=>s.citations.access(reader,shared.id,shared.version_id),{status:404})
    assert.deepEqual(s.search.search(reader,'needle').items,base.items)
    assert.equal(s.search.search(reader,'specific').count,0)
  } finally {db.close();await u.close();s.close()}
})

test('PDF partial results ignore pending or failed old text and bind hits to exact versions after replacement',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-search-pages-')), {actor}=await seed(live,dir)
  const s=new ProbeStorage({dataDir:dir}),db=dbAt(dir)
  try{
    const book=publish(s,actor,'frozen.pdf','isolated PDF metadata fixture')
    db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state,total) VALUES(?,?,?,'partial',4)").run(book.version_id,actor.sessionId,actor.userId)
    const page=db.prepare('INSERT INTO pdf_pages(version_id,page,state,text) VALUES(?,?,?,?)')
    page.run(book.version_id,1,'ready','Page one stable')
    page.run(book.version_id,2,'pending','old secret')
    page.run(book.version_id,3,'failed','old secret')
    page.run(book.version_id,4,'review','old secret')
    assert.equal(s.search.search(actor,'stable').count,1)
    const prior=s.search.search(actor,'secret')
    assert.deepEqual(prior.items.map(i=>i.ordinal),[4])
    db.prepare("UPDATE pdf_pages SET state='pending' WHERE version_id=? AND page=4").run(book.version_id)
    assert.equal(s.search.search(actor,'secret').count,0)
    assert.throws(()=>s.search.revalidate(actor,prior.query_id),{status:404})
    const old=publish(s,actor,'versioned.md','legacy unique'),modern=publish(s,actor,'versioned.md','current text',old)
    assert.notEqual(old.version_id,modern.version_id)
    assert.deepEqual(s.search.search(actor,'legacy').items.map(i=>i.version_id),[old.version_id])
    assert.deepEqual(s.search.search(actor,'current').items.map(i=>i.version_id),[modern.version_id])
  }finally{db.close();s.close()}
})

test('v18 rollback preserves v17 content and successful upgrade indexes it without rewriting it',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-search-v18-')), prior=join(dir,'v17.mjs')
  writeFileSync(prior,execFileSync('git',['show','1ce6e4f3fe2d9a05b3bc48973b74550a46efbadc:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(prior).href),{actor}=await seed(old,dir), before=new old.ProbeStorage({dataDir:dir})
  const doc=publish(before,actor,'v17.md','legacy fixture');before.close()
  const db=dbAt(dir)
  const facts=()=>({version:db.prepare('PRAGMA user_version').get().user_version,ledger:db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
    schema:db.prepare('SELECT name,tbl_name,sql FROM sqlite_schema ORDER BY name').all(),blocks:db.prepare('SELECT * FROM text_blocks').all()})
  let upgraded
  try{
    const expected=facts();assert.equal(expected.version,17)
    const failed=new ProbeStorage({dataDir:dir,failureAt:'v18:after-schema'});assert.equal(failed.available,false);failed.close()
    assert.deepEqual(facts(),expected)
    upgraded=new ProbeStorage({dataDir:dir});assert(upgraded.available,upgraded.failure?.message)
    const actual=facts();assert.equal(actual.version,26);assert.deepEqual(actual.ledger.slice(0,17),expected.ledger)
    assert.deepEqual(actual.ledger.slice(17).map(x=>x.checksum),[MIGRATION_V18_CHECKSUM,MIGRATION_V19_CHECKSUM,MIGRATION_V20_CHECKSUM,MIGRATION_V21_CHECKSUM,MIGRATION_V22_CHECKSUM,MIGRATION_V23_CHECKSUM,MIGRATION_V24_CHECKSUM,MIGRATION_V25_CHECKSUM,MIGRATION_V26_CHECKSUM])
    assert.deepEqual(actual.schema.filter(x=>!x.tbl_name.startsWith('recall_')&&!x.tbl_name.startsWith('invitation')&&!['search_queries','word_search_runs','word_search_pages','pdf_chapter_ranges','notes','note_nodes','note_references','project_note_refs','domain_events','domain_event_outbox','invitation_change_receipts','note_outline_undo'].includes(x.tbl_name)),expected.schema)
    for(const table of ['domain_events','domain_event_outbox','invitation_change_receipts'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0)
    assert.deepEqual(actual.blocks,expected.blocks)
    assert.equal(upgraded.search.search(actor,'legacy').items[0].version_id,doc.version_id)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
    upgraded.close();upgraded=new ProbeStorage({dataDir:dir});assert(upgraded.available,upgraded.failure?.message)
    assert.equal(upgraded.search.search(actor,'legacy').items[0].version_id,doc.version_id)
  }finally{upgraded?.close();db.close()}
})

test('v19 rollback preserves published v18 Word conversion; resumed indexing fences stale tokens and changed sources',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-word-index-v19-')),prior=join(dir,'v18.mjs')
  writeFileSync(prior,execFileSync('git',['show','c659bf2:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(prior).href),{actor}=await seed(old,dir),before=new old.ProbeStorage({dataDir:dir})
  const media='application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes=Buffer.from('Word source fixture')
  const doc=before.assets.publish(actor,{title:'previous.docx',key:randomUUID()},
    {key:randomUUID(),sha256:digest(bytes),byteLength:bytes.length},{media}).receipt
  const first=before.office.start(actor,doc.id,doc.version_id,randomUUID()), firstJob=before.office.claim()
  const ref={key:randomUUID(),byteLength:200,sha256:digest('PDF conversion fixture')}
  assert(before.office.complete(firstJob.token,ref,2,[]));before.close()
  const db=dbAt(dir), snapshot=()=>({version:db.prepare('PRAGMA user_version').get().user_version,
    ledger:db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),office:db.prepare('SELECT * FROM office_conversions').all(),
    schema:db.prepare('SELECT name,sql FROM sqlite_schema ORDER BY name').all()})
  let s
  try{
    const original=snapshot(),fail=new ProbeStorage({dataDir:dir,failureAt:'v19:after-schema'});assert.equal(original.version,18)
    assert.equal(fail.available,false);assert.match(fail.failure.cause.message,/v19:after-schema/);fail.close();assert.deepEqual(snapshot(),original)
    s=new ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message)
    assert.equal(snapshot().version,26);assert.deepEqual(snapshot().office,original.office)
    assert.equal(s.search.search(actor,'needlestable').count,0)
    const firstLease=s.wordSearch.claim();assert.deepEqual([firstLease.key,firstLease.total,firstLease.next],[ref.key,2,1])
    assert.equal(s.wordSearch.claim(),undefined);assert.equal(s.wordSearch.publish(firstLease.token,2,'incorrect order'),false)
    assert(s.wordSearch.publish(firstLease.token,1,'needlestable first page'))
    const found=s.search.search(actor,'needlestable');assert.deepEqual(found.items.map(r=>[r.conversion_id,r.ordinal]),[[first.id,1]])
    s.close();db.prepare('UPDATE word_search_runs SET lease_until=?').run('2000-01-01T00:00:00.000Z')
    s=new ProbeStorage({dataDir:dir});const next=s.wordSearch.claim();assert.equal(next.next,2);assert.notEqual(next.token,firstLease.token)
    assert.equal(s.wordSearch.publish(firstLease.token,2,'stale writer'),false);assert(s.wordSearch.publish(next.token,2,null))
    assert.equal(s.wordSearch.claim(),undefined);assert.equal(s.search.search(actor,'stale').count,0)
    assert.equal(s.search.revalidate(actor,found.query_id).query_id,found.query_id)
    db.prepare("UPDATE office_conversions SET state='failed',result_blob_id=NULL,page_count=NULL,missing_fonts=NULL WHERE id=?").run(first.id)
    assert.throws(()=>s.search.revalidate(actor,found.query_id),{status:404});assert.equal(s.search.search(actor,'needlestable').count,0)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{s?.close();db.close()}
})
