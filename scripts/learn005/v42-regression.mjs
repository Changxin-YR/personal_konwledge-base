import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const prior = 'a70ecfa6303c0000f5c8417ad4d61a365f63652b'
const paths = {
  entry:'packages/knowledgeos-panel/lib/index.js',bundle:'packages/knowledgeos-panel/lib/test-support.js',
  storage:'packages/knowledgeos-panel/lib/storage.js',decode:'packages/knowledgeos-panel/src/host/text-document.ts',
}
const newTables=['practice_transfers','practice_solution_reveals']
const additions={question_versions:['difficulty','basic'],practice_sessions:['mode','standard'],practice_hint_events:['for_sequence',1]}
const sha=data=>createHash('sha256').update(data).digest('hex')
const from=path=>import(pathToFileURL(path).href)
const ledger=db=>db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const version=db=>db.prepare('PRAGMA user_version').get().user_version
const schema=db=>db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
const integrity=db=>assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
function contents(db,tables){
  return Object.fromEntries(tables.map(table=>{
    assert.match(table,/^[a-z][a-z0-9_]*$/)
    return [table,db.prepare('SELECT * FROM "'+table+'"').all().map(row=>({...row})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]
  }))
}
function dbAction(path,readonly,task){
  const db=new DatabaseSync(path,{readOnly:readonly})
  try{db.exec(readonly?'BEGIN':'PRAGMA busy_timeout=3000');return task(db)}
  finally{db.close()}
}
function errors(error){
  const trace=[]
  for(let item=error;item;item=item.cause)trace.push(item.message)
  return trace.join('\n')
}
function simulatedDate(){
  const NativeDate=globalThis.Date
  let now=NativeDate.now()
  globalThis.Date=new Proxy(NativeDate,{
    construct(target,args,newTarget){return Reflect.construct(target,args.length?args:[now],newTarget)},
    apply(){return new NativeDate(now).toString()},
    get(target,key,receiver){return key==='now'?()=>now:Reflect.get(target,key,receiver)},
  })
  return {now:()=>now,advance(at){assert(at>=now);now=at},restore(){globalThis.Date=NativeDate}}
}

async function seed(older,decodeText,dir){
  assert.equal(older.SCHEMA_VERSION,41)
  const s=new older.ProbeStorage({dataDir:dir}),identity=new older.IdentityService(s)
  try{
    assert(s.available,errors(s.failure))
    const password='Synthetic v42 fixture passphrase!'
    await identity.bootstrap({loginName:'v42author',displayName:'离线作者',password,domains:['software_engineering'],
      learningTracks:['engineering_practice'],goalText:'保留作者方向'})
    await identity.register({loginName:'v42learner',displayName:'离线参与者',password,domains:['system_architecture'],
      learningTracks:['architecture_exam'],goalText:'保留学员方向'})
    const author=identity.actor((await identity.login({loginName:'v42author',password,source:'v42-offline'})).token)
    const learner=identity.actor((await identity.login({loginName:'v42learner',password,source:'v42-offline'})).token)
    assert(author&&learner&&author.userId!==learner.userId)
    const project=s.createProject({id:randomUUID(),serviceId:author.serviceId,ownerUserId:author.userId,name:'离线迁移练习',now:new Date().toISOString()})
    function invite(target){
      const invitation=s.invitations.create(author,author.userId,target,randomUUID())
      assert.equal(s.invitations.redeem(learner,learner.userId,invitation.token).replayed,false)
      return invitation
    }
    invite({scope:'project',id:project.id,permission:'member'})
    function source(title,text){
      const bytes=Buffer.from(text),key=randomUUID()
      const asset=s.assets.publish(author,{title,key},{key,sha256:sha(bytes),byteLength:bytes.length},
        {media:'text/markdown',...decodeText(bytes,'text/markdown')}).receipt
      const citation=s.citations.create(author,{asset_id:asset.id,version_id:asset.version_id,ordinal:1,start:0,end:text.length,source_hash:sha(text)},
        randomUUID()).data
      const invitation=invite({scope:'object',id:asset.id,permission:'read'})
      assert.equal(s.citations.resolve(learner,citation.id).quote,text)
      return {citation,invitation}
    }
    const original=source('原题资料','原条件必须验证输入边界。')
    const destination=source('迁移资料','迁移服务使用提交队列前必须验证权限。')
    const legacy=s.practice.createQuestion(author,randomUUID(),{kind:'judgment',prompt:'旧题是否允许忽略原条件？',options:[],accepted:[false],
      explanation:'固定引用要求验证输入边界。',source_citation_id:original.citation.id,project_id:project.id}).question
    const session=s.practice.createSession(learner,randomUUID(),[legacy.version_id]).session
    const hintKey=randomUUID()
    const hinted=s.practice.hint(learner,hintKey,session.id,legacy.version_id,1)
    assert.equal(hinted.hint.level,1)
    const saved=s.practice.submit(learner,randomUUID(),session.id,{question_version_id:legacy.version_id,expected_sequence:0,answer:true,confidence:'sure'})
    assert.equal(saved.attempt.independent,false)
    assert.equal(saved.attempt.grading_state,'incorrect')
    const review=s.practice.updateReview(learner,randomUUID(),legacy.id,
      {expected_revision:0,wrong_reason:'持久保存的旧错因',mastery_state:'reviewing',next_review_at:'2099-01-02T00:00:00.000Z'})
    const disputeKey=randomUUID(),reason='旧练习提交的争议'
    const dispute=s.practice.dispute(learner,disputeKey,session.id,legacy.version_id,reason)
    assert.equal(dispute.dispute.status,'open')
    return {author,learner,project,original,destination,legacy,session,hintKey,saved,review,dispute,disputeKey,reason}
  }finally{await identity.close();s.close()}
}

async function main(){
  const [checkout,candidate,entry]=process.argv.slice(2)
  assert.match(candidate,/^[a-f0-9]{40}$/)
  assert.match(entry,/^[a-f0-9]{64}$/)
  const root=resolve(checkout),git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root,maxBuffer:32*1024*1024})
  assert.equal(git('rev-parse','HEAD').toString().trim(),candidate)
  git('merge-base','--is-ancestor',prior,candidate)
  for(const file of Object.values(paths))assert.deepEqual(readFileSync(join(root,file)),git('show',candidate+':'+file))
  assert.equal(sha(readFileSync(join(root,paths.entry))),entry)
  const dir=mkdtempSync(join(tmpdir(),'kos-learn005-v42-')),dbFile=join(dir,'knowledgeos.sqlite')
  const oldPath=join(dir,'frozen-v41.mjs'),oldBytes=git('show',prior+':'+paths.bundle)
  writeFileSync(oldPath,oldBytes,{flag:'wx'})
  const proof={unit_id:'LEARN-005',candidate_sha:candidate,entry_sha256:entry,frozen_v41:prior,old_bundle_sha256:sha(oldBytes),
    test_support_sha256:sha(readFileSync(join(root,paths.bundle))),runner_sha256:sha(readFileSync(fileURLToPath(import.meta.url))),
    scope:'INDEPENDENT_OFFLINE_V42_STORAGE',command:'node --experimental-transform-types v42-regression.mjs <checkout> <candidate SHA> <entry SHA-256>',
    status:'FAIL',exit_code:1,real_inference_requests:0,results:[]}
  const pass=(id,actual)=>proof.results.push({id,status:'PASS',actual})
  const read=task=>dbAction(dbFile,true,task)
  const sql=text=>dbAction(dbFile,false,db=>db.exec(text))
  const clock=simulatedDate()
  try{
    const older=await from(oldPath),fresh=await from(join(root,paths.bundle))
    const {decodeText}=await from(join(root,paths.decode))
    const {MIGRATION_V42_CHECKSUM}=await from(join(root,paths.storage))
    assert.equal(fresh.SCHEMA_VERSION,42)
    assert.match(MIGRATION_V42_CHECKSUM,/^[a-f0-9]{64}$/)
    const fixture=await seed(older,decodeText,dir)
    const before=read(db=>{
      assert.equal(version(db),41)
      const catalog=schema(db),tables=catalog.filter(row=>row.type==='table'&&!row.name.startsWith('sqlite_')&&row.name!=='schema_migrations')
        .map(row=>row.name)
      const data=contents(db,tables)
      for(const name of ['question_versions','practice_sessions','practice_hint_events','practice_attempts','practice_attempt_receipts',
        'personal_question_states','personal_question_receipts','practice_disputes'])assert.equal(data[name].length,1)
      integrity(db)
      return {catalog,tables,data,ledger:ledger(db)}
    })
    pass('populated_v41_legacy_attempt_hint_personal_state_and_dispute','Frozen v41 stored a real attempt, hint, private note and open report linked to one fixed citation and two real author/learner accounts.')
    const failure=new fresh.ProbeStorage({dataDir:dir,failureAt:'v42:after-schema'})
    try{assert(!failure.available);assert.match(errors(failure.failure),/v42:after-schema/)}
    finally{failure.close()}
    read(db=>{
      assert.equal(version(db),41)
      assert.deepEqual(schema(db),before.catalog)
      assert.deepEqual(ledger(db),before.ledger)
      assert.deepEqual(contents(db,before.tables),before.data)
      integrity(db)
    })
    pass('v42_after_ddl_fault_restores_old_table_definitions_and_rows','Fault after all three ALTERs and new tables left every old definition and legacy row, report, hint, role and receipt exactly unchanged.')
    let acceptedLedger
    for(let boot=0;boot<2;boot++){
      const storage=new fresh.ProbeStorage({dataDir:dir})
      try{
        assert(storage.available,errors(storage.failure))
        read(db=>{
          assert.equal(version(db),42)
          const current=ledger(db)
          assert.equal(current.length,42)
          assert.deepEqual(current.slice(0,41),before.ledger)
          assert.deepEqual([current[41].version,current[41].checksum],[42,MIGRATION_V42_CHECKSUM])
          const migrated=contents(db,before.tables)
          for(const [table,[column,defaultValue]] of Object.entries(additions)){
            assert(migrated[table].length>0)
            migrated[table]=migrated[table].map(row=>{
              const {[column]:value,...old}=row
              assert.equal(value,defaultValue)
              return old
            })
          }
          assert.deepEqual(migrated,before.data)
          assert.deepEqual(contents(db,newTables),Object.fromEntries(newTables.map(table=>[table,[]])))
          if(acceptedLedger)assert.deepEqual(current,acceptedLedger);else acceptedLedger=current
          integrity(db)
        })
        const old=storage.practice.questions(fixture.learner,fixture.session.id)
        assert.equal(old.session.mode,'standard')
        assert.equal(old.questions[0].difficulty,'basic')
        assert.equal(old.questions[0].hints[0].for_sequence,1)
        assert.equal(old.questions[0].attempts[0].id,fixture.saved.attempt.id)
        assert.equal(old.questions[0].feedback.accepted_answer,false)
        assert.equal(storage.practice.review(fixture.learner).items[0].classification,'disputed')
      }finally{storage.close()}
    }
    pass('v42_exact_one_checksum_and_legacy_defaults','Two v42 opens kept one correctly bound ledger receipt and exposed only documented defaults for existing rows; old v41 feedback and private disputed classification survived.')

    const store=new fresh.ProbeStorage({dataDir:dir}),state=()=>read(db=>{integrity(db);return contents(db,[...before.tables,...newTables])})
    let scheduled,transferSession,protectedState
    try{
      assert(store.available,errors(store.failure))
      const {author,learner,project,original,destination}=fixture
      const question=(title,citation,difficulty)=>store.practice.createQuestion(author,randomUUID(),{kind:'judgment',prompt:title,
        options:[],accepted:[true],explanation:'初题与迁移题均有各自的固定引用。',source_citation_id:citation.id,
        project_id:project.id,difficulty}).question
      const primary=question('原题是否必须检查输入边界？',original.citation,'intermediate')
      const target=question('迁移服务提交队列前要核对权限吗？',destination.citation,'intermediate')
      const mismatched=question('迁移服务是否应该核验权限？',destination.citation,'advanced')
      const guided=store.practice.createSession(learner,randomUUID(),[primary.version_id],'guided').session
      const due=clock.now()+60_000,plan={primary_session_id:guided.id,target_version_id:target.version_id,available_at:new Date(due).toISOString()}
      assert.throws(()=>store.practice.hint(learner,randomUUID(),guided.id,primary.version_id,1),{code:'FIRST_ANSWER_REQUIRED'})
      const send=(id,q,sequence,answer,key=randomUUID())=>store.practice.submit(learner,key,id,{
        question_version_id:q.version_id,expected_sequence:sequence,answer,confidence:'sure',
      })
      const firstKey=randomUUID(),first=send(guided.id,primary,0,false,firstKey)
      assert.equal(first.attempt.independent,true)
      assert.equal(first.attempt.grading_state,'incorrect')
      assert.equal(first.feedback,null)
      assert.throws(()=>store.practice.scheduleTransfer(learner,randomUUID(),plan),{code:'TRANSFER_EVIDENCE_INSUFFICIENT'})
      const levels=[1,2].map(level=>store.practice.hint(learner,randomUUID(),guided.id,primary.version_id,level).hint)
      assert.deepEqual(levels.map(item=>item.for_sequence),[2,2])
      const next=send(guided.id,primary,1,true)
      assert.equal(next.attempt.grading_state,'correct')
      assert.equal(next.attempt.independent,false)
      assert.equal(next.feedback.accepted_answer,true)
      assert.equal(send(guided.id,primary,0,false,firstKey).feedback,null)
      assert.equal(store.practice.questions(learner,guided.id).questions[0].attempts.length,2)
      assert.throws(()=>store.practice.scheduleTransfer(learner,randomUUID(),{...plan,target_version_id:mismatched.version_id}),{code:'TRANSFER_NOT_COMPARABLE'})
      assert.throws(()=>store.practice.scheduleTransfer(learner,randomUUID(),{...plan,available_at:new Date().toISOString()}),{code:'TRANSFER_DELAY_REQUIRED'})
      pass('first_independent_wrong_and_real_hints_followed_by_assisted_correct','The first wrong answer was saved without solution; two real hints were attached to sequence 2, the separate assisted correct record did not overwrite or expose the original first receipt, and mismatch/no-delay were rejected.')

      const scheduleKey=randomUUID()
      scheduled=store.practice.scheduleTransfer(learner,scheduleKey,plan)
      assert.equal(scheduled.transfer.first_attempt_id,first.attempt.id)
      assert.equal(scheduled.transfer.guided_attempt_id,next.attempt.id)
      assert.equal(scheduled.transfer.status,'scheduled')
      assert.equal(scheduled.transfer.evidence_state,'insufficient')
      assert.deepEqual(store.practice.scheduleTransfer(learner,scheduleKey,plan),{...scheduled,replayed:true})
      assert.throws(()=>store.practice.scheduleTransfer(learner,scheduleKey,{...plan,available_at:new Date(due+1).toISOString()}),{code:'IDEMPOTENCY_CONFLICT'})
      assert.throws(()=>store.practice.startTransfer(author,randomUUID(),scheduled.transfer.id),{code:'PRACTICE_NOT_FOUND'})
      const startKey=randomUUID(),open=()=>store.practice.startTransfer(learner,startKey,scheduled.transfer.id)
      clock.advance(due-1)
      const notDue=state()
      assert.throws(open,{code:'TRANSFER_NOT_DUE'})
      assert.deepEqual(state(),notDue)
      clock.advance(due)
      assert.equal(store.practice.listTransfers(learner).items[0].status,'ready')
      const startFault="CREATE TRIGGER v42_start_fault BEFORE UPDATE OF started_session_id ON practice_transfers WHEN (SELECT mode FROM practice_sessions WHERE id=NEW.started_session_id)='transfer' BEGIN SELECT RAISE(ABORT,'synthetic transfer start pointer and key fault'); END"
      sql(startFault)
      try{
        assert.throws(open)
        assert.deepEqual(state(),notDue)
        assert.equal(store.practice.listTransfers(learner).items[0].started_session_id,null)
      }finally{sql('DROP TRIGGER v42_start_fault')}
      const started=open()
      assert.equal(started.session.mode,'transfer')
      assert.equal(started.transfer.started_at,new Date(due).toISOString())
      assert.equal(started.transfer.started_session_id,started.session.id)
      assert.notEqual(started.session.id,guided.id)
      transferSession=started.session.id
      const active=state()
      assert.equal(active.practice_transfers[0].start_key,startKey)
      assert.deepEqual(open(),{...started,replayed:true})
      assert.deepEqual(state(),active)
      assert.throws(()=>store.practice.hint(learner,randomUUID(),transferSession,target.version_id,1),{code:'TRANSFER_HINTS_DISABLED'})
      assert.equal(store.practice.questions(learner,transferSession).questions[0].feedback,null)
      pass('due_at_exact_millisecond_start_pointer_key_rollback_and_retry','At due minus one millisecond no transfer session, pin or start key was written. At due the transfer session was staged but a pointer/key fault rolled it all back. Same request then opened one new session and replayed it exactly.')

      const answer=send(transferSession,target,0,true)
      assert.equal(answer.attempt.sequence,1)
      assert.equal(answer.attempt.independent,true)
      assert.equal(answer.attempt.evaluation_eligible,true)
      assert.equal(answer.feedback.evidence.id,destination.citation.id)
      const observed=store.practice.listTransfers(learner).items[0]
      assert.deepEqual([observed.status,observed.evidence_state,observed.transfer_attempt_id],['observed','independent_transfer_supported',answer.attempt.id])
      assert.deepEqual([observed.first_observation.independent,observed.guided_observation.independent,observed.transfer_observation.independent],[true,false,true])
      assert.deepEqual(state().users,before.data.users)
      protectedState=state()
      pass('distinct_transfer_result_keeps_previous_attempts_and_profile','Only an independent correct result on the comparable distinct target earned narrow transfer evidence. Three immutable result IDs remained separate, no learning profile changed.')
    }finally{store.close()}
    const reopened=new fresh.ProbeStorage({dataDir:dir})
    try{
      assert(reopened.available,errors(reopened.failure))
      assert.deepEqual(state(),protectedState)
      assert.deepEqual(read(ledger),acceptedLedger)
      assert.equal(reopened.practice.listTransfers(fixture.learner).items[0].status,'observed')
      const invitation=reopened.invitations.get(fixture.author,fixture.author.userId,fixture.destination.invitation.id)
      reopened.invitations.change(fixture.author,fixture.author.userId,invitation.id,invitation.revision,'revoke')
      const stopped=state()
      assert.deepEqual(reopened.practice.listTransfers(fixture.learner).items,[])
      assert.throws(()=>reopened.practice.questions(fixture.learner,transferSession),{code:'QUESTION_NOT_FOUND'})
      assert.throws(()=>reopened.practice.startTransfer(fixture.learner,randomUUID(),scheduled.transfer.id),{code:'QUESTION_NOT_FOUND'})
      assert.deepEqual(state(),stopped)
      assert.deepEqual(stopped.practice_attempts,protectedState.practice_attempts)
    }finally{reopened.close()}
    pass('reopen_and_source_revocation_never_change_prior_observations','Reopen retained the separate prior observations, then revoked target source denied old projection and start paths while preserving all saved attempts and producing no new state.')
    proof.status='PASS';proof.exit_code=0
  }catch(error){proof.failure=errors(error).slice(0,950);process.exitCode=1}
  finally{
    clock.restore()
    const output=join(dir,'summary.json')
    writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'})
    console.log(JSON.stringify({status:proof.status,checks:proof.results.length,proof:output}))
  }
}

await main()
