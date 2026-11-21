import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {ProbeStorage,IdentityService} from '../../packages/knowledgeos-panel/lib/test-support.js'
import {MIGRATION_V21_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'

const sha=s=>createHash('sha256').update(s).digest('hex')
function publish(s,actor,source,spec={}){
  const bytes=Buffer.from(source),media='text/plain'
  return s.assets.publish(actor,{key:randomUUID(),title:'source.txt',...spec},
    {key:randomUUID()+'.txt',sha256:sha(bytes),byteLength:bytes.length},{media,...decodeText(bytes,media)}).receipt
}
function cite(s,actor,doc,text){
  return s.citations.create(actor,{asset_id:doc.id,version_id:doc.version_id,ordinal:1,start:0,end:text.length,source_hash:sha(text)},randomUUID()).data
}
async function register(s,name){
  const identity=new IdentityService(s), credentials={loginName:name,displayName:name,password:'Notes test password 2026!'}
  try{await identity.register(credentials);return identity.actor((await identity.login({...credentials,source:'note-test'})).token)}
  finally{await identity.close()}
}
const draft={title:'Independent notes',body:'My own original text.',kind:'reading'}

test('v20 rollback then v21 append preserves actual citation, project and prior ledger',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-note-v21-')),path=join(dir,'v20.mjs')
  writeFileSync(path,execFileSync('git',['show','680b8689adbcf0967d00051aaabc79ca3c513662:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(path)),{actor}=await seed(old,dir),v20=new old.ProbeStorage({dataDir:dir})
  const doc=publish(v20,actor,'immutable text'),citation=cite(v20,actor,doc,'immutable text')
  v20.createProject({id:randomUUID(),ownerUserId:actor.userId,serviceId:actor.serviceId,name:'Migration test',now:new Date().toISOString()});v20.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  const version=()=>db.prepare('PRAGMA user_version').get().user_version
  const snapshot=()=>Object.fromEntries(['schema_migrations','knowledge_projects','citations','citation_locators','asset_versions'].map(n=>[n,db.prepare(`SELECT * FROM ${n} ORDER BY rowid`).all()]))
  const prev=snapshot();let s
  try{
    assert.equal(version(),20);s=new ProbeStorage({dataDir:dir,failureAt:'v21:after-schema'});assert.equal(s.available,false);s.close()
    assert.equal(version(),20);assert.deepEqual(snapshot(),prev);assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='notes'").get(),undefined)
    s=new ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message);assert.equal(version(),21)
    const now=snapshot();assert.deepEqual(now.schema_migrations.pop().checksum,MIGRATION_V21_CHECKSUM);assert.deepEqual(now,prev)
    assert.equal(s.citations.resolve(actor,citation.id).quote,'immutable text');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{s?.close();db.close()}
})

test('private note stays separate; exact links survive edit, restart and source replacement',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-note-store-')),{actor:owner}=await seed({ProbeStorage,IdentityService},dir)
  let s=new ProbeStorage({dataDir:dir});const peer=await register(s,'peer'), actor=owner.userId
  const now=new Date().toISOString(),project=s.createProject({id:randomUUID(),serviceId:owner.serviceId,ownerUserId:actor,name:'Real project',now})
  s.addProjectMembership({projectId:project.id,userId:peer.userId,role:'member',validFrom:now})
  try{
    const doc=publish(s,owner,'Fixed original'),citation=cite(s,owner,doc,'Fixed original'),key=randomUUID()
    assert.throws(()=>s.notes.create(owner,actor,randomUUID(),draft,randomUUID()),{code:'SOURCE_NOT_FOUND'})
    const created=s.notes.create(owner,actor,key,draft,citation.id);const id=created.data.id
    assert.equal(s.notes.create(owner,actor,key,draft,citation.id).data.id,id)
    assert.equal(created.data.references.length,1)
    assert.throws(()=>s.notes.create(owner,actor,key,{...draft,body:'changed'}),{code:'IDEMPOTENCY_CONFLICT'})
    assert.throws(()=>s.notes.create(owner,peer.userId,randomUUID(),draft),{code:'ACTOR_CHANGED'})
    assert.equal(s.authorizeObject(owner,id,'read',now),undefined)
    const updated=s.notes.save(owner,actor,id,1,{body:'Revised text',add_citation:citation.id})
    assert.equal(updated.revision,2);assert.equal(updated.references.length,1)
    assert.deepEqual(s.notes.save(owner,actor,id,2,{add_citation:citation.id}),updated)
    assert.throws(()=>s.notes.save(owner,actor,id,1,{body:'stale tab'}),{code:'REVISION_CONFLICT'})
    assert.deepEqual(s.notes.get(owner,id),updated)
    assert.equal(s.notes.linkProject(owner,actor,project.id,id).replayed,false)
    assert.equal(s.notes.linkProject(owner,actor,project.id,id).replayed,true)
    assert.deepEqual(s.notes.managedProjects(owner).items.map(p=>p.id),[project.id]);assert.deepEqual(s.notes.managedProjects(peer).items,[])
    assert.deepEqual(s.notes.projectRefs(peer,project.id).items,[])
    assert.throws(()=>s.notes.get(peer,id),{code:'NOTE_NOT_FOUND'})
    assert.throws(()=>s.notes.linkProject(peer,peer.userId,project.id,id),{code:'NOTE_NOT_FOUND'})
    const peerNote=s.notes.create(peer,peer.userId,randomUUID(),draft).data
    assert.throws(()=>s.notes.linkProject(peer,peer.userId,project.id,peerNote.id),{code:'PROJECT_NOT_FOUND'})
    publish(s,owner,'New version',{assetId:doc.id,expectedVersion:1});s.close();s=new ProbeStorage({dataDir:dir})
    assert.deepEqual(s.notes.get(owner,id),updated);assert.equal(s.notes.projectRefs(owner,project.id).items[0].id,id)
    const resolved=s.citations.resolve(owner,updated.references[0].citation_id);assert.equal(resolved.version_id,doc.version_id);assert.equal(resolved.quote,'Fixed original')
    const removed=s.notes.save(owner,actor,id,2,{remove_reference:updated.references[0].id});assert.deepEqual(removed.references,[])
    assert.equal(s.notes.list(owner).items.length,1);assert.equal(s.notes.projectRefs(owner,project.id).items.length,1)
    assert.equal(s.assets.original(owner,doc.id,doc.version_id,false).sha256,sha('Fixed original'));assert.equal(s.citations.resolve(owner,citation.id).quote,'Fixed original')
  }finally{s.close()}
})

test('source revoke hides locator without deleting or preventing author edits',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-note-acl-')),{actor:owner}=await seed({ProbeStorage,IdentityService},dir)
  const s=new ProbeStorage({dataDir:dir}), peer=await register(s,'reader'), imported=publish(s,owner,'Shared secret')
  const now=new Date().toISOString(),project=s.createProject({id:randomUUID(),serviceId:owner.serviceId,ownerUserId:owner.userId,name:'Source project',now})
  const projectAsset=s.createObject({id:randomUUID(),serviceId:owner.serviceId,spaceId:owner.personalSpaceId,ownerUserId:owner.userId,
    scope:'project',projectId:project.id,objectType:'asset',title:'Shared source',body:'',now})
  s.addProjectMembership({projectId:project.id,userId:peer.userId,role:'member',validFrom:now})
  // Project publication is outside this unit; bind the fixture's real version to the project asset.
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'));try{
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');db.prepare('INSERT INTO assets VALUES(?)').run(projectAsset.id)
    assert.equal(db.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(projectAsset.id,imported.version_id,imported.id).changes,1)
    db.exec('COMMIT')
  }finally{db.close()}
  const doc={...imported,id:projectAsset.id},c=cite(s,owner,doc,'Shared secret')
  try{
    const id=s.notes.create(peer,peer.userId,randomUUID(),draft).data.id, gid=randomUUID()
    assert.throws(()=>s.notes.save(peer,peer.userId,id,1,{add_citation:c.id}),{code:'SOURCE_NOT_FOUND'})
    assert(s.grantObject(owner,{id:gid,objectId:doc.id,serviceId:owner.serviceId,subjectType:'user',subjectId:peer.userId,action:'read',validFrom:now,now}))
    const {references:[reference]}=s.notes.save(peer,peer.userId,id,1,{add_citation:c.id})
    assert(s.revokeGrant(owner,gid,new Date().toISOString()))
    assert.deepEqual(s.notes.get(peer,id).references,[{id:reference.id,status:'unavailable'}]);assert.equal(s.notes.get(peer,id).body,draft.body)
    assert.throws(()=>s.citations.resolve(peer,c.id),{code:'SOURCE_NOT_FOUND'})
    assert.deepEqual(s.notes.save(peer,peer.userId,id,2,{body:'Independent revision',remove_reference:reference.id}).references,[])
    assert.equal(s.notes.get(peer,id).body,'Independent revision');assert.equal(s.citations.resolve(owner,c.id).quote,'Shared secret')
  }finally{s.close()}
})
