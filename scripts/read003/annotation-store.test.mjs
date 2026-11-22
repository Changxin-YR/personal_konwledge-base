import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {seed} from '../fnd006/independent/common.mjs'

function publish(s,actor){
  const bytes=Buffer.from('same same'),hash=createHash('sha256').update(bytes).digest('hex')
  const {receipt:v}=s.assets.publish(actor,{title:'test.md',key:randomUUID()},{key:randomUUID()+'.md',byteLength:bytes.length,sha256:hash},{media:'text/markdown',...decodeText(bytes,'text/markdown')})
  return {t:{asset_id:v.id,version_id:v.version_id,ordinal:1},hash}
}

test('annotation fixes the selected occurrence and late revisions do not change it',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-annotations-'))
  const {actor}=await seed({ProbeStorage,IdentityService},dir)
  const s=new ProbeStorage({dataDir:dir})
  try{
    const {t,hash}=publish(s,actor)
    const {data:c}=s.citations.create(actor,{...t,start:5,end:9,source_hash:hash},randomUUID())
    const draft={citation_id:c.id,body:'A <literal> note',visibility:'private'}
    const created=s.citations.addAnnotation(actor,t,draft,actor.userId)
    assert.deepEqual([created.start,created.end,created.body,created.revision],[5,9,draft.body,1])
    assert.throws(()=>s.citations.addAnnotation(actor,t,{...draft,visibility:'project'},actor.userId),{code:'ANNOTATION_SCOPE_UNAVAILABLE'})
    assert.deepEqual(s.citations.listAnnotations(actor,t).items,[created])
    const edited=s.citations.updateAnnotation(actor,t,created.id,1,'edited',actor.userId)
    assert.deepEqual([edited.start,edited.end,edited.body,edited.revision],[5,9,'edited',2])
    assert.throws(()=>s.citations.updateAnnotation(actor,t,created.id,1,'late stale draft',actor.userId),{code:'ANNOTATION_REVISION_CONFLICT'})
    assert.deepEqual(s.citations.listAnnotations(actor,t).items,[edited])
    assert.throws(()=>s.citations.deleteAnnotation(actor,t,created.id,1,actor.userId),{code:'ANNOTATION_REVISION_CONFLICT'})
    s.citations.deleteAnnotation(actor,t,created.id,2,actor.userId)
    assert.deepEqual(s.citations.listAnnotations(actor,t).items,[])
  }finally{s.close()}
})

test('v17 rollback preserves all v16 data and successful upgrade keeps source, bookmarks, and reading state',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-v17-')),prior=join(dir,'v16.mjs')
  writeFileSync(prior,execFileSync('git',['show','08889f97a612b34ae205f0dfa3af6064c3585f19:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(prior).href),{actor}=await seed(old,dir),s=new old.ProbeStorage({dataDir:dir})
  const {t,hash}=publish(s,actor)
  const {data:c}=s.citations.create(actor,{...t,start:5,end:9,source_hash:hash},randomUUID()),point={...t,source_hash:hash}
  s.citations.savePosition(actor,point,0,actor.userId);s.citations.addBookmark(actor,point,'Existing v16 bookmark',actor.userId)
  const before={navigation:s.citations.navigation(actor,t),citation:s.citations.resolve(actor,c.id)};s.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'))
  const snapshot=()=>{
    const definitions=db.prepare('SELECT name,type,sql FROM sqlite_master ORDER BY name').all()
    return {version:db.prepare('PRAGMA user_version').get().user_version,definitions,rows:Object.fromEntries(definitions.filter(x=>x.type==='table').map(x=>[x.name,db.prepare(`SELECT * FROM "${x.name}" ORDER BY rowid`).all()]))}
  }
  let migrated
  try{
    const v16=snapshot(),broken=new ProbeStorage({dataDir:dir,failureAt:'v17:after-schema'});assert.equal(v16.version,16)
    assert.equal(broken.available,false);assert.match(broken.failure.cause.message,/v17:after-schema/);broken.close();assert.deepEqual(snapshot(),v16)
    migrated=new ProbeStorage({dataDir:dir});assert(migrated.available,migrated.failure?.message)
    const upgraded=snapshot(),{reader_annotations,search_queries,word_search_runs,word_search_pages,pdf_chapter_ranges,notes,note_nodes,note_references,project_note_refs,schema_migrations,...rows}=upgraded.rows
    const newTables=['recall_attempts','recall_events','recall_masks','recall_materials','recall_segments']
    for(const table of newTables){assert.deepEqual(rows[table],[]);delete rows[table]}
    assert.equal(upgraded.version,22);assert.deepEqual([reader_annotations,search_queries,word_search_runs,word_search_pages,pdf_chapter_ranges,notes,note_nodes,note_references,project_note_refs],[[],[],[],[],[],[],[],[],[]])
    assert.deepEqual(schema_migrations.slice(16).map(x=>x.version),[17,18,19,20,21,22]);assert.deepEqual(schema_migrations.slice(0,16),v16.rows.schema_migrations)
    assert.deepEqual({...rows,schema_migrations:schema_migrations.slice(0,16)},v16.rows)
    assert.deepEqual(migrated.citations.navigation(actor,t),before.navigation);assert.deepEqual(migrated.citations.resolve(actor,c.id),before.citation)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{migrated?.close();db.close()}
})

test('private annotations are not visible to project readers and a source grant is checked again on every request',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-annotations-acl-'))
  const {actor}=await seed({ProbeStorage,IdentityService},dir),s=new ProbeStorage({dataDir:dir}),identity=new IdentityService(s)
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite')),password=randomUUID(),now=new Date().toISOString()
  try{
    await identity.register({loginName:'reviewer',displayName:'Reviewer',password})
    const reader=identity.actor((await identity.login({loginName:'reviewer',password,source:'test'})).token)
    const project=s.createProject({id:randomUUID(),ownerUserId:actor.userId,serviceId:actor.serviceId,name:'Public fixture',now})
    s.addProjectMembership({projectId:project.id,userId:reader.userId,role:'member',validFrom:now})
    const {t,hash}=publish(s,actor)
    // Synthetic attachment to an existing project; sharing rules use real grants.
    const link=db.prepare("UPDATE knowledge_objects SET scope_kind='project',project_id=? WHERE id=?").run(project.id,t.asset_id)
    assert.equal(link.changes,1)
    const grant=(person,action)=>{
      const id=randomUUID()
      assert(s.grantObject(actor,{id,objectId:t.asset_id,serviceId:actor.serviceId,subjectType:'user',subjectId:person.userId,action,validFrom:now,now}))
      return id
    }
    // grantObject requires manage_share, initially from the synthetic owner fixture.
    db.prepare("INSERT INTO resource_grants(id,service_id,resource_type,resource_id,subject_type,subject_id,action,valid_from,created_at) VALUES(?,?,'knowledge_object',?,'user',?,'manage_share',?,?)").run(randomUUID(),actor.serviceId,t.asset_id,actor.userId,now,now)
    grant(actor,'read');grant(actor,'comment');const read=grant(reader,'read')
    const receipt=x=>s.citations.create(x,{...t,start:5,end:9,source_hash:hash},randomUUID()).data
    const ownerCitation=receipt(actor),peerCitation=receipt(reader)
    const privateNote=s.citations.addAnnotation(actor,t,{citation_id:ownerCitation.id,body:'private scope',visibility:'private'},actor.userId)
    const projectNote=s.citations.addAnnotation(actor,t,{citation_id:ownerCitation.id,body:'project scope',visibility:'project'},actor.userId)
    assert.deepEqual(s.citations.listAnnotations(reader,t).items.map(x=>x.id),[projectNote.id])
    assert.throws(()=>s.citations.updateAnnotation(reader,t,privateNote.id,1,'not mine',reader.userId),{status:404})
    assert.throws(()=>s.citations.addAnnotation(reader,t,{citation_id:peerCitation.id,body:'read only',visibility:'private'},reader.userId),{status:404})
    grant(reader,'comment')
    assert.throws(()=>s.citations.updateAnnotation(reader,t,projectNote.id,1,'not mine',reader.userId),{status:404})
    const own=s.citations.addAnnotation(reader,t,{citation_id:peerCitation.id,body:'mine',visibility:'private'},reader.userId)
    assert.deepEqual(s.citations.listAnnotations(actor,t).items.map(x=>x.id),[privateNote.id,projectNote.id])
    assert(s.revokeGrant(actor,read,new Date().toISOString()))
    assert.throws(()=>s.citations.listAnnotations(reader,t),{status:404})
    assert.throws(()=>s.citations.deleteAnnotation(reader,t,own.id,1,reader.userId),{status:404})
  }finally{db.close();await identity.close();s.close()}
})
