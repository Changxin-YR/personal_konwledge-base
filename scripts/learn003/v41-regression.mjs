import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const priorCandidate = '18e65b30a9246c2c488eb289c14cf7e51c6b3984'
const paths = {
  entry: 'packages/knowledgeos-panel/lib/index.js',
  bundle: 'packages/knowledgeos-panel/lib/test-support.js',
  storage: 'packages/knowledgeos-panel/lib/storage.js',
  decode: 'packages/knowledgeos-panel/src/host/text-document.ts',
}
const v41Tables = ['practice_hint_events','practice_disputes','question_corrections','practice_attempt_regrades',
  'personal_question_states','personal_question_receipts']
const sha = data => createHash('sha256').update(data).digest('hex')
const from = name => import(pathToFileURL(name).href)
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const version = db => db.prepare('PRAGMA user_version').get().user_version
const foreignKeys = db => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
const definitions = db => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()

function contents(db, tables) {
  return Object.fromEntries(tables.map(table => {
    assert.match(table, /^[a-z][a-z0-9_]*$/)
    return [table, db.prepare('SELECT * FROM "' + table + '"').all()
      .sort((left,right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]
  }))
}
function withDb(file, readOnly, task) {
  const db = new DatabaseSync(file, { readOnly })
  try {
    db.exec(readOnly ? 'BEGIN' : 'PRAGMA busy_timeout=3000')
    return task(db)
  } finally { db.close() }
}
function failureChain(error) {
  const trace = []
  for (let node = error; node; node = node.cause) trace.push(node.message)
  return trace.join('\n')
}

async function seed(prior, decodeText, dataDir) {
  assert.equal(prior.SCHEMA_VERSION, 40)
  const storage = new prior.ProbeStorage({ dataDir })
  const identity = new prior.IdentityService(storage)
  try {
    assert(storage.available, failureChain(storage.failure))
    const password = 'Synthetic v41 passphrase only!'
    const accounts = [
      ['v41author','独立编题者','engineering_practice','software_engineering','保持原目标甲'],
      ['v41one','独立练习甲','architecture_exam','system_architecture','保持原目标乙'],
      ['v41two','独立练习乙','knowledge_accumulation','hardware_engineering','保持原目标丙'],
    ]
    const subjects = []
    for (const [index,[loginName,displayName,track,domain,goalText]] of accounts.entries()) {
      const form = { loginName,displayName,password,learningTracks:[track],domains:[domain],goalText,source:'v41-offline' }
      if (index === 0) await identity.bootstrap(form)
      else await identity.register(form)
      const actor = identity.actor((await identity.login({ loginName,password,source:'v41-offline' })).token)
      assert(actor)
      subjects.push(actor)
    }
    const [author,first,second] = subjects
    const project = storage.createProject({
      id:randomUUID(),serviceId:author.serviceId,ownerUserId:author.userId,name:'纠正练习样本',now:new Date().toISOString(),
    })
    const quote = '新版校验不能忽略输入边界'
    const text = '🧪' + quote + '。旧段落曾写成能够忽略，需要修正。'
    const uploadKey = randomUUID(), bytes = Buffer.from(text), fileTitle = '纠正练习固定资料'
    const asset = storage.assets.publish(author,{title:fileTitle,key:uploadKey},{key:uploadKey,sha256:sha(bytes),byteLength:bytes.length},
      {media:'text/markdown',...decodeText(bytes,'text/markdown')}).receipt
    const target = { asset_id:asset.id,version_id:asset.version_id,ordinal:1 }
    const start = text.indexOf(quote)
    const witness = { spec:{...target,start,end:start+quote.length,source_hash:sha(text)},text:quote }
    const oldCitation = storage.citations.create(author,witness.spec,randomUUID()).data
    for (const target of [{ scope:'project',id:project.id,permission:'member' },{ scope:'object',id:asset.id,permission:'read' }]) {
      const invitation = storage.invitations.create(author,author.userId,{...target,max_redemptions:2},randomUUID())
      for (const actor of [first,second]) assert.equal(storage.invitations.redeem(actor,actor.userId,invitation.token).replayed,false)
    }
    const shared = storage.practice.createQuestion(author,randomUUID(),{
      kind:'judgment',prompt:'新版校验可以忽略输入边界。',options:[],accepted:[true],explanation:'拟定旧标准。',
      source_citation_id:oldCitation.id,project_id:project.id,
    }).question
    const players = []
    for (const [actor,answer] of [[first,false],[second,true]]) {
      const session = storage.practice.createSession(actor,randomUUID(),[shared.version_id]).session
      const input = { question_version_id:shared.version_id,expected_sequence:0,answer,confidence:'sure' }
      const key = randomUUID(), stored = storage.practice.submit(actor,key,session.id,input)
      players.push({actor,session,input,key,stored})
    }
    assert.deepEqual(players.map(entry => entry.stored.attempt.grading_state),['incorrect','correct'])

    const anchor = {spec:{...target,start:0,end:text.length,source_hash:sha(text)},text}
    const coverage = {scope:'paragraph',title:fileTitle,count:1,first:1,last:1,section_first:1,section_last:1,included:[1],
      unavailable:[],clipped:false,slices:[{ordinal:1,start:0,end:text.length}],return_href:'/knowledgeos/reader'}
    const quick = storage.practice.saveQuick(first,randomUUID(),{
      target,coverage,anchor,sources:[anchor],fingerprint:sha(JSON.stringify([target,coverage])),
    },[{source:witness,prompt:'新版校验检查什么？',options:['输入边界','忽略条件','网络路径'],answer:1,
      explanation:'源段落规定不得忽略输入边界。',quality:'ready'}],{provider:'offline-fixture',model:'storage-only-dto'})
    assert.equal(quick.status,'ready')
    const quickBefore = storage.practice.questions(first,quick.session.id)
    return {author,first,second,players,shared,oldCitation,quote,quick,quickBefore,profiles:subjects.map(actor=>identity.profile(actor.userId))}
  } finally {
    await identity.close()
    storage.close()
  }
}

function preservedProjection(storage, fixture) {
  const { author,first,players,shared,oldCitation,quote,quick } = fixture
  assert.equal(storage.practice.authored(author,shared.id).feedback.accepted_answer,true)
  assert.equal(storage.citations.resolve(first,oldCitation.id).quote,quote)
  assert.equal(storage.practice.questions(first,quick.session.id).questions[0].origin_kind,'generated')
  for (const {actor,session,stored} of players) {
    const old = storage.practice.questions(actor,session.id).questions[0]
    assert.equal(old.feedback.accepted_answer,true)
    assert.equal(old.attempts[0].id,stored.attempt.id)
  }
}

async function main() {
  const [checkout,candidate,entry] = process.argv.slice(2)
  assert.match(candidate,/^[a-f0-9]{40}$/)
  assert.match(entry,/^[a-f0-9]{64}$/)
  const root = resolve(checkout), git = (...args) => execFileSync('git',['--no-optional-locks',...args],{cwd:root})
  assert.equal(git('rev-parse','HEAD').toString().trim(),candidate)
  git('merge-base','--is-ancestor',priorCandidate,candidate)
  for(const file of Object.values(paths)) assert.deepEqual(readFileSync(join(root,file)),git('show',candidate+':'+file))
  assert.equal(sha(readFileSync(join(root,paths.entry))),entry)
  const dir = mkdtempSync(join(tmpdir(),'kos-learn003-v41-')),dbFile = join(dir,'knowledgeos.sqlite')
  const oldModule = join(dir,'frozen-v40.mjs'),oldBytes = git('show',priorCandidate+':'+paths.bundle)
  writeFileSync(oldModule,oldBytes,{flag:'wx'})
  const proof = {unit_id:'LEARN-003',candidate_sha:candidate,entry_sha256:entry,frozen_v40:priorCandidate,
    runner_sha256:sha(readFileSync(fileURLToPath(import.meta.url))),old_bundle_sha256:sha(oldBytes),
    test_support_sha256:sha(readFileSync(join(root,paths.bundle))),scope:'INDEPENDENT_OFFLINE_V41_STORAGE',
    command:'node --experimental-transform-types v41-regression.mjs <checkout> <candidate SHA> <entry SHA-256>',
    status:'FAIL',exit_code:1,real_inference_requests:0,results:[]}
  const pass = (id,actual) => proof.results.push({id,status:'PASS',actual})
  const read = task => withDb(dbFile,true,task)
  const sql = statement => withDb(dbFile,false,db=>db.exec(statement))
  try {
    const prior = await from(oldModule), fresh = await from(join(root,paths.bundle))
    const {decodeText} = await from(join(root,paths.decode))
    const {MIGRATION_V41_CHECKSUM} = await from(join(root,paths.storage))
    assert.equal(fresh.SCHEMA_VERSION,41)
    assert.match(MIGRATION_V41_CHECKSUM,/^[a-f0-9]{64}$/)
    const fixture = await seed(prior,decodeText,dir)
    const original = read(db=>{
      assert.equal(version(db),40)
      const schema = definitions(db)
      const tables = schema.filter(row=>row.type==='table'&&!row.name.startsWith('sqlite_')&&row.name!=='schema_migrations').map(row=>row.name)
      const data = contents(db,tables)
      assert.equal(data.practice_attempts.length,2)
      assert.equal(data.practice_attempt_receipts.length,2)
      assert.equal(data.quick_practice_runs.length,1)
      assert.equal(data.quick_practice_questions.length,1)
      foreignKeys(db)
      return {schema,tables,data,ledger:ledger(db)}
    })
    pass('frozen_v40_shared_played_attempts_and_generated_run','Production v40 built a shared fixed-source question with two genuine private attempts, plus its generated question/receipt and persisted profile directions.')
    const failing = new fresh.ProbeStorage({dataDir:dir,failureAt:'v41:after-schema'})
    try {
      assert(!failing.available)
      assert.match(failureChain(failing.failure),/v41:after-schema/)
    } finally { failing.close() }
    read(db=>{
      assert.equal(version(db),40)
      assert.deepEqual(definitions(db),original.schema)
      assert.deepEqual(ledger(db),original.ledger)
      assert.deepEqual(contents(db,original.tables),original.data)
      foreignKeys(db)
    })
    pass('v41_migration_failure_preserves_all_legacy_rows','Injected failure after the new schema rolled back every definition, old row and ledger record.')
    let upgradedLedger
    for(let boot=0;boot<2;boot++){
      const storage = new fresh.ProbeStorage({dataDir:dir})
      try {
        assert(storage.available,failureChain(storage.failure))
        read(db=>{
          assert.equal(version(db),41)
          const current=ledger(db)
          assert.equal(current.length,41)
          assert.deepEqual(current.slice(0,40),original.ledger)
          assert.deepEqual([current[40].version,current[40].checksum],[41,MIGRATION_V41_CHECKSUM])
          assert.deepEqual(contents(db,original.tables),original.data)
          assert(v41Tables.every(table=>contents(db,[table])[table].length===0))
          if(upgradedLedger) assert.deepEqual(current,upgradedLedger)
          else upgradedLedger=current
          foreignKeys(db)
        })
        preservedProjection(storage,fixture)
      } finally { storage.close() }
    }
    pass('one_v41_ledger_and_original_answers_still_visible_to_owners','Two successful opens produced one exact v41 checksum and unchanged v40 data, including learner-only originals and generated practice.')

    const storage = new fresh.ProbeStorage({dataDir:dir})
    const state = () => read(db=>{foreignKeys(db);return contents(db,[...original.tables,...v41Tables])})
    let postCorrection
    try {
      assert(storage.available,failureChain(storage.failure))
      const {author,first,second,players,shared,oldCitation}=fixture
      const own = (actor) => storage.practice.review(actor).items.find(item=>item.question.id===shared.id)
      assert.deepEqual([own(first).classification,own(second).classification],['wrong','independent_correct'])
      const wrongInput = {expected_revision:0,wrong_reason:'只有甲保存的独立错因',mastery_state:'reviewing',next_review_at:'2099-01-02T00:00:00.000Z'}
      const wrongKey=randomUUID()
      const personal=storage.practice.updateReview(first,wrongKey,shared.id,wrongInput)
      assert.equal(personal.state.revision,1)
      assert.deepEqual(storage.practice.updateReview(first,wrongKey,shared.id,wrongInput),{...personal,replayed:true})
      assert.equal(own(second).state.wrong_reason,'')
      assert.throws(()=>storage.practice.updateReview(author,randomUUID(),shared.id,wrongInput),{code:'QUESTION_NOT_FOUND'})
      assert(storage.practice.review(first).review_queue.some(row=>row.question_id===shared.id))
      const reportKey=randomUUID(), reportReason='旧标准与固定资料冲突'
      const report=storage.practice.dispute(first,reportKey,players[0].session.id,shared.version_id,reportReason)
      assert.equal(report.dispute.status,'open')
      assert.equal(own(first).classification,'disputed')
      assert.equal(own(second).classification,'disputed')
      assert.equal(own(second).evaluation_eligible,false)
      assert(!JSON.stringify(storage.practice.review(second)).includes(reportReason))
      assert(!storage.practice.review(first).review_queue.some(row=>row.question_id===shared.id))
      const before=state(), correctionKey=randomUUID()
      const patch={expected_version:1,answer:false,explanation:'固定资料明确要求检查输入边界。',reason:'旧标准纠正为否'}
      const correct=()=>storage.practice.correct(author,correctionKey,shared.id,patch)
      assert.throws(()=>storage.practice.correct(first,correctionKey,shared.id,patch),{code:'QUESTION_NOT_FOUND'})
      assert.throws(()=>storage.practice.correct(second,correctionKey,shared.id,patch),{code:'QUESTION_NOT_FOUND'})
      assert.deepEqual(state(),before)
      const triggers=[
        "CREATE TRIGGER v41_atomic_fault BEFORE INSERT ON practice_attempt_regrades WHEN EXISTS(SELECT 1 FROM practice_attempt_regrades WHERE correction_id=NEW.correction_id) BEGIN SELECT RAISE(ABORT,'synthetic second regrade fault'); END",
        "CREATE TRIGGER v41_atomic_fault BEFORE UPDATE OF current_version_id ON questions WHEN (SELECT COUNT(*) FROM practice_attempt_regrades WHERE corrected_version_id=NEW.current_version_id)=2 BEGIN SELECT RAISE(ABORT,'synthetic corrected pointer fault after regrades'); END",
      ]
      for(const trigger of triggers){
        sql(trigger)
        try{
          assert.throws(correct)
          assert.deepEqual(state(),before)
          assert.equal(storage.practice.dispute(first,reportKey,players[0].session.id,shared.version_id,reportReason).dispute.status,'open')
          assert.equal(own(second).evaluation_eligible,false)
        } finally { sql('DROP TRIGGER v41_atomic_fault') }
      }
      pass('faults_in_second_regrade_and_pointer_rollback_everything','Failure after one real regrade, or after both, restored the original rubric, report, correction receipt, ledgers, attempts and every relevant row.')

      const fixed=correct(); postCorrection=state()
      assert.equal(fixed.replayed,false)
      assert.equal(fixed.question.version,2)
      assert.equal(fixed.correction.from_version_id,shared.version_id)
      assert.equal(fixed.correction.to_version_id,fixed.question.version_id)
      assert.equal(postCorrection.question_corrections.length,1)
      assert.equal(postCorrection.practice_attempt_regrades.length,2)
      assert.equal(postCorrection.questions.find(row=>row.id===shared.id).current_version_id,fixed.question.version_id)
      assert.equal(postCorrection.question_versions.find(row=>row.id===fixed.question.version_id).citation_id,oldCitation.id)
      assert.deepEqual(postCorrection.question_versions.find(row=>row.id===shared.version_id),before.question_versions.find(row=>row.id===shared.version_id))
      for(const table of ['practice_attempts','practice_attempt_receipts','practice_disputes','personal_question_states','users']) {
        assert.deepEqual(postCorrection[table],before[table])
      }
      assert.deepEqual(correct(),{...fixed,replayed:true})
      assert.throws(()=>storage.practice.correct(author,correctionKey,shared.id,{...patch,reason:'换参数重放'}),{code:'IDEMPOTENCY_CONFLICT'})
      assert.throws(()=>storage.practice.correct(author,randomUUID(),shared.id,patch),{code:'QUESTION_VERSION_CHANGED'})
      assert.deepEqual(state(),postCorrection)
      assert.equal(storage.practice.dispute(first,reportKey,players[0].session.id,shared.version_id,reportReason).dispute.status,'resolved')
      assert.deepEqual([own(first).original_grading,own(first).effective_grading,own(first).classification],['incorrect','correct','independent_correct'])
      assert.deepEqual([own(second).original_grading,own(second).effective_grading,own(second).classification],['correct','incorrect','wrong'])
      assert.equal(own(first).state.wrong_reason,wrongInput.wrong_reason)
      assert.equal(own(second).state.wrong_reason,'')
      assert.equal(storage.practice.authored(author,shared.id).feedback.accepted_answer,false)
      for(const {actor,session,input,key,stored} of players) {
        const replay=storage.practice.submit(actor,key,session.id,input)
        assert.equal(replay.replayed,true)
        assert.equal(replay.attempt.id,stored.attempt.id)
        assert.equal(replay.attempt.answer,stored.attempt.answer)
        assert.equal(replay.attempt.grading_state,stored.attempt.grading_state)
        assert.equal(replay.feedback.accepted_answer,true)
      }
      assert.deepEqual(state(),postCorrection)
      pass('atomic_author_correction_flips_private_effective_grades_without_mutation','Only the author corrected the rubric. Matching key replay was inert, stale and modified requests failed. Two effective grades flipped in opposite directions while old answers, old feedback, private reason and user profiles remained exact.')
    } finally { storage.close() }

    const reopened = new fresh.ProbeStorage({dataDir:dir})
    const identity = new fresh.IdentityService(reopened)
    try{
      assert(reopened.available,failureChain(reopened.failure))
      assert.deepEqual(state(),postCorrection)
      assert.deepEqual(read(ledger),upgradedLedger)
      const {author,first,second,shared,profiles}=fixture
      assert.deepEqual([author,first,second].map(actor=>identity.profile(actor.userId)),profiles)
      assert.deepEqual([first,second].map(actor=>reopened.practice.review(actor).items.find(item=>item.question.id===shared.id).effective_grading),['correct','incorrect'])
      assert.equal(reopened.practice.review(author).items.length,0)
    } finally { await identity.close(); reopened.close() }
    pass('reopen_rehydrates_only_personal_corrected_summary','After restart the regraded classifications remained available to their respective learners; author had no private answer listing and profile data was unchanged.')
    proof.status='PASS'
    proof.exit_code=0
  } catch(error) {
    proof.failure=failureChain(error).slice(0,800)
    process.exitCode=1
  } finally {
    const output=join(dir,'summary.json')
    writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'})
    console.log(JSON.stringify({status:proof.status,checks:proof.results.length,proof:output}))
  }
}

await main()
