const primaryDraft = {
  kind:'choice', difficulty:'intermediate',prompt:'LEARN005 initial practice',options:['Candidate one','Candidate two','Candidate three'],
  answer:1,explanation:'LEARN005 ORIGINAL_EXPLANATION applies to the first fixed document.',
}
const transferDraft = {
  kind:'choice',difficulty:'intermediate',prompt:'LEARN005 distinct delayed transfer',options:['Transfer alpha','Transfer beta','Transfer gamma'],
  answer:2,explanation:'LEARN005 TRANSFER_EXPLANATION applies to the separate document.',
}
const decoyDraft = { ...transferDraft,difficulty:'advanced',prompt:'LEARN005 wrong difficulty distractor' }
const foreignKind = { kind:'judgment',difficulty:'intermediate',prompt:'LEARN005 wrong form distractor',answer:true,
  explanation:'LEARN005 OTHER_FORM_EXPLANATION' }
const web='/knowledgeos/practice'
const learnerProofNames=/^(?:questions|question_versions|personal_question_states|practice_|transfer_|learning_assess)/
const day=24*60*60*1000

export async function run(h) {
  const { assert, base, prefix, owner, learnerA:A, learnerB:B, outsider:X, project, evidence, step, pass,
    request, wire, idempotency, readRows, capture, login, boot, stopHost, source, shareSource, clock, now }=h
  const bank=prefix+'/questions',api=prefix+'/practice-sessions',transfer=prefix+'/me/transfer-practice'
  const profile=prefix+'/me',transferPage='/knowledgeos/transfer'
  const auth=(actor,replay=idempotency())=>({'x-knowledgeos-reader-actor':actor.id,...replay})
  const action=(session,kind)=>api+'/'+session.id+'/'+kind
  const versions=session=>action(session,'questions')
  const start=id=>transfer+'/'+id+'/start'
  const write=(actor,path,data,replay)=>wire(actor,path,'POST',data,auth(actor,replay))
  const save=(actor,path,data,status=201,replay)=>request(actor,path,'POST',data,{status,headers:auth(actor,replay)})
  const rawAttempt=id=>readRows('SELECT * FROM practice_attempts WHERE id=?',id)[0]
  const snapshot=()=>Object.fromEntries(readRows("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
    .map(row=>row.name).filter(name=>learnerProofNames.test(name)).map(name=>[name,readRows('SELECT * FROM '+name+' ORDER BY rowid')]))
  const me=actor=>request(actor,profile)
  function hide(text,markers=[primaryDraft.explanation,transferDraft.explanation]){
    for(const marker of markers)assert(!text.includes(marker),'protected practice data appeared in an ineligible response')
  }
  function deny(result,statuses){
    assert(statuses.includes(result.status),'protected route returned '+result.status+' '+result.payload?.code)
    assert.equal(result.payload?.data,undefined)
    hide(result.raw)
  }
  async function list(actor){
    const result=await wire(actor,transfer)
    assert.equal(result.status,200)
    assert.match(result.cache??'',/no-store/i)
    return result.payload.data.items
  }
  async function plan(actor,id){
    const selected=(await list(actor)).find(item=>item.id===id)
    assert(selected,'expected own transfer plan')
    return selected
  }
  function noAbility(dto){
    for(const key of ['ability_grade','ability_level','mastery_level','ability_score','conclusion','rating'])assert(!Object.hasOwn(dto,key))
  }
  async function chromeWrite(actor,path,selector,status=201){
    const [response]=await Promise.all([
      actor.page.waitForResponse(value=>value.url()===base+path&&value.request().method()==='POST'),
      actor.page.locator(selector).click(),
    ])
    const value=await response.json()
    assert([status].flat().includes(response.status()),path+' '+(value.code??response.status()))
    return { data:value.data,key:response.request().headers()['idempotency-key'],input:response.request().postDataJSON(),status:response.status() }
  }
  async function openPractice(actor,session,question){
    await actor.page.bringToFront()
    await actor.page.goto(base+web+'?'+new URLSearchParams({session:session.id}))
    await actor.page.locator('#practice-session-questions [data-question-version="'+question.version_id+'"]').click()
    await actor.page.locator('#practice-answer').waitFor()
  }
  async function answer(actor,session,option){
    await actor.page.locator('#practice-answer').selectOption(String(option))
    await actor.page.locator('#practice-confidence').selectOption('sure')
    const result=await chromeWrite(actor,action(session,'attempts'),'#practice-submit')
    assert(rawAttempt(result.data.attempt.id),'successful response has no durable attempt')
    return result
  }
  async function makeQuestion(draft,citation){
    return (await save(owner,bank,{...draft,project_id:project.id,source_citation_id:citation.id})).question
  }

  step('distinct current Reader anchors, independent learners and equal difficulty')
  const targetEvidence=await source(owner,'LEARN005_SEPARATE_TRANSFER_SOURCE')
  const targetGrant=await shareSource(owner,[A],targetEvidence.asset)
  await shareSource(owner,[B],targetEvidence.asset)
  assert.notEqual(targetEvidence.citation.id,evidence.citation.id)
  assert.notEqual(targetEvidence.citation.quote_hash,evidence.citation.quote_hash)
  assert.notEqual(targetEvidence.asset.version_id,evidence.asset.version_id)
  const [primary,target,mismatchBand,mismatchKind,sameAnchor]=[
    await makeQuestion(primaryDraft,evidence.citation),await makeQuestion(transferDraft,targetEvidence.citation),
    await makeQuestion(decoyDraft,targetEvidence.citation),await makeQuestion(foreignKind,targetEvidence.citation),
    await makeQuestion({...transferDraft,prompt:'LEARN005 same anchor distractor'},evidence.citation),
  ]
  assert.deepEqual([primary.kind,primary.difficulty],[target.kind,target.difficulty])
  assert.equal(primary.difficulty,'intermediate')
  const origProfile=await me(A),otherProfile=await me(B)
  assert.equal((await wire(X,prefix+'/citations/'+targetEvidence.citation.id+'/resolve')).status,404)
  assert.deepEqual(await list(B),[])
  assert.deepEqual(await list(X),[])

  step('native guided session first unaided wrong remains earliest committed answer')
  await A.page.bringToFront()
  await A.page.goto(base+web)
  await A.page.locator('#practice-questions [data-question-version="'+primary.version_id+'"]').click()
  const guided=(await chromeWrite(A,api,'#practice-start-guided')).data.session
  assert.equal(guided.mode,'guided')
  await A.page.locator('#practice-answer').waitFor()
  hide(await A.page.content())
  deny(await wire(B,versions(guided)),[404])
  const beforeEarly=snapshot()
  deny(await write(A,action(guided,'reveal'),{question_version_id:primary.version_id}),[403,404,409,422])
  assert.deepEqual(snapshot(),beforeEarly)
  const initial=await answer(A,guided,2)
  assert.deepEqual([initial.data.attempt.sequence,initial.data.attempt.grading_state,initial.data.attempt.independent],[1,'incorrect',true])
  assert.equal(initial.data.feedback,null)
  const original=rawAttempt(initial.data.attempt.id)
  assert.equal(original.user_id,A.id)
  assert.equal(original.question_version_id,primary.version_id)
  assert.equal(original.submitted_at,new Date(now()).toISOString())
  await A.page.locator('#practice-attempts').getByText(/首次作答/).waitFor()
  await A.page.locator('#practice-feedback').waitFor({state:'hidden'})
  hide(await A.page.content())
  await capture(A.page,'initial-independent-wrong-without-disclosure')

  step('two persisted post-first levels feed only the guided retry')
  const priorHints=snapshot()
  deny(await write(A,action(guided,'hints'),{question_version_id:primary.version_id,level:2}),[409])
  assert.deepEqual(snapshot(),priorHints)
  await clock(now()+1)
  const hint1=await chromeWrite(A,action(guided,'hints'),'#practice-hint')
  assert.equal(hint1.data.hint.level,1)
  assert.equal(hint1.data.hint.for_sequence,2)
  hide(JSON.stringify(hint1.data))
  await A.page.locator('#practice-hint-text').filter({hasText:hint1.data.hint.text}).waitFor()
  await clock(now()+1)
  const hint2=await chromeWrite(A,action(guided,'hints'),'#practice-hint')
  assert.equal(hint2.data.hint.level,2)
  assert.equal(hint2.data.hint.for_sequence,2)
  hide(JSON.stringify(hint2.data))
  await A.page.locator('#practice-hint-text').filter({hasText:hint2.data.hint.text}).waitFor()
  const afterHints=snapshot()
  const replay=await save(A,action(guided,'hints'),hint1.input,200,{'idempotency-key':hint1.key})
  assert.deepEqual(replay.hint,hint1.data.hint)
  deny(await write(A,action(guided,'hints'),{...hint1.input,level:2},{'idempotency-key':hint1.key}),[409])
  assert.deepEqual(snapshot(),afterHints)
  assert.deepEqual(rawAttempt(initial.data.attempt.id),original)
  assert.deepEqual(readRows('SELECT level,for_sequence FROM practice_hint_events WHERE session_id=? AND question_version_id=? ORDER BY level',guided.id,primary.version_id),
    [{level:1,for_sequence:2},{level:2,for_sequence:2}])
  await capture(A.page,'two-hint-levels-after-first-attempt')
  await clock(now()+1)
  const guidedRetry=await answer(A,guided,1)
  assert.deepEqual([guidedRetry.data.attempt.sequence,guidedRetry.data.attempt.grading_state,guidedRetry.data.attempt.independent],[2,'correct',false])
  assert.equal(guidedRetry.data.attempt.evaluation_eligible,false)
  assert.equal(guidedRetry.data.feedback.explanation,primaryDraft.explanation)
  assert.equal(guidedRetry.data.feedback.evidence.id,evidence.citation.id)
  await A.page.locator('#practice-feedback').filter({hasText:primaryDraft.explanation}).waitFor()
  assert.deepEqual(rawAttempt(initial.data.attempt.id),original)
  const replayInitial=await save(A,action(guided,'attempts'),initial.input,200,{'idempotency-key':initial.key})
  assert.equal(replayInitial.attempt.id,initial.data.attempt.id)
  assert.equal(replayInitial.feedback,null)
  const retryRow=rawAttempt(guidedRetry.data.attempt.id)
  await capture(A.page,'guided-retry-separate-after-first')

  step('future matched transfer schedule and caller authority')
  const due=Math.ceil((now()+day)/60_000)*60_000,available_at=new Date(due).toISOString()
  const reserve={primary_session_id:guided.id,target_version_id:target.version_id,available_at}
  const initialPlanRows=snapshot()
  for(const question of [primary,mismatchBand,mismatchKind,sameAnchor]){
    deny(await write(A,transfer,{...reserve,target_version_id:question.version_id}),[409,422])
  }
  deny(await write(B,transfer,reserve),[404])
  deny(await write(A,transfer,{...reserve,available_at:new Date(now()).toISOString()}),[409,422])
  deny(await write(A,transfer,{...reserve,evaluation_eligible:true}),[422])
  assert.deepEqual(snapshot(),initialPlanRows)
  const controlSession=(await save(B,api,{question_version_ids:[primary.version_id],mode:'guided'})).session
  const controlFirst=await save(B,action(controlSession,'attempts'),{question_version_id:primary.version_id,expected_sequence:0,answer:2,confidence:'sure'})
  assert.equal(controlFirst.feedback,null)
  const revealed=await save(B,action(controlSession,'reveal'),{question_version_id:primary.version_id})
  assert.equal(revealed.feedback.explanation,primaryDraft.explanation)
  await save(B,action(controlSession,'hints'),{question_version_id:primary.version_id,level:1})
  await save(B,action(controlSession,'attempts'),{question_version_id:primary.version_id,expected_sequence:1,answer:1,confidence:'sure'})
  const afterControl=snapshot()
  const revealedScope=await write(B,transfer,{...reserve,primary_session_id:controlSession.id})
  deny(revealedScope,[409])
  assert.equal(revealedScope.payload.code,'TRANSFER_EVIDENCE_INSUFFICIENT')
  assert.deepEqual(snapshot(),afterControl)
  pass('explicit_solution_reveal_blocks_transfer_evidence',{after_first_only:true,separate_participant:true})
  await Promise.all([A.page.waitForURL(url=>url.pathname===transferPage),A.page.locator('#practice-transfer-link').click()])
  await A.page.locator('#transfer-workspace').waitFor()
  await A.page.locator('#transfer-primary').selectOption(guided.id)
  await A.page.locator('#transfer-target').selectOption(target.version_id)
  const dateLocal=await A.page.evaluate(value=>{
    const date=new Date(value)
    return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)
  },available_at)
  await A.page.locator('#transfer-available').fill(dateLocal)
  const creation=await chromeWrite(A,transfer,'#transfer-plan')
  assert.deepEqual(creation.input,reserve)
  const createKey={'idempotency-key':creation.key}
  const scheduled=creation.data.transfer
  assert(scheduled?.id)
  assert.equal(scheduled.status,'scheduled')
  assert.equal(scheduled.available_at,available_at)
  assert.equal(scheduled.first_attempt_id,initial.data.attempt.id)
  assert.equal(scheduled.guided_attempt_id,guidedRetry.data.attempt.id)
  assert.equal(scheduled.transfer_attempt_id,null)
  assert.equal(scheduled.evaluation_eligible,false)
  noAbility(scheduled)
  const unchanged=snapshot()
  const same=await save(A,transfer,reserve,200,createKey)
  assert.equal(same.transfer.id,scheduled.id)
  deny(await write(A,transfer,{...reserve,available_at:new Date(due+day).toISOString()},createKey),[409])
  assert.deepEqual(snapshot(),unchanged)
  assert(!((await list(B)).some(item=>item.id===scheduled.id)))

  step('1 ms early denied, exact due instant opens a single fresh transfer')
  await clock(due-1)
  const freshA=await login(A.name)
  const freshB=await login(B.name)
  assert.equal(freshA.id,A.id)
  assert.equal(freshB.id,B.id)
  assert.equal((await plan(freshA,scheduled.id)).status,'scheduled')
  await freshA.page.bringToFront()
  await freshA.page.goto(base+transferPage)
  await freshA.page.locator('#transfer-list [data-transfer-id="'+scheduled.id+'"]').click()
  await freshA.page.locator('#transfer-detail').waitFor()
  assert(await freshA.page.locator('#transfer-start').isDisabled())
  await capture(freshA.page,'transfer-disabled-one-millisecond-early')
  const beforeDue=snapshot()
  const early=await write(freshA,start(scheduled.id),{})
  deny(early,[409])
  assert.equal(early.payload.code,'TRANSFER_NOT_DUE')
  deny(await write(freshB,start(scheduled.id),{}),[404])
  assert.deepEqual(snapshot(),beforeDue)
  await clock(due)
  const ready=await plan(freshA,scheduled.id)
  assert.equal(ready.status,'ready')
  const seenStart=freshA.page.waitForRequest(req=>req.url()===base+start(scheduled.id)&&req.method()==='POST')
  const launching=chromeWrite(freshA,start(scheduled.id),'#transfer-start',[200,201])
  const startRequest=await seenStart
  const startKey={'idempotency-key':startRequest.headers()['idempotency-key']}
  const [begun,again]=await Promise.all([launching,write(freshA,start(scheduled.id),{},startKey)])
  assert.deepEqual([begun.status,again.status].sort(),[200,201])
  const session=begun.data.session
  assert.equal(again.payload.data.session.id,session.id)
  assert.equal(session.mode,'transfer')
  assert.notEqual(session.id,guided.id)
  assert.equal(readRows('SELECT * FROM practice_sessions WHERE id=?',session.id).length,1)
  const loaded=await request(freshA,versions(session))
  assert.equal(loaded.questions.length,1)
  assert.equal(loaded.questions[0].version_id,target.version_id)
  assert.deepEqual(loaded.questions[0].attempts,[])
  assert.equal(loaded.questions[0].feedback,null)
  const firstTransfer=await plan(freshA,scheduled.id)
  assert.equal(firstTransfer.status,'started')
  assert.equal(firstTransfer.started_session_id,session.id)
  deny(await write(freshA,action(session,'hints'),{question_version_id:target.version_id,level:1}),[409])
  await freshA.page.waitForURL(url=>url.pathname===web&&url.searchParams.get('session')===session.id)
  await openPractice(freshA,session,target)
  hide(await freshA.page.content())
  await capture(freshA.page,'fresh-transfer-no-answer-or-help')
  await clock(now()+1)
  const transferred=await answer(freshA,session,2)
  const final=transferred.data.attempt
  assert.deepEqual([final.sequence,final.grading_state,final.independent],[1,'correct',true])
  assert.equal(transferred.data.feedback.evidence.id,targetEvidence.citation.id)
  await freshA.page.locator('#practice-feedback').filter({hasText:transferDraft.explanation}).waitFor()
  const confirmedPlan=await plan(freshA,scheduled.id)
  assert.equal(confirmedPlan.status,'observed')
  assert.equal(confirmedPlan.evidence_state,'independent_transfer_supported')
  assert.equal(confirmedPlan.evaluation_eligible,true)
  assert.equal(confirmedPlan.transfer_attempt_id,final.id)
  assert.equal(confirmedPlan.guided_attempt_id,guidedRetry.data.attempt.id)
  assert.equal(confirmedPlan.first_attempt_id,initial.data.attempt.id)
  noAbility(confirmedPlan)
  const transferRow=rawAttempt(final.id)
  assert.deepEqual(rawAttempt(initial.data.attempt.id),original)
  assert.deepEqual(rawAttempt(guidedRetry.data.attempt.id),retryRow)
  assert.notEqual(transferRow.question_version_id,original.question_version_id)
  await freshA.page.goto(base+transferPage)
  await freshA.page.locator('#transfer-list [data-transfer-id="'+scheduled.id+'"]').click()
  await freshA.page.locator('#transfer-first').filter({hasText:'错误 · 独立'}).waitFor()
  await freshA.page.locator('#transfer-guided').filter({hasText:'正确 · 有辅助'}).waitFor()
  await freshA.page.locator('#transfer-observed').filter({hasText:'正确 · 独立'}).waitFor()
  await freshA.page.locator('#transfer-evidence').filter({hasText:'已记录本次独立迁移成功'}).waitFor()
  await capture(freshA.page,'independent-transfer-observed')
  assert.deepEqual(await me(freshA),origProfile)
  assert.deepEqual(await me(freshB),otherProfile)
  pass('T01',{first_unchanged:true,guided_not_independent:true,distinct_target_and_difficulty:true,before_exact_due_denied:true,
    exact_due_started_once:true,transfer_separate:true,observed_only_no_rating:true})

  step('restart before excluding transfer whose source lost authority')
  const durable=snapshot()
  await stopHost()
  await boot()
  const reopened=await login(A.name),publisher=await login(owner.name)
  assert.deepEqual(snapshot(),durable)
  assert.equal((await plan(reopened,scheduled.id)).transfer_attempt_id,final.id)
  await openPractice(reopened,session,target)
  await reopened.page.locator('#practice-feedback').filter({hasText:transferDraft.explanation}).waitFor()
  await reopened.page.locator('#practice-dispute-reason').fill('LEARN005 recheck the transfer source')
  const dispute=await chromeWrite(reopened,action(session,'disputes'),'#practice-dispute')
  assert.equal(dispute.data.dispute.status,'open')
  const limited=await plan(reopened,scheduled.id)
  assert.equal(limited.status,'limited')
  assert.equal(limited.evidence_state,'insufficient')
  assert.equal(limited.limit_reason,'TRANSFER_QUESTION_DISPUTED')
  assert.equal(limited.evaluation_eligible,false)
  noAbility(limited)
  assert.equal(rawAttempt(final.id).grading_state,'correct')
  const stopped=await write(reopened,start(scheduled.id),{},startKey)
  deny(stopped,[409])
  assert.equal(stopped.payload.code,'TRANSFER_QUESTION_DISPUTED')
  const afterDispute=snapshot()
  const monitor=await reopened.context.newPage()
  await monitor.clock.setFixedTime(new Date(now()))
  await monitor.goto(base+transferPage)
  await monitor.locator('#transfer-list [data-transfer-id="'+scheduled.id+'"]').click()
  await monitor.locator('#transfer-evidence').filter({hasText:'争议暂停'}).waitFor()
  await capture(monitor,'transfer-evidence-paused-after-dispute')
  await reopened.page.bringToFront()
  const grantPath=prefix+'/invitations/'+targetGrant.id
  const grant=await request(publisher,grantPath)
  await save(publisher,grantPath+'/revoke',{actor_id:publisher.id,expected_revision:grant.revision},200)
  await reopened.page.locator('#practice-feedback').waitFor({state:'hidden'})
  hide(await reopened.page.content(),[transferDraft.prompt,transferDraft.explanation])
  await monitor.bringToFront()
  await monitor.locator('#transfer-list [data-transfer-id="'+scheduled.id+'"]').waitFor({state:'hidden'})
  await monitor.locator('#transfer-detail').waitFor({state:'hidden'})
  const afterRevoke=await list(reopened)
  assert(!afterRevoke.some(item=>item.id===scheduled.id))
  hide(JSON.stringify(afterRevoke),[transferDraft.prompt,transferDraft.explanation])
  deny(await wire(reopened,versions(session)),[404])
  deny(await write(reopened,start(scheduled.id),{},startKey),[404])
  assert.equal((await wire(reopened,prefix+'/citations/'+evidence.citation.id+'/resolve')).status,200)
  assert.equal((await wire(freshB,prefix+'/citations/'+targetEvidence.citation.id+'/resolve')).status,200)
  assert.equal((await wire(reopened,prefix+'/citations/'+targetEvidence.citation.id+'/resolve')).status,404)
  assert.deepEqual(rawAttempt(final.id),transferRow)
  assert.deepEqual(snapshot(),afterDispute)
  assert.deepEqual(await me(reopened),origProfile)
  await capture(reopened.page,'transfer-source-revoked-no-exposure')
  pass('T02',{restart_exact:true,dispute_paused:true,independent_source_revocation:true,removed_from_evidence:true,
    first_and_transfer_history_kept:true,no_invented_grade:true})
}
