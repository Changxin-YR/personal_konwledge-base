export async function run(h){
  const {assert,base,prefix,owner,learnerA,learnerB,outsider,project,evidence,step,pass,request,wire,idempotency,readRows,capture}=h
  const bank=prefix+'/questions',api=prefix+'/practice-sessions',review=prefix+'/me/wrong-questions',me=prefix+'/me';
  const headers=actor=>({'x-knowledgeos-reader-actor':actor.id,...idempotency()});
  const post=(actor,path,body)=>request(actor,path,'POST',body,{headers:headers(actor),status:201});
  const getItem=async(actor,question)=> (await request(actor,review)).items.find(item=>item.question.id===question.id);
  const tasks=(session,action)=>api+'/'+session.id+'/'+action;
  const defined={kind:'choice',options:['仅记录','限制并记录'],answer:2,project_id:project.id,source_citation_id:evidence.citation.id};
  async function published(prompt){
    return (await post(owner,bank,{...defined,prompt,explanation:'LEARN003-V1 依据是原引用。'})).question;
  }
  async function start(actor,values){
    return (await post(actor,api,{question_version_ids:values.map(question=>question.version_id)})).session;
  }
  async function chromeWrite(actor,path,method,selector,status){
    const [result]=await Promise.all([
      actor.page.waitForResponse(response=>response.url()===base+path&&response.request().method()===method),
      actor.page.locator(selector).click(),
    ]);
    const payload=await result.json();assert.equal(result.status(),status,payload.code);
    assert.equal(payload.data.actor_id,actor.id);return payload.data;
  }
  async function preparePage(actor,path,selector){
    await actor.page.bringToFront();await actor.page.goto(base+path);await actor.page.locator(selector).waitFor();
  }
  async function putAnswer(actor,session,question,answer,confidence='sure'){
    return (await post(actor,tasks(session,'attempts'),{question_version_id:question.version_id,expected_sequence:0,answer,confidence})).attempt;
  }
  const label=(actor,question)=>actor.page.locator('#review-questions [data-question-id="'+question.id+'"]');
  const correctionPath=question=>bank+'/'+question.id+'/corrections';

  step('T01 real shared rubric, first answers and private plan')
  const profile=await request(learnerA,me);
  await request(learnerA,me+'/preferences','PATCH',{expected_revision:profile.revision,domains:['software_engineering'],
    learning_tracks:['engineering_practice'],goal_text:'LEARN003 保持本人方向'});
  const learningBefore=await request(learnerA,me);
  const userBefore=readRows('SELECT domains,learning_tracks,goal_text,revision FROM users WHERE id=?',learnerA.id)[0];
  const first=await published('记录条件下应执行哪一种操作？');
  const unsure=await published('给出第二条约束下的操作。');
  const hinted=await published('核对第三条限制下的记录方式。');
  const dispute=await published('复核第四条有歧义的说明。');
  const a=await start(learnerA,[first,unsure,hinted,dispute]),b=await start(learnerB,[first,dispute]);
  const aFirst=await putAnswer(learnerA,a,first,1),bFirst=await putAnswer(learnerB,b,first,2);
  const immutable=()=>readRows('SELECT * FROM practice_attempts WHERE id IN (?,?) ORDER BY id',aFirst.id,bFirst.id);
  const original=immutable();
  assert.deepEqual([(await getItem(learnerA,first)).classification,(await getItem(learnerB,first)).classification],['wrong','independent_correct']);
  assert.equal((await request(owner,review)).items.length,0);
  assert.equal((await request(outsider,review)).items.length,0);

  await preparePage(learnerA,'/knowledgeos/review','#review-workspace');
  await label(learnerA,first).click();
  await learnerA.page.locator('#review-reason').fill('LEARN003 私人错因：误读了限制');
  await learnerA.page.locator('#review-mastery').selectOption('reviewing');
  await learnerA.page.locator('#review-date').fill('2026-11-27T10:15');
  const saved=await chromeWrite(learnerA,prefix+'/me/question-states/'+first.id,'PATCH','#review-save',200);
  assert.equal(saved.state.revision,1);
  assert.equal((await getItem(learnerB,first)).state.wrong_reason,'');
  await learnerA.page.locator('#review-queue [data-question-id="'+first.id+'"]').waitFor();

  step('T02 actual hint, confidence, dispute and follow-up plan')
  assert.equal((await putAnswer(learnerA,a,unsure,2,'unsure')).classification,'uncertain');
  await preparePage(learnerA,'/knowledgeos/practice?session='+a.id,'#practice-detail');
  const choose=question=>learnerA.page.locator('#practice-session-questions [data-question-version="'+question.version_id+'"]').click();
  await choose(hinted);
  const shown=await chromeWrite(learnerA,tasks(a,'hints'),'POST','#practice-hint',201);
  assert.equal(shown.hint.level,1);
  await learnerA.page.locator('#practice-hint-text').waitFor();
  assert.equal((await putAnswer(learnerA,a,hinted,2)).classification,'assisted');
  await putAnswer(learnerA,a,dispute,2);
  await putAnswer(learnerB,b,dispute,2);
  await learnerA.page.reload();
  await choose(dispute);
  await learnerA.page.locator('#practice-dispute-reason').fill('LEARN003 私人争议：约束文本有歧义');
  const reported=await chromeWrite(learnerA,tasks(a,'disputes'),'POST','#practice-dispute',201);
  assert.equal(reported.dispute.status,'open');
  assert.equal((await getItem(learnerB,dispute)).evaluation_eligible,false);
  assert.equal((await getItem(learnerA,dispute)).original_grading,'correct');
  assert.equal((await getItem(learnerA,dispute)).classification,'disputed');
  await learnerA.page.locator('#practice-evaluation').filter({hasText:'当前评价暂停'}).waitFor();
  await capture(learnerA.page,'dispute-pauses-evaluation');
  const theirs=await request(learnerA,review);
  assert.deepEqual(theirs.items.map(item=>item.classification).sort(),['assisted','disputed','uncertain','wrong']);
  assert(theirs.review_queue.some(item=>item.question_id===first.id));
  await preparePage(learnerA,'/knowledgeos/review','#review-workspace');
  await learnerA.page.locator('#review-queue').getByText('记录条件',{exact:false}).waitFor();
  assert.match(await learnerA.page.locator('#review-goal').textContent(),/保持本人方向/);
  await capture(learnerA.page,'private-classes-and-real-review-queue');
  assert.deepEqual(await request(learnerA,me),learningBefore);
  assert.deepEqual(readRows('SELECT domains,learning_tracks,goal_text,revision FROM users WHERE id=?',learnerA.id)[0],userBefore);
  pass('T02',{four_distinct_classes:true,dispute_pauses_other_formal_result:true,private_plan:true,unchanged_profile:true});

  step('T01 author correction creates v2 and both users read own recomputation')
  await preparePage(owner,'/knowledgeos/review','#review-workspace');
  await owner.page.locator('#review-author summary').click();
  await owner.page.locator('#review-author-question').selectOption(first.id);
  await owner.page.locator('#review-correction').waitFor();
  await owner.page.locator('#review-answer').fill('1');
  await owner.page.locator('#review-explanation').fill('LEARN003-V2 仅记录是本题所问。');
  await owner.page.locator('#review-correction-reason').fill('根据固定引用澄清题意。');
  const revised=await chromeWrite(owner,correctionPath(first),'POST','#review-correct',201);
  assert.equal(revised.question.version,2);
  assert.equal(revised.correction.from_version_id,first.version_id);
  assert.equal(revised.correction.to_version_id,revised.question.version_id);
  assert.deepEqual(immutable(),original);
  const aNow=await getItem(learnerA,first),bNow=await getItem(learnerB,first);
  assert.deepEqual([aNow.original_grading,aNow.effective_grading,aNow.evaluation_status],['incorrect','correct','corrected']);
  assert.deepEqual([bNow.original_grading,bNow.effective_grading,bNow.evaluation_status],['correct','incorrect','corrected']);
  assert.equal(aNow.state.wrong_reason,saved.state.wrong_reason);
  assert.equal(bNow.state.wrong_reason,'');
  assert.equal((await request(owner,review)).items.length,0);
  const denied=await wire(learnerA,correctionPath(first),'POST',{expected_version:2,answer:2,explanation:'X',reason:'X'},headers(learnerA));
  assert.equal(denied.status,404);
  const historical=(await request(learnerA,tasks(a,'questions'))).questions.find(row=>row.id===first.id);
  assert.equal(historical.version_id,first.version_id);
  assert.equal(historical.feedback.accepted_answer,2);
  assert.equal(historical.feedback.evidence.quote_hash,evidence.citation.quote_hash);
  assert.equal(historical.attempts[0].grading_state,'incorrect');
  assert.equal(historical.attempts[0].effective_grading,'correct');
  await preparePage(learnerB,'/knowledgeos/review','#review-workspace');
  await label(learnerB,first).click();
  await learnerB.page.locator('#review-effective').filter({hasText:'修订后判定：错误'}).waitFor();
  await capture(learnerB.page,'private-corrected-result');
  pass('T01',{different_initial_and_effective_grades:true,raw_attempts_identical:true,pinned_original_explanation:true,author_only_correction:true});
}
