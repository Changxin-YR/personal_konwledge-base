export async function run(h){
  const {assert,base,prefix,owner,learnerA,outsider,project,evidence,step,pass,request,wire,idempotency,readRows,capture,source,shareSource,clock,now}=h
  const bank=prefix+'/questions',api=prefix+'/practice-sessions',transfer=prefix+'/me/transfer-practice';
  const headers=(actor,key=idempotency())=>({'x-knowledgeos-reader-actor':actor.id,...key});
  const post=(actor,path,body)=>request(actor,path,'POST',body,{headers:headers(actor),status:201});
  const path=(session,action)=>api+'/'+session.id+'/'+action;
  const raw=id=>readRows('SELECT * FROM practice_attempts WHERE id=?',id)[0];
  const practice=async(session,question)=>{
    await learnerA.page.bringToFront();
    await learnerA.page.goto(base+'/knowledgeos/practice?session='+session.id);
    await learnerA.page.locator('#practice-session-questions [data-question-version="'+question.version_id+'"]').click();
  };
  async function event(actor,url,selector){
    const [response]=await Promise.all([
      actor.page.waitForResponse(value=>value.url()===base+url&&value.request().method()==='POST'),
      actor.page.locator(selector).click(),
    ]);
    const result=await response.json();assert.equal(response.status(),201,result.code);
    return {data:result.data,key:response.request().headers()['idempotency-key'],payload:response.request().postDataJSON()};
  }
  async function answer(session,option){
    await learnerA.page.locator('#practice-answer').selectOption(String(option));
    return event(learnerA,path(session,'attempts'),'#practice-submit');
  }
  async function question(prompt,band,answer,ref){
    return (await post(owner,bank,{kind:'choice',difficulty:band,prompt,options:['检查证据','立即忽略','无限重试'],answer,
      explanation:'MAIN-LEARN005 解析绑定固定原文。',project_id:project.id,source_citation_id:ref.id})).question;
  }
  async function state(id){
    return (await request(learnerA,transfer)).items.find(item=>item.id===id);
  }

  step('T01 independent first saved without publishing the guided solution')
  const alternative=await source(owner,'MAIN_LEARN005_DISTINCT_TRANSFER_CONTEXT');
  await shareSource(owner,[learnerA],alternative.asset);
  const primary=await question('原情境应先检查什么？','intermediate',1,evidence.citation);
  const target=await question('在新情境中应首先采取哪个行动？','intermediate',1,alternative.citation);
  const decoy=await question('不同难度的训练对照','advanced',2,alternative.citation);
  const session=(await post(learnerA,api,{question_version_ids:[primary.version_id],mode:'guided'})).session;
  await practice(session,primary);
  await learnerA.page.locator('#practice-hint').waitFor({state:'hidden'});
  const first=await answer(session,2);
  assert.equal(first.data.attempt.independent,true);assert.equal(first.data.attempt.grading_state,'incorrect');
  assert.equal(first.data.feedback,null);
  const firstRow=raw(first.data.attempt.id);
  assert(firstRow);
  await learnerA.page.locator('#practice-feedback').waitFor({state:'hidden'});
  await capture(learnerA.page,'durable-blind-first-answer');
  const askHint=()=>event(learnerA,path(session,'hints'),'#practice-hint');
  const low=await askHint();
  await learnerA.page.locator('#practice-hint-text').waitFor();
  const high=await askHint();
  assert.deepEqual([low.data.hint.level,high.data.hint.level,low.data.hint.for_sequence,high.data.hint.for_sequence],[1,2,2,2]);
  const ownBefore=(await request(learnerA,path(session,'questions'))).questions[0];
  assert.equal(ownBefore.feedback,null);assert.equal(ownBefore.hints.length,2);
  const guided=await answer(session,1);
  assert.deepEqual([guided.data.attempt.sequence,guided.data.attempt.independent,guided.data.attempt.grading_state],[2,false,'correct']);
  assert.deepEqual(raw(first.data.attempt.id),firstRow);
  await learnerA.page.locator('#practice-feedback').waitFor();
  const initialReplay=await request(learnerA,path(session,'attempts'),'POST',first.payload,
    {headers:headers(learnerA,{'idempotency-key':first.key})});
  assert.equal(initialReplay.attempt.id,first.data.attempt.id);
  assert.equal(initialReplay.feedback,null);

  step('T01 actual browser schedules independent transfer and observes exact boundary')
  const due=Math.ceil((now()+3600000)/60000)*60000;
  const available_at=new Date(due).toISOString();
  const mismatched={primary_session_id:session.id,target_version_id:decoy.version_id,available_at};
  assert.equal((await wire(learnerA,transfer,'POST',mismatched,headers(learnerA))).payload.code,'TRANSFER_NOT_COMPARABLE');
  await learnerA.page.goto(base+'/knowledgeos/transfer');
  await learnerA.page.locator('#transfer-workspace').waitFor();
  await learnerA.page.locator('#transfer-primary').selectOption(session.id);
  await learnerA.page.locator('#transfer-target').selectOption(target.version_id);
  const localDate=await learnerA.page.evaluate(value=>{
    const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
  },available_at);
  await learnerA.page.locator('#transfer-available').fill(localDate);
  const created=await event(learnerA,transfer,'#transfer-plan');
  const id=created.data.transfer.id;
  assert.equal(created.data.transfer.available_at,available_at);
  assert.equal((await state(id)).status,'scheduled');
  assert.equal((await request(outsider,transfer)).items.length,0);
  const start=transfer+'/'+id+'/start';
  await clock(due-1);
  const before=readRows('SELECT count(*) n FROM practice_sessions')[0].n;
  const early=await wire(learnerA,start,'POST',{},headers(learnerA));
  assert.deepEqual([early.status,early.payload.code],[409,'TRANSFER_NOT_DUE']);
  assert.equal(readRows('SELECT count(*) n FROM practice_sessions')[0].n,before);
  await clock(due);
  await learnerA.page.reload();
  await learnerA.page.locator('#transfer-list [data-transfer-id="'+id+'"]').click();
  const [opened]=await Promise.all([
    learnerA.page.waitForResponse(value=>value.url()===base+start&&value.request().method()==='POST'),
    learnerA.page.locator('#transfer-start').click(),
  ]);
  assert.equal(opened.status(),201);
  await learnerA.page.waitForURL(url=>url.pathname==='/knowledgeos/practice'&&url.searchParams.has('session'));
  const started=await state(id);
  const retest=(await request(learnerA,api+'/'+started.started_session_id+'/questions')).session;
  assert.equal(retest.mode,'transfer');assert.notEqual(retest.id,session.id);
  await learnerA.page.locator('#practice-hint').waitFor({state:'hidden'});
  const third=await answer(retest,1);
  assert.deepEqual([third.data.attempt.sequence,third.data.attempt.independent,third.data.attempt.grading_state],[1,true,'correct']);
  const observed=await state(id);
  assert.equal(observed.first_attempt_id,first.data.attempt.id);
  assert.equal(observed.guided_attempt_id,guided.data.attempt.id);
  assert.equal(observed.transfer_attempt_id,third.data.attempt.id);
  assert.equal(observed.evaluation_eligible,true);
  assert.equal(observed.evidence_state,'independent_transfer_supported');
  const rawBefore=raw(third.data.attempt.id);
  await learnerA.page.goto(base+'/knowledgeos/transfer');
  await learnerA.page.locator('#transfer-list [data-transfer-id="'+id+'"]').click();
  await learnerA.page.locator('#transfer-evidence').filter({hasText:'独立迁移成功'}).waitFor();
  await capture(learnerA.page,'three-distinct-observations');
  pass('T01',{due_boundary_milliseconds:1,first_preserved:true,two_hints:true,new_independent_attempt:true,same_declared_difficulty:true});

  step('T02 actual source dispute invalidates transfer eligibility without rewriting answers')
  await practice(retest,target);
  await learnerA.page.locator('#practice-dispute-reason').fill('MAIN-LEARN005 这条原文条件值得复核。');
  await event(learnerA,path(retest,'disputes'),'#practice-dispute');
  const limited=await state(id);
  assert.equal(limited.status,'limited');
  assert.equal(limited.evidence_state,'insufficient');
  assert.equal(limited.evaluation_eligible,false);
  assert.equal(limited.limit_reason,'TRANSFER_QUESTION_DISPUTED');
  assert.deepEqual(raw(third.data.attempt.id),rawBefore);
  assert.deepEqual(raw(first.data.attempt.id),firstRow);
  for(const field of ['ability_grade','ability_level','ability_score'])assert.equal(Object.hasOwn(limited,field),false);
  await learnerA.page.goto(base+'/knowledgeos/transfer');
  await learnerA.page.locator('#transfer-list [data-transfer-id="'+id+'"]').click();
  await learnerA.page.locator('#transfer-evidence').filter({hasText:'争议暂停'}).waitFor();
  await capture(learnerA.page,'transfer-evidence-paused');
  pass('T02',{wrong_band_denied:true,dispute_limits_evidence:true,historical_rows_unchanged:true,no_general_ability_claim:true});
}
