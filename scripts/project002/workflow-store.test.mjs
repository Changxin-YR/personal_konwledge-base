import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {IdentityService,ProbeStorage} from '../../packages/knowledgeos-panel/lib/test-support.js'
import {MIGRATION_V30_CHECKSUM,MIGRATION_V31_CHECKSUM,SCHEMA_VERSION} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'

const criteria=description=>({items:[{description,weight:2}],submission_rule:'next_submission'})
const draft=(assignee,admin,peer,due)=>({title:'Check delivery',goal:'Verify the source',due_at:due,assignee_id:assignee,final_reviewer_id:admin,
  ...(peer?{peer_reviewer_id:peer}:{}),criteria:criteria('Reproducible')})
const review=(met,requested_work)=>({results:[{criterion:1,met,evidence:met?'Verified':'Steps missing'}],reason:met?'Ready':'Incomplete',
  ...(requested_work?{requested_work}:{})})

test('v30 migration is atomic over populated v29 task and criteria records',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-task-v30-')), oldPath=join(dir,'v29.mjs')
  writeFileSync(oldPath,execFileSync('git',['show','5210b678bc50c34a5966f5d180870a33fe0268f8:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(oldPath).href),{actor}=await seed(old,dir)
  const original=new old.ProbeStorage({dataDir:dir})
  const {task}=original.projectTasks.assign(actor,actor.userId,null,randomUUID(),draft(actor.userId,actor.userId,null,new Date(Date.now()+60000).toISOString()))
  original.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  const list=t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()
  const originalTasks=list('tasks'), originalCriteria=list('task_criteria_versions'), ledger=list('schema_migrations'), schema=list('sqlite_schema')
  let storage
  try{
    storage=new ProbeStorage({dataDir:dir,failureAt:'v30:after-schema'});assert(!storage.available);assert.match(storage.failure.cause.message,/v30:after-schema/);storage.close()
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,29);assert.deepEqual(list('sqlite_schema'),schema);assert.deepEqual(list('schema_migrations'),ledger)
    storage=new ProbeStorage({dataDir:dir});assert(storage.available,storage.failure?.message)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);assert.equal(list('schema_migrations')[29].checksum,MIGRATION_V30_CHECKSUM)
    assert.deepEqual(list('schema_migrations').slice(0,29),ledger);assert.deepEqual(list('tasks'),originalTasks);assert.deepEqual(list('task_criteria_versions'),originalCriteria)
    assert.deepEqual(storage.projectTasks.get(actor,task.id),task)
    const {access_revision,...history}=storage.projectTasks.history(actor,task.id)
    assert.match(access_revision,/^[a-f0-9]{64}$/);assert.deepEqual(history,{task_revision:1,submissions:[],reviews:[]})
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{storage?.close();db.close()}
})

test('v31 rolls back over populated v30 task, submission and decision history',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-task-v31-')),path=join(dir,'knowledgeos.sqlite'),oldPath=join(dir,'v30.mjs')
  writeFileSync(oldPath,execFileSync('git',['show','76fba933296077d8d68caf8b8a29f2f3f0763f20:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(oldPath).href),{actor}=await seed(old,dir)
  const original=new old.ProbeStorage({dataDir:dir}),identity=new old.IdentityService(original)
  const creds={loginName:'migration-worker',password:randomUUID(),displayName:'Migration worker'}
  await identity.register(creds);const member=identity.actor((await identity.login({...creds,source:'fixture'})).token)
  const {id:p}=original.createProject({id:randomUUID(),serviceId:actor.serviceId,ownerUserId:actor.userId,name:'v30 History',now:new Date().toISOString()})
  const invitation=original.invitations.create(actor,actor.userId,{scope:'project',id:p,permission:'member',days:2,max_redemptions:1},randomUUID())
  original.invitations.redeem(member,member.userId,invitation.token)
  const {task}=original.projectTasks.assign(actor,actor.userId,p,randomUUID(),draft(member.userId,actor.userId,null,new Date(Date.now()+60000).toISOString()))
  const {submission}=original.projectTasks.submit(member,member.userId,task.id,randomUUID(),1,'Original v30 evidence')
  original.projectTasks.review(actor,actor.userId,task.id,randomUUID(),2,submission.id,'final_return',review(false,'More detail'))
  const history=original.projectTasks.history(actor,task.id)
  await identity.close();original.close()
  const db=new DatabaseSync(path),tables=['tasks','task_criteria_versions','task_submissions','task_review_decisions']
  const list=t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()
  const snapshot=tables.map(list),schema=list('sqlite_schema'),ledger=list('schema_migrations')
  let storage
  try{
    db.prepare('UPDATE schema_migrations SET checksum=? WHERE version=30').run('0'.repeat(64))
    storage=new ProbeStorage({dataDir:dir});assert(!storage.available);storage.close()
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,30)
    db.prepare('UPDATE schema_migrations SET checksum=? WHERE version=30').run(MIGRATION_V30_CHECKSUM)
    storage=new ProbeStorage({dataDir:dir,failureAt:'v31:after-schema'});assert(!storage.available);assert.match(storage.failure.cause.message,/v31:after-schema/);storage.close()
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,30)
    assert.deepEqual(list('sqlite_schema'),schema);assert.deepEqual(list('schema_migrations'),ledger);assert.deepEqual(tables.map(list),snapshot)
    storage=new ProbeStorage({dataDir:dir});assert(storage.available,storage.failure?.message)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION)
    assert.equal(list('schema_migrations')[30].checksum,MIGRATION_V31_CHECKSUM)
    assert.deepEqual(list('schema_migrations').slice(0,30),ledger);assert.deepEqual(tables.map(list),snapshot)
    const {access_revision,...migrated}=storage.projectTasks.history(actor,task.id)
    assert.match(access_revision,/^[a-f0-9]{64}$/);assert.deepEqual(migrated,history)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{storage?.close();db.close()}
})

test('real store preserves append-only attempts and decisions under role, timing, replay and revocation checks',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-task-review-')),{actor:owner}=await seed({ProbeStorage,IdentityService},dir)
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true}), storage=new ProbeStorage({dataDir:dir})
  const identity=new IdentityService(storage), store=storage.projectTasks
  const newUser=async loginName=>{
    const p={loginName,password:randomUUID(),displayName:loginName};await identity.register(p)
    return identity.actor((await identity.login({...p,source:'isolated'})).token)
  }
  let reopened
  try{
    const [worker,peer,outsider]=[await newUser('worker'),await newUser('peer'),await newUser('outsider')]
    const start=Date.now(), due=new Date(start+20000).toISOString();t.mock.timers.enable({apis:['Date'],now:start})
    const {id:p}=storage.createProject({id:randomUUID(),serviceId:owner.serviceId,ownerUserId:owner.userId,name:'Review test',now:new Date().toISOString()})
    const invitation=storage.invitations.create(owner,owner.userId,{scope:'project',id:p,permission:'member',days:2,max_redemptions:2},randomUUID())
    for(const member of [worker,peer])storage.invitations.redeem(member,member.userId,invitation.token)
    const {task:{id}}=store.assign(owner,owner.userId,p,randomUUID(),draft(worker.userId,owner.userId,peer.userId,due))
    const ref=randomUUID()
    assert.throws(()=>store.submit(outsider,outsider.userId,id,ref,1,'Forged'),{code:'NOT_FOUND'})
    assert.throws(()=>store.submit(worker,owner.userId,id,ref,1,'Forged'),{code:'ACTOR_MISMATCH'})
    assert.throws(()=>store.submit(worker,worker.userId,id,ref,1,' '),{code:'INVALID_TASK_INPUT'})
    t.mock.timers.setTime(start+20000)
    const first=store.submit(worker,worker.userId,id,ref,1,'Original attempt')
    assert.equal(first.submission.submitted_at,due);assert.equal(first.submission.timing,'on_time');assert.equal(first.submission.criteria_version,1)
    assert.equal(first.task.next_actor_id,peer.userId);assert.equal(first.task.state,'submitted')
    const replay=store.submit(worker,worker.userId,id,ref,1,'Original attempt');assert(replay.replayed);assert.deepEqual(replay.submission,first.submission)
    assert.throws(()=>store.submit(worker,worker.userId,id,ref,1,'New body'),{code:'TASK_REQUEST_CONFLICT'})
    assert.throws(()=>store.review(owner,owner.userId,id,randomUUID(),2,first.submission.id,'final_accept',review(true)),{code:'TASK_STATE_CONFLICT'})
    t.mock.timers.setTime(start+21000)
    const passKey=randomUUID(), pass=store.review(peer,peer.userId,id,passKey,2,first.submission.id,'peer_pass',review(true))
    assert.equal(pass.task.state,'awaiting_admin_review');assert.equal(pass.task.next_actor_id,owner.userId)
    assert.throws(()=>store.review(peer,peer.userId,id,randomUUID(),3,first.submission.id,'final_accept',review(true)),{code:'NOT_FOUND'})
    assert.throws(()=>store.review(owner,owner.userId,id,randomUUID(),3,first.submission.id,'final_return',review(false)),{code:'INVALID_TASK_INPUT'})
    const returned=store.review(owner,owner.userId,id,randomUUID(),3,first.submission.id,'final_return',review(false,'Add steps'))
    assert.equal(returned.task.state,'returned');assert.equal(returned.task.next_actor_id,worker.userId);assert.equal(returned.review.requested_work,'Add steps')
    assert.equal(store.history(worker,id).submissions[0].submitted_at,due)
    const revised=store.revise(owner,owner.userId,id,4,criteria('Traceable evidence'));assert.equal(revised.criteria_revision,2)
    const second=store.submit(worker,worker.userId,id,randomUUID(),5,'Improved attempt')
    assert.equal(second.submission.previous_version,1);assert.equal(second.submission.criteria_version,2);assert.equal(second.submission.timing,'late')
    assert.throws(()=>store.review(peer,peer.userId,id,randomUUID(),6,first.submission.id,'peer_pass',review(true)),{code:'TASK_SUBMISSION_CONFLICT'})
    assert.throws(()=>store.review(peer,peer.userId,id,randomUUID(),5,second.submission.id,'peer_pass',review(true)),{code:'TASK_REVISION_CONFLICT'})
    const priorReplay=store.review(peer,peer.userId,id,passKey,2,first.submission.id,'peer_pass',review(true));assert(priorReplay.replayed);assert.deepEqual(priorReplay.review,pass.review)
    store.review(peer,peer.userId,id,randomUUID(),6,second.submission.id,'peer_pass',review(true))
    const final=store.review(owner,owner.userId,id,randomUUID(),7,second.submission.id,'final_accept',review(true))
    assert.equal(final.task.state,'accepted');assert.equal(final.task.next_actor_id,null)
    const before=store.history(owner,id)
    storage.projectTasks.removeMember(owner,owner.userId,p,peer.userId)
    assert.throws(()=>store.history(peer,id),{code:'NOT_FOUND'})
    assert.throws(()=>store.review(peer,peer.userId,id,passKey,2,first.submission.id,'peer_pass',review(true)),{code:'NOT_FOUND'})
    assert.deepEqual(before.submissions,[first.submission,second.submission]);assert.equal(before.reviews.length,4)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
    await identity.close();storage.close();reopened=new ProbeStorage({dataDir:dir});assert(reopened.available,reopened.failure?.message)
    assert.deepEqual(reopened.projectTasks.history(owner,id),before);assert.equal(reopened.projectTasks.get(owner,id).state,'accepted')
  }finally{t.mock.timers.reset();await identity.close();storage.close();reopened?.close();db.close()}
})
