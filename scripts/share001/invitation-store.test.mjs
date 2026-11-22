import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
import {MIGRATION_V23_CHECKSUM,MIGRATION_V24_CHECKSUM,MIGRATION_V25_CHECKSUM,MIGRATION_V26_CHECKSUM,MIGRATION_V27_CHECKSUM,MIGRATION_V28_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {seed} from '../fnd006/independent/common.mjs'

const day=86_400_000,digest=text=>createHash('sha256').update(text).digest('hex')
const key=()=>randomUUID()
const publish=(s,a,text='Stable document')=>s.assets.publish(a,{title:'document.txt',key:key()},
  {key:key(),byteLength:Buffer.byteLength(text),sha256:digest(text)},
  {media:'text/plain',...decodeText(Buffer.from(text),'text/plain')}).receipt
const spec=(d,permission='read')=>({scope:'object',id:d.id,permission})
const credentials=loginName=>({loginName,displayName:loginName,password:'Synthetic invitation test password 2026!'})
async function login(i,name){const auth=await i.login({...credentials(name),source:'test:'+name});const actor=i.actor(auth.token);assert(actor);return actor}
const now=()=>new Date().toISOString()
const write=(s,a,d)=>s.invitations.create(a,a.userId,d,key())
const redeem=(s,a,receipt)=>s.invitations.redeem(a,a.userId,receipt.token)
const denied={code:'INVITATION_UNAVAILABLE'}

test('day six redemption uses the original absolute boundary; edit is not management and the code is write-only',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-invitation-window-')),{actor:owner}=await seed(lib,dir),s=new lib.ProbeStorage({dataDir:dir}),i=new lib.IdentityService(s)
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  try{
    for(const name of ['early','late'])await i.register(credentials(name))
    const early=await login(i,'early'),doc=publish(s,owner),other=publish(s,owner,'unshared data'),t0=Date.now()
    t.mock.timers.enable({apis:['Date'],now:t0})
    const request=key(),x=s.invitations.create(owner,owner.userId,spec(doc),request),y=write(s,owner,spec(doc,'edit')),unused=write(s,owner,spec(doc))
    const expires=t0+7*day;assert.equal(Date.parse(x.expires_at),expires);assert.equal(y.expires_at,x.expires_at)
    const repeated=s.invitations.create(owner,owner.userId,spec(doc),request);assert.equal(repeated.id,x.id);assert(repeated.replayed);assert(!('token' in repeated))
    assert.throws(()=>s.invitations.create(owner,owner.userId,spec(doc,'edit'),request),{code:'IDEMPOTENCY_CONFLICT'})
    assert.equal(s.authorizeObject(early,doc.id,'read',now()),undefined)
    const original=redeem(s,early,x);assert.equal(original.expires_at,x.expires_at)
    assert.equal(redeem(s,early,x).id,original.id)
    assert(s.authorizeObject(early,doc.id,'read',now()));assert.equal(s.authorizeObject(early,doc.id,'edit',now()),undefined)
    assert.throws(()=>s.assets.original(early,doc.id,doc.version_id,true),{code:'ASSET_NOT_FOUND'})
    assert.equal(s.authorizeObject(early,other.id,'read',now()),undefined)
    t.mock.timers.setTime(t0+6*day)
    let late=await login(i,'late');const r=redeem(s,late,y);assert.equal(Date.parse(r.expires_at)-Date.parse(r.server_time),day)
    assert(s.authorizeObject(late,doc.id,'read',now()));assert(s.authorizeObject(late,doc.id,'edit',now()))
    for(const action of ['delete','manage_share','export','view_learning_records'])assert.equal(s.authorizeObject(late,doc.id,action,now()),undefined)
    assert.throws(()=>write(s,late,spec(doc)),denied)
    assert.equal(s.assets.list(late).length,1);assert.equal(s.assets.list(late)[0].id,doc.id)
    t.mock.timers.setTime(expires-1);late=await login(i,'late')
    assert(s.assets.original(late,doc.id,doc.version_id,false))
    t.mock.timers.setTime(expires)
    assert.throws(()=>redeem(s,late,unused),denied)
    assert.throws(()=>s.assets.original(late,doc.id,doc.version_id,false),{code:'ASSET_NOT_FOUND'});assert.deepEqual(s.assets.list(late),[])
    assert.equal(s.authorizeObject(late,doc.id,'edit',now()),undefined);assert(s.authorizeObject(owner,doc.id,'read',now()))
    assert.equal(db.prepare('SELECT token_hash FROM invitations WHERE id=?').get(y.id).token_hash,digest(y.token))
    assert.equal(db.prepare('SELECT count(*) n FROM invitation_redemptions').get().n,2)
    assert(!JSON.stringify(db.prepare('SELECT * FROM invitations').all()).includes(y.token))
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{t.mock.timers.reset();await i.close();db.close();s.close()}
})

test('group revision, renewal and revocation affect only their derived access; project member grants stay scoped',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-invitation-group-')),{actor:owner}=await seed(lib,dir),s=new lib.ProbeStorage({dataDir:dir}),i=new lib.IdentityService(s)
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  try{
    for(const name of ['one','two','three'])await i.register(credentials(name))
    const one=await login(i,'one'),two=await login(i,'two'),three=await login(i,'three'),doc=publish(s,owner)
    const group=write(s,owner,{...spec(doc),max_redemptions:2}),independent=write(s,owner,spec(doc,'edit'))
    const oneGrant=redeem(s,one,group);assert(!oneGrant.replayed);redeem(s,two,group)
    assert.throws(()=>redeem(s,three,group),{code:'INVITATION_FULL'});assert.equal(s.authorizeObject(three,doc.id,'read',now()),undefined)
    const standalone=redeem(s,one,independent)
    assert.throws(()=>s.invitations.change(owner,owner.userId,group.id,1,'renew',1),{code:'INVITATION_CHANGED'})
    const preview=s.invitations.get(owner,owner.userId,group.id);assert.equal(preview.affected.length,2)
    const extended=s.invitations.change(owner,owner.userId,group.id,preview.revision,'renew',1)
    assert.equal(extended.affected_count,2);assert.equal(Date.parse(extended.expires_at)-Date.parse(group.expires_at),day)
    assert.equal(redeem(s,one,group).expires_at,extended.expires_at);assert.equal(redeem(s,one,independent).expires_at,standalone.expires_at)
    const revoked=s.invitations.change(owner,owner.userId,group.id,extended.revision,'revoke')
    assert.equal(revoked.affected_count,2);assert.throws(()=>redeem(s,two,group),denied);assert(s.authorizeObject(one,doc.id,'edit',now()))
    assert.equal(s.authorizeObject(two,doc.id,'read',now()),undefined)
    assert.throws(()=>s.invitations.change(owner,owner.userId,group.id,revoked.revision,'renew',1),denied)
    const records=db.prepare('SELECT event,affected_count FROM invitation_audit WHERE invitation_id=? ORDER BY revision').all(group.id)
    assert.deepEqual(records.map(r=>Object.values(r)),[['issue',0],['redeem',1],['redeem',1],['renew',2],['revoke',2]])
    assert.equal(s.invitations.list(owner).items.length,2);assert.deepEqual(s.invitations.list(one).items,[])

    const p=s.createProject({id:key(),serviceId:owner.serviceId,ownerUserId:owner.userId,name:'Scoped project',now:now()})
    const projectInvite=write(s,owner,{scope:'project',id:p.id,permission:'member'})
    assert(!s.canCreateProjectObject(three,p.id,now()));redeem(s,three,projectInvite);assert(s.canCreateProjectObject(three,p.id,now()))
    assert(!s.canManageProject(three,p.id));assert.equal(s.authorizeObject(three,doc.id,'read',now()),undefined)
    const g=s.invitations.get(owner,owner.userId,projectInvite.id);s.invitations.change(owner,owner.userId,g.id,g.revision,'revoke')
    assert(!s.canCreateProjectObject(three,p.id,now()))
  }finally{await i.close();db.close();s.close()}
})

test('v22 recall data and migration ledger survive v23 failure, upgrade and reopen',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-invitation-migration-')),file=join(dir,'v22.mjs')
  writeFileSync(file,execFileSync('git',['show','1e567853a5c6fd23330246d4f35990328a96326d:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(file).href),{actor}=await seed(old,dir),initial=new old.ProbeStorage({dataDir:dir})
  const text='Source of legacy recall',doc=publish(initial,actor,text),point=offset=>({ordinal:1,offset,source_hash:digest(text)})
  const practice=initial.recall.create(actor,actor.userId,key(),{asset_id:doc.id,version_id:doc.version_id,title:'Recall survives',
    first:point(0),last:point(text.length),interior_hashes:[],masks:[{ordinal:1,start:0,end:6,group:1}]}).data
  initial.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true}),rows=table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  const version=()=>db.prepare('PRAGMA user_version').get().user_version,tables=['knowledge_objects','resource_grants','asset_versions','recall_materials','recall_segments','recall_masks']
  const data=tables.map(rows),ledger=rows('schema_migrations'),definitions=rows('sqlite_schema');let s
  try{
    assert.equal(version(),22);s=new lib.ProbeStorage({dataDir:dir,failureAt:'v23:after-schema'});assert(!s.available)
    assert.match(s.failure.cause.message,/v23:after-schema/);s.close()
    assert.equal(version(),22);assert.deepEqual(rows('sqlite_schema'),definitions);assert.deepEqual(rows('schema_migrations'),ledger);assert.deepEqual(tables.map(rows),data)
    for(let j=0;j<2;j++){
      s=new lib.ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message);assert.equal(version(),28)
      const applied=rows('schema_migrations'),last=applied.splice(22)
      assert.deepEqual(last.map(x=>[x.version,x.checksum]),[[23,MIGRATION_V23_CHECKSUM],[24,MIGRATION_V24_CHECKSUM],[25,MIGRATION_V25_CHECKSUM],[26,MIGRATION_V26_CHECKSUM],[27,MIGRATION_V27_CHECKSUM],[28,MIGRATION_V28_CHECKSUM]]);assert.deepEqual(applied,ledger)
      assert.deepEqual(tables.map(rows),data)
      const reopened=s.recall.get(actor,practice.material.id)
      assert.deepEqual({...reopened,material:{...reopened.material}},practice)
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);s.close()
    }
  }finally{s?.close();db.close()}
})

test('v24 failure leaves the populated v23 project and invitation history byte-for-byte intact',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-invitation-events-')),file=join(dir,'v23.mjs')
  writeFileSync(file,execFileSync('git',['show','7bca95a05dd2cb0ad2ddbd91787281e019173ce0:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(file).href),{actor:owner}=await seed(old,dir),s=new old.ProbeStorage({dataDir:dir}),identity=new old.IdentityService(s)
  try{
    await identity.register(credentials('peer'));const peer=await login(identity,'peer'),at=now()
    const p=s.createProject({id:key(),serviceId:owner.serviceId,ownerUserId:owner.userId,name:'Existing project',now:at})
    const member=write(s,owner,{scope:'project',id:p.id,permission:'member'});redeem(s,peer,member)
    const personal=publish(s,owner),invitation=write(s,owner,spec(personal));redeem(s,peer,invitation)
    s.createObject({id:key(),serviceId:owner.serviceId,spaceId:owner.personalSpaceId,scope:'project',projectId:p.id,ownerUserId:owner.userId,objectType:'note',title:'Existing grant target',body:'Synthetic',now:at})
    const target=s.listObjects(owner,'read',at).find(x=>x.projectId===p.id);assert(target)
    assert(s.grantObject(owner,{id:key(),objectId:target.id,serviceId:owner.serviceId,subjectType:'user',subjectId:peer.userId,action:'read',now:at,validFrom:at}))
  }finally{await identity.close();s.close()}
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true}),rows=table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  const version=()=>db.prepare('PRAGMA user_version').get().user_version
  const tables=['knowledge_projects','project_memberships','knowledge_objects','resource_grants','invitations','invitation_redemptions','invitation_audit','outbox']
  const oldRows=tables.map(rows),ledger=rows('schema_migrations'),schema=rows('sqlite_schema');let storage
  try{
    assert.equal(version(),23);storage=new lib.ProbeStorage({dataDir:dir,failureAt:'v24:after-schema'});assert(!storage.available)
    assert.match(storage.failure.cause.message,/v24:after-schema/);storage.close()
    assert.equal(version(),23);assert.deepEqual(rows('sqlite_schema'),schema);assert.deepEqual(rows('schema_migrations'),ledger);assert.deepEqual(tables.map(rows),oldRows)
    for(let j=0;j<2;j++){
      storage=new lib.ProbeStorage({dataDir:dir});assert(storage.available,storage.failure?.message);assert.equal(version(),28)
      assert.deepEqual(tables.map(rows),oldRows);assert.deepEqual(rows('schema_migrations').slice(0,23),ledger)
      assert.deepEqual(rows('domain_events'),[]);assert.deepEqual(rows('domain_event_outbox'),[]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
      storage.close()
    }
  }finally{storage?.close();db.close()}
})

test('v25 receipt migration rolls back on failure and preserves v24 event identity and grants',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-invitation-receipts-')),file=join(dir,'v24.mjs')
  writeFileSync(file,execFileSync('git',['show','4952d9c60a6f377d4b5f9109b22ba48be929334a:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(file).href),{actor:owner}=await seed(old,dir),s=new old.ProbeStorage({dataDir:dir}),identity=new old.IdentityService(s)
  let invitation
  try{
    await identity.register(credentials('peer'));const peer=await login(identity,'peer')
    invitation=write(s,owner,spec(publish(s,owner)));redeem(s,peer,invitation)
  }finally{await identity.close();s.close()}
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true}),rows=table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  const version=()=>db.prepare('PRAGMA user_version').get().user_version
  const tables=['invitations','invitation_redemptions','invitation_audit','domain_events','domain_event_outbox']
  const before=tables.map(rows),ledger=rows('schema_migrations'),schema=rows('sqlite_schema');let next
  try{
    assert.equal(version(),24);assert.equal(before[4].length,2)
    next=new lib.ProbeStorage({dataDir:dir,failureAt:'v25:after-schema'});assert(!next.available)
    assert.match(next.failure.cause.message,/v25:after-schema/);next.close()
    assert.equal(version(),24);assert.deepEqual(rows('sqlite_schema'),schema);assert.deepEqual(rows('schema_migrations'),ledger);assert.deepEqual(tables.map(rows),before)
    next=new lib.ProbeStorage({dataDir:dir});assert(next.available,next.failure?.message)
    assert.equal(version(),28);assert.deepEqual(rows('schema_migrations').slice(-4).map(x=>[x.version,x.checksum]),[[25,MIGRATION_V25_CHECKSUM],[26,MIGRATION_V26_CHECKSUM],[27,MIGRATION_V27_CHECKSUM],[28,MIGRATION_V28_CHECKSUM]])
    assert.deepEqual(rows('schema_migrations').slice(0,24),ledger);assert.deepEqual(tables.map(rows),before)
    const initial=next.invitations.get(owner,owner.userId,invitation.id),req=key()
    const renewed=next.invitations.change(owner,owner.userId,invitation.id,initial.revision,'renew',1,req)
    assert.equal(rows('invitation_change_receipts').length,1);next.close()
    next=new lib.ProbeStorage({dataDir:dir});assert(next.available,next.failure?.message)
    assert.deepEqual(next.invitations.change(owner,owner.userId,invitation.id,initial.revision,'renew',1,req),{...renewed,replayed:true})
    assert.equal(rows('domain_event_outbox').length,3);assert.equal(rows('invitation_change_receipts').length,1)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{next?.close();db.close()}
})
