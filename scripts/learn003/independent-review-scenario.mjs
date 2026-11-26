const study = [
  { prompt:'LEARN003 Shared first answer', options:['LEARN003 old value','LEARN003 new value'], explanation:'LEARN003 ORIGINAL_RUBRIC' },
  { prompt:'LEARN003 Confidently separate uncertainty', options:['LEARN003 reference','LEARN003 distractor'], explanation:'LEARN003 UNCERTAIN_RUBRIC' },
  { prompt:'LEARN003 First answer after a hint', options:['LEARN003 supported','LEARN003 unsupported'], explanation:'LEARN003 ASSISTED_RUBRIC' },
  { prompt:'LEARN003 Protected answer before first submit', options:['LEARN003 baseline','LEARN003 other'], explanation:'LEARN003 REVEAL_RUBRIC' },
]
const correctedExplanation='LEARN003 CORRECTED_RUBRIC with independently rechecked evidence'
const correctionReason='LEARN003 CORRECTION_REASON standards switched after the source was reviewed'
const wrongReason='LEARN003 PRIVATE_REASON_A retained first-answer explanation'
const disputeReason='LEARN003 PRIVATE_DISPUTE_A independent counterexample'
const privateMarkers=[wrongReason,disputeReason]
const baselineTables=['questions','question_versions','practice_sessions','practice_session_questions','practice_attempts','practice_attempt_receipts']
const reviewTables=/^(?:personal_question_(?:states|receipts)|question_(?:disput|correct|state|regrad)|practice_(?:hint|assist|reveal|disput|learn|assess|regrad|attempt_regrad)|learning_assess)/

export async function run(h) {
  const { assert, base, prefix, owner, learnerA:A, learnerB:B, outsider:X, project, evidence, sourceGrantA, step, pass,
    request, wire, idempotency, readRows, capture, login, boot, stopHost }=h
  const bank=prefix+'/questions', api=prefix+'/practice-sessions', wrong=prefix+'/me/wrong-questions', profile=prefix+'/me'
  const web='/knowledgeos/practice', personal='/knowledgeos/review'
  const reviewRoute=session=>api+'/'+session.id+'/questions'
  const actionRoute=(session,action)=>api+'/'+session.id+'/'+action
  const stateRoute=question=>prefix+'/me/question-states/'+question.id
  const authorRoute=question=>bank+'/'+question.id+'/author'
  const correctionRoute=question=>bank+'/'+question.id+'/corrections'
  const auth=(actor,replay=idempotency())=>({'x-knowledgeos-reader-actor':actor.id,...replay})
  const write=(actor,path,method,body,replay)=>wire(actor,path,method,body,auth(actor,replay))
  const successful=async(actor,path,method,body,status=201,replay)=>request(actor,path,method,body,{status,headers:auth(actor,replay)})
  const snapshot=()=>Object.fromEntries(readRows("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").map(row=>row.name)
    .filter(name=>baselineTables.includes(name)||reviewTables.test(name)).map(name=>[name,readRows('SELECT * FROM '+name+' ORDER BY rowid')]))
  const rawAttempt=id=>readRows('SELECT * FROM practice_attempts WHERE id=?',id)[0]
  const rawVersion=id=>readRows('SELECT * FROM question_versions WHERE id=?',id)[0]
  const userRow=actor=>readRows('SELECT * FROM users WHERE id=?',actor.id)[0]
  function hidden(text,markers=privateMarkers){
    for(const marker of markers)assert(!text.includes(marker),'private review data appeared in a denied or cross-user view')
  }
  function denied(value,expected=[401,403,404]){
    assert(expected.includes(value.status),'expected protected response, received '+value.status+' '+value.payload?.code)
    assert.equal(value.payload?.data,undefined)
    hidden(value.raw)
  }
  function item(data,question){return data.items.find(row=>row.question.id===question.id)}
  async function personalData(actor) {
    const result=await wire(actor,wrong)
    assert.equal(result.status,200)
    assert.match(result.cache??'',/no-store/i)
    return result.payload.data
  }
  async function chromeWrite(actor,path,selector,status=201,method='POST'){
    const [response]=await Promise.all([
      actor.page.waitForResponse(value=>value.url()===base+path&&value.request().method()===method),
      actor.page.locator(selector).click(),
    ])
    const payload=await response.json()
    assert([status].flat().includes(response.status()),path+' '+(payload?.code??response.status()))
    return {data:payload.data,body:response.request().postDataJSON(),key:response.request().headers()['idempotency-key']}
  }
  async function open(actor,session,question){
    const page=actor.page
    await page.bringToFront()
    await page.goto(base+web+'?'+new URLSearchParams({session:session.id}))
    await page.locator('#practice-session-questions [data-question-version="'+question.version_id+'"]').click()
    await page.locator('#practice-answer').waitFor()
    return page
  }
  async function attemptInBrowser(actor,session,answer,confidence='sure'){
    await actor.page.locator('#practice-answer').selectOption(String(answer))
    await actor.page.locator('#practice-confidence').selectOption(confidence)
    const result=await chromeWrite(actor,actionRoute(session,'attempts'),'#practice-submit')
    await actor.page.locator('#practice-feedback').waitFor()
    assert(rawAttempt(result.data.attempt.id),'attempt acknowledgment before durable row')
    return result
  }
  async function explicitProfile(actor,domains,learning_tracks,goal_text){
    const prior=await request(actor,profile)
    await request(actor,profile+'/preferences','PATCH',{expected_revision:prior.revision,domains,learning_tracks,goal_text})
    const current=await request(actor,profile)
    assert.deepEqual([current.domains,current.learning_tracks,current.goal_text],[domains,learning_tracks,goal_text])
    assert.equal(current.revision,prior.revision+1)
    return { dto:current,row:userRow(actor) }
  }
  async function verifyProfile(actor,original){
    assert.deepEqual(await request(actor,profile),original.dto)
    assert.deepEqual(userRow(actor),original.row)
  }

  step('actual distinct account preferences and four source-bound project revisions')
  const prefA=await explicitProfile(A,['software_engineering'],['engineering_practice'],'LEARN003 A keeps an engineering goal')
  const prefB=await explicitProfile(B,['system_architecture'],['architecture_exam'],'LEARN003 B keeps an architecture goal')
  const questions=[]
  for(const spec of study){
    const created=await successful(owner,bank,'POST',{kind:'choice',...spec,answer:1,project_id:project.id,source_citation_id:evidence.citation.id})
    questions.push(created.question)
  }
  const [shared,uncertain,hinted,reveal]=questions
  const {session:a}=await successful(A,api,'POST',{question_version_ids:questions.map(question=>question.version_id)})
  const {session:b}=await successful(B,api,'POST',{question_version_ids:[shared.version_id]})
  assert.notEqual(a.id,b.id)
  denied(await wire(X,reviewRoute(a)))
  denied(await wire(B,reviewRoute(a)))
  denied(await wire(owner,reviewRoute(a)))
  const beforeChoice=await request(A,reviewRoute(a))
  assert(beforeChoice.questions.every(question=>question.feedback===null&&question.attempts.length===0))

  step('two actual learners wrong and correct on the same original version')
  const pageA=await open(A,a,shared)
  assert(!(await pageA.content()).includes(study[0].explanation))
  const {data:wrongA}=await attemptInBrowser(A,a,2)
  assert.equal(wrongA.attempt.grading_state,'incorrect')
  assert.equal(wrongA.attempt.sequence,1)
  assert.equal(wrongA.feedback.explanation,study[0].explanation)
  const pageB=await open(B,b,shared)
  assert(!(await pageB.content()).includes(study[0].explanation))
  const {data:correctB}=await attemptInBrowser(B,b,1)
  assert.equal(correctB.attempt.grading_state,'correct')
  assert.equal(correctB.attempt.sequence,1)
  const oldRows=[rawAttempt(wrongA.attempt.id),rawAttempt(correctB.attempt.id)]
  const oldVersion=rawVersion(shared.version_id)
  assert.equal(oldRows[0].user_id,A.id)
  assert.equal(oldRows[1].user_id,B.id)
  assert.deepEqual(oldRows.map(value=>value.question_version_id),[shared.version_id,shared.version_id])
  const beforeA=await personalData(A),beforeB=await personalData(B)
  assert.equal(item(beforeA,shared)?.classification,'wrong')
  assert.notEqual(item(beforeB,shared)?.classification,'wrong')
  assert.equal(item(beforeA,shared).attempt.id,wrongA.attempt.id)
  if(item(beforeB,shared))assert.equal(item(beforeB,shared).attempt.id,correctB.attempt.id)
  await A.page.goto(base+personal)
  await A.page.getByText(study[0].prompt,{exact:false}).first().waitFor()
  await capture(A.page,'personal-wrong-before-correction')
  pass('isolated_original_first_answers',{version:shared.version_id,wrong_owner_distinct:true,author_cannot_read_attempt:true})

  step('personal reasons, future review and own scope')
  const ownerState=item(beforeA,shared).state
  assert(Number.isSafeInteger(ownerState.revision))
  const nextReview=new Date((Math.floor(Date.now()/60_000)+60)*60_000).toISOString()
  const dateLocal=await A.page.evaluate(value=>{
    const date=new Date(value)
    return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)
  },nextReview)
  const edit={expected_revision:ownerState.revision,wrong_reason:wrongReason,mastery_state:'reviewing',next_review_at:nextReview}
  await A.page.locator('#review-questions [data-question-id="'+shared.id+'"]').click()
  await A.page.locator('#review-reason').fill(wrongReason)
  await A.page.locator('#review-mastery').selectOption('reviewing')
  await A.page.locator('#review-date').fill(dateLocal)
  const saveReason=await chromeWrite(A,stateRoute(shared),'#review-save',200,'PATCH')
  assert.deepEqual(saveReason.body,edit)
  const reasonKey={'idempotency-key':saveReason.key}
  const updated=saveReason.data
  assert.equal(updated.state.wrong_reason,wrongReason)
  assert.equal(updated.state.next_review_at,nextReview)
  const replay=await successful(A,stateRoute(shared),'PATCH',edit,200,reasonKey)
  assert.equal(replay.state.revision,updated.state.revision)
  const stateAfter=snapshot()
  denied(await write(A,stateRoute(shared),'PATCH',{...edit,wrong_reason:wrongReason+' changed'},reasonKey),[409])
  denied(await write(X,stateRoute(shared),'PATCH',edit),[404])
  denied(await write(B,stateRoute(shared),'PATCH',{...edit,user_id:A.id}),[422])
  hidden((await wire(B,wrong)).raw)
  hidden((await wire(owner,wrong)).raw)
  assert.deepEqual(snapshot(),stateAfter)
  const planned=await personalData(A)
  assert.equal(item(planned,shared).state.wrong_reason,wrongReason)
  assert(planned.review_queue.some(row=>row.question_id===shared.id&&row.next_review_at===nextReview))
  assert(!(await personalData(B)).review_queue.some(row=>row.question_id===shared.id))
  await A.page.locator('#review-queue [data-question-id="'+shared.id+'"]').waitFor()
  await capture(A.page,'personal-reason-and-next-review')

  step('uncertainty, durable hint, and forbidden early reveal are distinct')
  await open(A,a,uncertain)
  const {data:answerUnsure}=await attemptInBrowser(A,a,1,'unsure')
  assert.equal(answerUnsure.attempt.grading_state,'correct')
  assert.equal(answerUnsure.attempt.confidence,'unsure')
  assert.equal(answerUnsure.attempt.evaluation_eligible,false)
  await open(A,a,hinted)
  assert(!(await A.page.content()).includes(study[2].explanation))
  const priorHint=snapshot()
  const jumped=await write(A,actionRoute(a,'hints'),'POST',{question_version_id:hinted.version_id,level:2})
  assert.deepEqual([jumped.status,jumped.payload.code],[409,'HINT_LEVEL_CONFLICT'])
  assert.deepEqual(snapshot(),priorHint)
  const hint=await chromeWrite(A,actionRoute(a,'hints'),'#practice-hint',[200,201])
  assert(hint.data.hint.text)
  assert.equal(hint.data.hint.level,1)
  assert(!JSON.stringify(hint.data).includes(study[2].explanation))
  assert(!Object.hasOwn(hint.data.hint,'accepted_answer'))
  await A.page.locator('#practice-hint-text').filter({hasText:hint.data.hint.text}).waitFor()
  const beforeHintReplays=snapshot()
  const hintReplay=await write(A,actionRoute(a,'hints'),'POST',hint.body,{'idempotency-key':hint.key})
  assert.equal(hintReplay.status,200)
  assert.deepEqual(snapshot(),beforeHintReplays)
  denied(await write(B,actionRoute(a,'hints'),'POST',hint.body),[404])
  const deeper=await chromeWrite(A,actionRoute(a,'hints'),'#practice-hint',201)
  assert.equal(deeper.data.hint.level,2)
  assert(!JSON.stringify(deeper.data).includes(study[2].explanation))
  assert.deepEqual(readRows('SELECT level FROM practice_hint_events WHERE session_id=? AND question_version_id=? ORDER BY level',a.id,hinted.version_id),[{level:1},{level:2}])
  const {data:answerHint}=await attemptInBrowser(A,a,1,'sure')
  assert.equal(answerHint.attempt.grading_state,'correct')
  assert.equal(answerHint.attempt.independent,false)
  assert.equal(answerHint.attempt.evaluation_eligible,false)
  await open(A,a,reveal)
  const beforeReveal=snapshot()
  const prohibited=await write(A,actionRoute(a,'reveal'),'POST',{question_version_id:reveal.version_id})
  denied(prohibited,[403,404,409,422])
  hidden(prohibited.raw,[study[3].explanation])
  const noDisputeBeforeAnswer=await write(A,actionRoute(a,'disputes'),'POST',{question_version_id:reveal.version_id,reason:'No first answer yet'})
  denied(noDisputeBeforeAnswer,[409])
  assert.equal(noDisputeBeforeAnswer.payload.code,'FIRST_ANSWER_REQUIRED')
  assert.deepEqual(snapshot(),beforeReveal)
  assert.equal((await request(A,reviewRoute(a))).questions.find(q=>q.id===reveal.id).feedback,null)
  const split=await personalData(A)
  assert.equal(item(split,shared).classification,'wrong')
  assert.equal(item(split,uncertain).classification,'uncertain')
  assert.equal(item(split,hinted).classification,'assisted')
  assert.equal(item(split,hinted).evaluation_eligible,false)
  const unsureTime=new Date(Date.now()+7200_000).toISOString()
  await successful(A,stateRoute(uncertain),'PATCH',{
    expected_revision:item(split,uncertain).state.revision,mastery_state:'reviewing',next_review_at:unsureTime,
  },200)
  await verifyProfile(A,prefA)
  await verifyProfile(B,prefB)

  step('learner reports disputed source, separate plan and pre-correction suspension')
  await open(A,a,shared)
  await A.page.locator('#practice-dispute-reason').fill(disputeReason)
  const raised=await chromeWrite(A,actionRoute(a,'disputes'),'#practice-dispute',[200,201])
  assert.equal(raised.data.dispute.status,'open')
  assert.equal(raised.data.dispute.question_version_id,shared.version_id)
  await A.page.locator('#practice-evaluation').filter({hasText:'当前评价暂停'}).waitFor()
  const pausedA=item(await personalData(A),shared),pausedB=item(await personalData(B),shared)
  assert.equal(pausedA.classification,'disputed')
  assert.equal(pausedA.evaluation_status,'paused')
  assert.equal(pausedA.evaluation_eligible,false)
  assert.equal(pausedB.evaluation_status,'paused')
  assert.equal(pausedB.evaluation_eligible,false)
  hidden((await wire(B,wrong)).raw)
  const pauseSnapshot=snapshot()
  const pendingAgain=await successful(A,actionRoute(a,'disputes'),'POST',raised.body,200,{'idempotency-key':raised.key})
  assert.deepEqual(pendingAgain.dispute,raised.data.dispute)
  denied(await write(A,actionRoute(a,'disputes'),'POST',{...raised.body,reason:disputeReason+' changed'},{'idempotency-key':raised.key}),[409])
  denied(await write(A,correctionRoute(shared),'POST',{expected_version:shared.version,answer:2,explanation:correctedExplanation,reason:correctionReason}),[404])
  denied(await write(owner,correctionRoute(shared),'POST',{expected_version:shared.version,answer:2,explanation:correctedExplanation,reason:correctionReason,decision:'unknown'}),[422])
  assert.deepEqual(snapshot(),pauseSnapshot)
  await A.page.goto(base+personal)
  await A.page.locator('#review-questions [data-question-id="'+shared.id+'"][data-classification="disputed"]').waitFor()
  const nextAction=A.page.locator('#review-queue [data-question-id="'+uncertain.id+'"]')
  await nextAction.waitFor()
  assert.equal(new URL(await nextAction.getAttribute('href'),base).searchParams.get('session'),a.id)
  assert.equal(await A.page.locator('#review-queue [data-question-id="'+shared.id+'"]').count(),0)
  assert.equal(await A.page.locator('#review-goal').textContent(),prefA.dto.goal_text)
  await capture(A.page,'personal-disputes-and-follow-up')
  const queue=(await personalData(A)).review_queue
  assert(queue.some(row=>row.question_id===uncertain.id&&row.next_review_at===unsureTime))
  assert(!queue.some(row=>row.question_id===shared.id))
  assert(!(await personalData(B)).review_queue.some(row=>row.question_id===uncertain.id))
  await verifyProfile(A,prefA)
  await verifyProfile(B,prefB)
  pass('T02',{ wrong_uncertain_assisted_disputed_distinct:true,unknown_decision_rejected:true,own_followup_queue:true,directions_and_goals_same:true })

  step('author correction appends v2 and recomputes both private outcomes')
  const correction={expected_version:shared.version,answer:2,explanation:correctedExplanation,reason:correctionReason}
  await owner.page.goto(base+personal)
  await owner.page.locator('#review-author summary').click()
  await owner.page.locator('#review-author-question').selectOption(shared.id)
  await owner.page.locator('#review-correction').waitFor()
  hidden(await owner.page.content())
  await owner.page.locator('#review-answer').fill('2')
  await owner.page.locator('#review-explanation').fill(correctedExplanation)
  await owner.page.locator('#review-correction-reason').fill(correctionReason)
  const corrected=await chromeWrite(owner,correctionRoute(shared),'#review-correct')
  assert.deepEqual(corrected.body,correction)
  const correctKey={'idempotency-key':corrected.key}
  const changed=corrected.data
  assert.equal(changed.question.id,shared.id)
  assert.equal(changed.question.version,shared.version+1)
  assert.notEqual(changed.question.version_id,shared.version_id)
  assert.deepEqual(rawVersion(shared.version_id),oldVersion)
  assert.deepEqual([rawAttempt(wrongA.attempt.id),rawAttempt(correctB.attempt.id)],oldRows)
  hidden(JSON.stringify(changed),[...privateMarkers,A.id,B.id,wrongA.attempt.id,correctB.attempt.id])
  const recalculated=readRows('SELECT attempt_id,corrected_version_id,grading_state FROM practice_attempt_regrades WHERE corrected_version_id=? ORDER BY attempt_id',changed.question.version_id)
  assert.equal(recalculated.length,2)
  assert.equal(recalculated.find(row=>row.attempt_id===wrongA.attempt.id).grading_state,'correct')
  assert.equal(recalculated.find(row=>row.attempt_id===correctB.attempt.id).grading_state,'incorrect')
  const afterA=item(await personalData(A),shared),afterB=item(await personalData(B),shared)
  assert.equal(afterA.original_grading,'incorrect')
  assert.equal(afterA.effective_grading,'correct')
  assert.equal(afterB.original_grading,'correct')
  assert.equal(afterB.effective_grading,'incorrect')
  assert.equal(afterA.evaluation_status,'corrected')
  assert.equal(afterB.evaluation_status,'corrected')
  assert.equal(afterA.state.wrong_reason,wrongReason)
  assert.notEqual(afterB.state.wrong_reason,wrongReason)
  const afterCorrection=snapshot()
  const repeated=await successful(owner,correctionRoute(shared),'POST',correction,200,correctKey)
  assert.equal(repeated.question.version_id,changed.question.version_id)
  const pastDispute=await successful(A,actionRoute(a,'disputes'),'POST',raised.body,200,{'idempotency-key':raised.key})
  assert.equal(pastDispute.dispute.id,raised.data.dispute.id)
  assert.equal(pastDispute.dispute.status,'resolved')
  denied(await write(owner,correctionRoute(shared),'POST',{...correction,answer:1},correctKey),[409])
  denied(await write(owner,correctionRoute(shared),'POST',correction),[409])
  assert.deepEqual(snapshot(),afterCorrection)
  const orig=await request(A,reviewRoute(a))
  const savedV1=orig.questions.find(question=>question.id===shared.id)
  assert.equal(savedV1.version_id,shared.version_id)
  assert.equal(savedV1.feedback.explanation,study[0].explanation)
  const author=await request(owner,authorRoute(shared))
  assert.equal(author.question.version_id,changed.question.version_id)
  assert.equal(author.feedback.explanation,correctedExplanation)
  hidden((await wire(owner,authorRoute(shared))).raw)
  hidden((await wire(B,wrong)).raw)
  await A.page.goto(base+personal)
  await A.page.locator('#review-questions [data-question-id="'+shared.id+'"]').click()
  await A.page.locator('#review-effective').filter({hasText:'修订后判定：正确'}).waitFor()
  await A.page.locator('#review-first').filter({hasText:'首答原判：错误'}).waitFor()
  assert.equal(await A.page.locator('#review-reason').inputValue(),wrongReason)
  await capture(A.page,'personal-corrected-original-retained')
  await A.page.locator('#review-filter').selectOption('wrong')
  assert.equal(await A.page.locator('#review-questions [data-question-id="'+shared.id+'"]').count(),0)
  await B.page.goto(base+personal)
  await B.page.locator('#review-workspace').waitFor()
  await B.page.locator('#review-filter').selectOption('wrong')
  await B.page.locator('#review-questions [data-question-id="'+shared.id+'"]').waitFor()
  await verifyProfile(A,prefA)
  await verifyProfile(B,prefB)
  pass('T01',{ authored_version_advanced:true, first_attempts_immutable:true,personal_two_way_recalculation:true,exact_replay_one_version:true })

  step('both fresh sessions read the immutable revision and recomputation after restart')
  await stopHost()
  await boot()
  const freshA=await login(A.name),freshB=await login(B.name)
  assert.deepEqual(snapshot(),afterCorrection)
  assert.equal(item(await personalData(freshA),shared).effective_grading,'correct')
  assert.equal(item(await personalData(freshB),shared).effective_grading,'incorrect')
  await verifyProfile(freshA,prefA)
  await verifyProfile(freshB,prefB)
  await freshB.page.goto(base+personal)
  await freshB.page.getByText(study[0].prompt,{exact:false}).first().waitFor()
  await capture(freshB.page,'peer-recalculation-after-restart')
  pass('durable_current_and_historical_outcomes',{restarted:true, private_results_separate:true})

  step('source and project membership withdraw independently without changing stored learning history')
  await freshA.page.bringToFront()
  await freshA.page.goto(base+personal)
  await freshA.page.getByText(study[0].prompt,{exact:false}).first().waitFor()
  const grantPath=prefix+'/invitations/'+sourceGrantA.id
  const grant=await request(owner,grantPath)
  await request(owner,grantPath+'/revoke','POST',{actor_id:owner.id,expected_revision:grant.revision},{headers:idempotency()})
  await freshA.page.getByText(study[0].prompt,{exact:false}).first().waitFor({state:'hidden'})
  hidden(await freshA.page.content())
  denied(await wire(freshA,reviewRoute(a)),[404])
  assert.equal((await wire(freshA,prefix+'/project-tasks/projects/'+project.id+'/members')).status,200)
  assert(!item(await personalData(freshA),shared))
  assert.equal(item(await personalData(freshB),shared).effective_grading,'incorrect')
  await capture(freshA.page,'personal-review-source-revoked')
  await freshB.page.bringToFront()
  await request(owner,prefix+'/project-tasks/projects/'+project.id+'/members','POST',{actor_id:owner.id,remove_member_id:freshB.id})
  await freshB.page.getByText(study[0].prompt,{exact:false}).first().waitFor({state:'hidden'})
  hidden(await freshB.page.content())
  denied(await wire(freshB,reviewRoute(b)),[404])
  assert.equal((await wire(freshB,prefix+'/citations/'+evidence.citation.id+'/resolve')).status,200)
  assert(!item(await personalData(freshB),shared))
  assert.deepEqual(snapshot(),afterCorrection)
  await verifyProfile(freshA,prefA)
  await verifyProfile(freshB,prefB)
  pass('current_acl_gates_review_history_and_foreground',{source_loss:true,project_loss:true,historical_rows_retained:true})
}
