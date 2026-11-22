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
import {seed} from '../fnd006/independent/common.mjs'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'

const hash=x=>createHash('sha256').update(x).digest('hex'),blob=(ext,data)=>({key:randomUUID()+'.'+ext,sha256:hash(data),byteLength:Buffer.byteLength(data)})
test('upgrade populated v13; failure preserves ZIP members, published text, identities and ledger',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-read-migrate-')),prior=join(dir,'v13.mjs');writeFileSync(prior,execFileSync('git',['show','5ee23801afd70276e8e18e4b132b9bf54adf67ce:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(prior)),{actor}=await seed(old,dir),s=new old.ProbeStorage({dataDir:dir}),bytes=Buffer.from('Chapter one')
  const member={ordinal:0,name:'notes.md',path:'notes.md',size:bytes.length,compressedSize:bytes.length,media:'text/markdown',reason:null}
  const {id}=s.archives.stage(actor,{title:'book.zip',key:randomUUID()},blob('zip','archive'),[member]);const entry=s.archives.manifest(actor,id).entries[0]
  const [m]=s.archives.select(actor,id,randomUUID(),[entry.id]);const r=s.assets.publish(actor,{title:m.path,key:m.key},blob('txt',bytes),{media:member.media,...decodeText(bytes,member.media)},s.archives.publication(id,m.id,m.key)).receipt
  const manifest=s.archives.manifest(actor,id);s.close();const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  try{
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name)
    const snapshot=()=>Object.fromEntries(names.map(n=>[n,db.prepare(`SELECT * FROM "${n}"`).all()]))
    const before=snapshot(),broken=new lib.ProbeStorage({dataDir:dir,failureAt:'v14:after-schema'});assert.equal(broken.available,false);broken.close()
    assert.deepEqual(snapshot(),before);assert.equal(db.prepare('PRAGMA user_version').get().user_version,13);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='citations'").get().n,0)
    for(let i=0;i<2;i++){const next=new lib.ProbeStorage({dataDir:dir});try{
      assert(next.available,next.failure?.message);const after=snapshot();assert.deepEqual(after.schema_migrations.splice(before.schema_migrations.length).map(m=>m.version),[14,15,16,17,18,19,20,21,22,23]);assert.deepEqual(after,before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
      assert.deepEqual(next.archives.manifest(actor,id),manifest);assert.equal(next.citations.source(actor,{asset_id:r.id,version_id:r.version_id,ordinal:1}).text,'Chapter one')
    }finally{next.close()}}
  }finally{db.close()}
})

test('old citation survives new version and restart; current source ACL gates both resolution and replay',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-citation-store-')),{actor:owner}=await seed(lib,dir);let s=new lib.ProbeStorage({dataDir:dir})
  const identity=new lib.IdentityService(s),creds={loginName:'reader',displayName:'Reader',password:'Synthetic reader password!'}
  await identity.register(creds);const login=await identity.login({...creds,source:'isolated'}),reader=identity.actor(login.token);await identity.close()
  const publish=(source,spec={})=>s.assets.publish(owner,{title:'sheet.txt',key:randomUUID(),...spec},blob('txt',source),{media:'text/plain',...decodeText(Buffer.from(source),'text/plain')}).receipt
  try{
    const text='same same',personal=publish(text),gid=randomUUID(),now=new Date().toISOString()
    assert.throws(()=>s.citations.source(reader,{asset_id:personal.id,version_id:personal.version_id,ordinal:1}),{code:'SOURCE_NOT_FOUND'})
    const project=s.createProject({id:randomUUID(),ownerUserId:owner.userId,serviceId:owner.serviceId,name:'Fixture',now});s.addProjectMembership({projectId:project.id,userId:reader.userId,role:'member',validFrom:now})
    const obj=s.createObject({id:randomUUID(),serviceId:owner.serviceId,spaceId:owner.personalSpaceId,scope:'project',projectId:project.id,ownerUserId:owner.userId,objectType:'asset',title:'Fixture',body:'',now})
    // Attach the synthetic version to a real project object. No ACL records are inserted by the fixture.
    const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'));try{db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');db.prepare('INSERT INTO assets VALUES(?)').run(obj.id);assert.equal(db.prepare('UPDATE asset_versions SET asset_id=? WHERE asset_id=? AND id=?').run(obj.id,personal.id,personal.version_id).changes,1);db.exec('COMMIT')}finally{db.close()}
    const r={...personal,id:obj.id},t={asset_id:r.id,version_id:r.version_id,ordinal:1},spec={...t,start:5,end:9,source_hash:hash(text)},key=randomUUID();assert.throws(()=>s.citations.source(reader,t),{code:'SOURCE_NOT_FOUND'})
    assert(s.grantObject(owner,{id:gid,objectId:r.id,serviceId:owner.serviceId,subjectType:'user',subjectId:reader.userId,action:'read',validFrom:now,now}))
    const result=s.citations.create(reader,spec,key),id=result.data.id;assert.equal(result.replayed,false);assert.equal(s.citations.resolve(reader,id).quote,'same')
    assert.deepEqual(s.citations.create(reader,spec,key),{...result,replayed:true});assert.throws(()=>s.citations.create(reader,{...spec,start:0,end:4},key),{code:'IDEMPOTENCY_CONFLICT'})
    const newer=publish('changed',{assetId:r.id,expectedVersion:1});s.close();s=new lib.ProbeStorage({dataDir:dir})
    assert.equal(s.citations.source(reader,{...t,version_id:newer.version_id}).text,'changed');assert.deepEqual(s.citations.resolve(reader,id),{...result.data,quote:'same'})
    assert.throws(()=>s.citations.create(reader,{...spec,version_id:newer.version_id},randomUUID()),{code:'CITATION_SOURCE_CHANGED'})
    assert(s.revokeGrant(owner,gid,new Date().toISOString()));for(const get of [()=>s.citations.target(reader,id),()=>s.citations.resolve(reader,id),()=>s.citations.create(reader,spec,key)])assert.throws(get,{code:'SOURCE_NOT_FOUND'})
    assert.equal(s.citations.resolve(owner,id).version_id,r.version_id)
  }finally{s.close()}
})
