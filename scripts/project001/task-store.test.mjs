import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { IdentityService, ProbeStorage } from '../../packages/knowledgeos-panel/lib/test-support.js'
import { MIGRATION_V29_CHECKSUM, SCHEMA_VERSION } from '../../packages/knowledgeos-panel/lib/storage.js'
import { seed } from '../fnd006/independent/common.mjs'

test('v29 rollback is atomic and retains v28 repository snapshots after successful append',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-task-v29-')), oldPath=join(dir,'v28.mjs')
  writeFileSync(oldPath,execFileSync('git',['show','12afff5bc52dee947544e1010da4afdb5ef69819:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(oldPath).href),{actor}=await seed(old,dir)
  const first=new old.ProbeStorage({dataDir:dir})
  const {snapshot}=first.repositories.saveSnapshot(actor,actor.userId,{owner:'test',name:'sample',id:123,private:false},
    {kind:'branch',value:'main'},'',{commit:'a'.repeat(40),tree:'b'.repeat(40)},[],new AbortController().signal)
  first.close()
  const read=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  const rows=t=>read.prepare('SELECT * FROM '+t+' ORDER BY rowid').all(), version=()=>read.prepare('PRAGMA user_version').get().user_version
  const ledger=rows('schema_migrations'),definitions=rows('sqlite_schema'),imports=rows('repository_snapshots')
  let s
  try {
    assert.equal(version(),28)
    s=new ProbeStorage({dataDir:dir,failureAt:'v29:after-schema'});assert(!s.available);assert.match(s.failure.cause.message,/v29:after-schema/);s.close()
    assert.equal(version(),28);assert.deepEqual(rows('schema_migrations'),ledger);assert.deepEqual(rows('sqlite_schema'),definitions)
    s=new ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message);assert.equal(version(),SCHEMA_VERSION)
    const appended=rows('schema_migrations');assert.equal(appended[28].checksum,MIGRATION_V29_CHECKSUM);assert.deepEqual(appended.slice(0,28),ledger)
    assert.deepEqual(rows('repository_snapshots'),imports);assert.deepEqual(s.repositories.list(actor),[snapshot])
    assert.equal(rows('tasks').length,0);assert.deepEqual(read.prepare('PRAGMA foreign_key_check').all(),[])
  } finally {s?.close();read.close()}
})

test('task revisions, replay, invitation removal, new membership and personal isolation use the real store',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-task-')), {actor:owner}=await seed({IdentityService,ProbeStorage},dir)
  const storage=new ProbeStorage({dataDir:dir}), identity=new IdentityService(storage)
  const newUser=async loginName=>{
    const p={loginName,password:randomUUID(),displayName:loginName}
    await identity.register(p);return identity.actor((await identity.login({...p,source:'isolated'})).token)
  }
  const tables=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  let reopened
  try {
    const worker=await newUser('worker'), outsider=await newUser('outsider'), peer=await newUser('peer')
    assert(worker&&outsider&&peer)
    const now=new Date().toISOString(), project=storage.createProject({id:randomUUID(),serviceId:owner.serviceId,ownerUserId:owner.userId,name:'Synthetic project',now})
    const p=project.id,t=storage.projectTasks,s=storage.invitations
    const issue=()=>s.create(owner,owner.userId,{scope:'project',id:p,permission:'member',days:7,max_redemptions:5},randomUUID())
    const inv=issue(), pending=issue();s.redeem(worker,worker.userId,inv.token);s.redeem(peer,peer.userId,inv.token)
    assert(t.projects(worker).some(row=>row.id===p));assert.deepEqual(t.projects(outsider),[])
    assert.throws(()=>t.members(outsider,p),{code:'NOT_FOUND'})
    assert.deepEqual(t.members(owner,p).members.map(x=>x.id).sort(),[owner.userId,worker.userId,peer.userId].sort())
    const items=[{description:'Output reproduced',weight:1}], criteria={items,submission_rule:'next_submission'}
    const draft={title:'Release check',goal:'Verify real output',due_at:new Date(Date.now()+86400000).toISOString(),assignee_id:worker.userId,final_reviewer_id:owner.userId,peer_reviewer_id:peer.userId,criteria}
    const key=randomUUID()
    assert.throws(()=>t.assign(worker,worker.userId,p,key,draft),{code:'NOT_FOUND'})
    assert.throws(()=>t.assign(owner,owner.userId,p,key,{...draft,assignee_id:outsider.userId}),{code:'TASK_MEMBER_UNAVAILABLE'})
    assert.throws(()=>t.assign(owner,owner.userId,p,key,{...draft,final_reviewer_id:peer.userId,peer_reviewer_id:undefined}),{code:'TASK_REVIEW_POLICY_REJECTED'})
    const saved=t.assign(owner,owner.userId,p,key,draft), id=saved.task.id
    assert.equal(saved.task.task_kind,'project_admin');assert.equal(saved.task.next_actor_id,worker.userId)
    assert.deepEqual(t.assign(owner,owner.userId,p,key,draft),{task:saved.task,replayed:true})
    assert.throws(()=>t.assign(owner,owner.userId,p,key,{...draft,title:'Different'}),{code:'TASK_REQUEST_CONFLICT'})
    assert.equal(t.get(worker,id).id,id);assert.equal(t.list(peer,p)[0].id,id)
    assert.throws(()=>t.get(outsider,id),{code:'NOT_FOUND'});assert.throws(()=>t.revise(worker,worker.userId,id,1,criteria),{code:'NOT_FOUND'})
    const changed=t.revise(owner,owner.userId,id,1,{...criteria,items:[{description:'Reproduce twice',weight:2}]})
    assert.equal(changed.revision,2);assert.deepEqual(changed.criteria_history[0],saved.task.criteria_history[0]);assert.equal(changed.criteria_history[1].effective_submission_rule,'next_submission')
    assert.throws(()=>t.revise(owner,owner.userId,id,1,criteria),{code:'TASK_REVISION_CONFLICT'})
    const personal=t.assign(worker,worker.userId,null,randomUUID(),{...draft,assignee_id:worker.userId,final_reviewer_id:worker.userId,peer_reviewer_id:undefined}).task
    assert.equal(personal.task_kind,'personal');assert.equal(t.list(worker,null)[0].id,personal.id)
    assert.throws(()=>t.get(owner,personal.id),{code:'NOT_FOUND'});assert.throws(()=>t.removeMember(peer,peer.userId,p,worker.userId),{code:'NOT_FOUND'})
    storage.addProjectMembership({projectId:p,userId:worker.userId,role:'member',validFrom:now})
    assert.deepEqual(t.removeMember(owner,owner.userId,p,worker.userId),{removed:true})
    assert.throws(()=>t.get(worker,id),{code:'NOT_FOUND'});assert.throws(()=>t.list(worker,p),{code:'NOT_FOUND'});assert.equal(t.get(worker,personal.id).id,personal.id)
    assert.equal(t.get(peer,id).id,id);assert.throws(()=>s.redeem(worker,worker.userId,pending.token),{status:404})
    await new Promise(resolve=>setTimeout(resolve,5))
    s.redeem(worker,worker.userId,issue().token);assert.equal(t.get(worker,id).revision,2)
    const log=tables.prepare('SELECT project_id,user_id,removed_by FROM project_membership_removals').all()
    assert.deepEqual(log.map(r=>({...r})),[{project_id:p,user_id:worker.userId,removed_by:owner.userId}]);assert.deepEqual(tables.prepare('PRAGMA foreign_key_check').all(),[])
    storage.close();reopened=new ProbeStorage({dataDir:dir});assert(reopened.available,reopened.failure?.message)
    assert.deepEqual(reopened.projectTasks.get(owner,id),changed)
  } finally {await identity.close();storage.close();reopened?.close();tables.close()}
})
