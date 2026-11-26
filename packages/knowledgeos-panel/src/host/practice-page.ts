export function buildPracticeHtml(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>题库与练习 · KnowledgeOS</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f6faf8;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}[hidden]{display:none!important}
header{background:white;border-bottom:1px solid #cbdcd5}nav,main{max-width:1120px;margin:auto;padding:14px 22px}
nav,.actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}a{color:#146255;text-underline-offset:3px}
h1,h2,h3,p{margin:0 0 8px}h1{font-size:26px}h2{font-size:19px}h3{font-size:16px}
.layout{display:grid;grid-template-columns:minmax(14rem,1fr) minmax(0,2fr);gap:20px}
.card{padding:16px;background:#fff;border:1px solid #cbdcd5;border-radius:8px;margin-bottom:14px;overflow-wrap:anywhere}
ul,ol{padding-inline-start:18px;margin:5px 0 10px}#practice-questions,#practice-session-questions,#practice-history{list-style:none;padding:0}li{margin-bottom:5px}
button,input,select,textarea{max-width:100%;font:inherit;color:inherit;background:white;border:1px solid #90aaa1;border-radius:5px;padding:6px 9px}
button{cursor:pointer}button:disabled{opacity:.6;cursor:default}button[type=submit]{background:#225f51;color:white;border-color:#225f51}
button[aria-pressed=true],button[aria-current=true]{background:#e1efe9}
fieldset{border:0;margin:0;padding:0;display:grid;gap:8px;min-width:0}label{display:grid;gap:3px}textarea{width:100%;min-height:4rem}
#practice-questions button,#practice-session-questions button,#practice-history button{width:100%;text-align:left;overflow-wrap:anywhere}
#practice-status{min-height:1.6em}.subtle,small{color:#46685f}#practice-feedback{background:#edf5f1;border-radius:6px;padding:12px;margin-top:12px}#practice-feedback p{white-space:pre-wrap}
#practice-prompt-text{white-space:pre-wrap}summary{cursor:pointer;font-weight:600}details form{margin-top:10px}
:focus-visible{outline:2px solid #1d7392;outline-offset:2px}
@media(max-width:700px){main,nav{padding:12px 14px}.layout{grid-template-columns:minmax(0,1fr)}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/knowledge">知识条目</a><a href="/knowledgeos/practice" aria-current="page">题库与练习</a><a href="/knowledgeos/review">错题与复习</a><a href="/knowledgeos/transfer">迁移复测</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>题库与练习</h1><p id="practice-status" role="status">正在读取…</p><a id="practice-login" href="/knowledgeos/account" hidden>登录</a>
<div id="practice-workspace" class="layout" hidden><aside>
<section class="card"><h2 id="practice-catalog-title">可用题目</h2><p><a id="practice-term-reader" hidden>返回术语原文</a></p><p class="subtle" id="practice-empty">暂无可练习题目。</p><ul id="practice-questions"></ul><div class="actions"><button id="practice-start" type="button" disabled>开始练习</button><button id="practice-start-guided" type="button" disabled>开始独立与提示练习</button></div></section>
<section class="card"><h2>我的练习</h2><p class="subtle" id="practice-no-history">暂无练习记录。</p><ul id="practice-history"></ul></section>
</aside><div>
<section class="card" id="quick-practice" hidden><h2>阅读快答</h2><p id="quick-scope"></p>
<div class="actions"><label>题量<input id="quick-count" type="number" min="1" max="4" value="2"></label>
<label id="quick-units-label">章节最多单元<input id="quick-units" type="number" min="1" max="6" value="4"></label></div>
<p id="quick-coverage" class="subtle"></p><div class="actions"><button id="quick-preview" type="button">检查范围</button><button id="quick-generate" type="button" disabled>生成并开始</button></div>
<p><small>开始后会将检查范围内的原文摘录发送给已配置的模型。</small></p></section>
<section class="card" id="practice-detail" hidden><h2 id="practice-mode">当前练习</h2><ul id="practice-session-questions"></ul>
<p id="quick-session-coverage" class="subtle" hidden></p><a id="quick-return-reader" hidden>回到原阅读位置</a>
<h3 id="practice-prompt-text"></h3><p id="practice-quality" class="subtle" hidden></p><form id="practice-answer-form"><fieldset id="practice-fields">
<label id="practice-answer-field">我的答案</label><label>作答把握<select id="practice-confidence"><option value="sure">确定</option><option value="unsure">不确定</option></select></label><button type="submit" id="practice-submit">提交首次答案</button></fieldset></form>
<p id="practice-hint-text" aria-live="polite" hidden></p><div class="actions"><button id="practice-hint" type="button">查看提示</button><button id="practice-reveal" type="button" hidden>查看标准答案</button><a id="practice-transfer-link" href="/knowledgeos/transfer" hidden>安排迁移复测</a></div>
<section id="practice-feedback" aria-labelledby="practice-feedback-title" hidden><h3 id="practice-feedback-title">答案与解析</h3><p id="practice-accepted"></p><p id="practice-explanation-text"></p><p id="practice-grading"></p><p id="practice-evaluation"></p><a id="practice-source" href="/knowledgeos/library">查看固定引用</a>
<form id="practice-dispute-form"><label>争议原因<textarea id="practice-dispute-reason" required maxlength="1000"></textarea></label><button id="practice-dispute" type="submit">报告题目争议</button></form></section>
<section id="practice-attempt-panel" hidden><h3>我的作答记录</h3><ol id="practice-attempts"></ol></section>
</section>
<details class="card" id="practice-author"><summary>新建题目</summary><form id="practice-author-form"><fieldset id="practice-author-fields">
<label>题型<select id="practice-kind"><option value="choice">选择题</option><option value="judgment">判断题</option><option value="fill">填空题</option></select></label>
<label>声明难度<select id="practice-difficulty"><option value="basic">基础</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select></label>
<label>题干<textarea id="practice-prompt" required maxlength="2000"></textarea></label>
<label id="practice-options-label">选项（每行一个）<textarea id="practice-options"></textarea></label>
<label><span id="practice-author-answer-label">正确选项序号</span><textarea id="practice-author-answer" required></textarea></label>
<label>解析<textarea id="practice-explanation" required maxlength="4000"></textarea></label>
<label>固定引用编号<input id="practice-citation" required maxlength="36"></label>
<label>可见范围<select id="practice-project"></select></label>
<button type="submit" id="practice-create">创建题目</button></fieldset></form></details>
</div></div></main>
<script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id), bank='/knowledge/v1/questions', api='/knowledge/v1/practice-sessions';
const kinds={choice:'选择',judgment:'判断',fill:'填空'};
const grades={correct:'正确',incorrect:'错误',disputed:'待复核'};
const errors={INVALID_PRACTICE_INPUT:'请核对题型、题干、答案和固定引用。',INVALID_PRACTICE_ANSWER:'请按当前题型填写答案。',
  SOURCE_NOT_FOUND:'这张术语卡或原文当前不可访问。',TERM_NOT_FAVORITE:'这张术语卡已取消收藏，可从阅读器恢复。',
  PRACTICE_NOT_FOUND:'此练习当前不可访问。',QUESTION_NOT_FOUND:'此题目或引用当前不可访问。',
  ATTEMPT_SEQUENCE_CONFLICT:'答案记录已更新，请核对最新作答后再提交。',IDEMPOTENCY_CONFLICT:'同一次提交的内容已变化。',
  AUTH_REQUIRED:'请先登录。',ACTOR_CHANGED:'登录身份已变化，请刷新。',
  QUICK_RANGE_CHANGED:'原文、选区或题量已变化，请重新检查范围。',QUICK_SOURCE_NOT_READY:'当前原文尚未可用，请等解析完成。',
  QUICK_CHAPTER_UNAVAILABLE:'当前版本没有可定位的章节目录。可从选区启动快答。',QUICK_SELECTION_TOO_LONG:'请选择不超过 960 个字符的段落。',
  QUICK_TERM_TOO_LONG:'请选择不超过 64 个字符的术语。',QUICK_MODEL_OUTPUT_INVALID:'模型生成的题目或引用无法核对。',
  MODEL_NOT_CONFIGURED:'当前没有可用的模型。',MODEL_OUTPUT_TRUNCATED:'模型输出未完成，请减少题量后重试。',
  QUESTION_VERSION_CHANGED:'题目版本已修订，请从题库打开当前版本。',DISPUTE_ALREADY_OPEN:'你已报告这一题目版本的争议。',
  HINT_AFTER_ANSWER:'首次作答已记录。',HINT_LEVEL_CONFLICT:'请先查看前一级提示。',
  FIRST_ANSWER_REQUIRED:'请先提交独立首答。',TRANSFER_HINTS_DISABLED:'迁移复测独立完成。'};
const address=new URL(location.href), validId=/^[a-f0-9-]{36}$/;let citation=address.searchParams.get('citation');
let active=address.searchParams.get('session');if(!validId.test(active||''))active=null;
let termFilter=active?null:address.searchParams.get('term');
let actor=null, versions=[], sessions=[], questions=[], picked=new Set(), version=null, busy=false, waiting=false;
let practiceMode='standard';
let epoch=0, reads=0, receipt=null, signature='', catalogSignature='', controller=null;
const scopeLabels={paragraph:'选区段落',chapter:'当前章节',term:'术语语境'};
let quickScope=Object.hasOwn(scopeLabels,address.searchParams.get('quick'))?address.searchParams.get('quick'):null, quickPreview=null;
const status=value=>$('practice-status').textContent=value;
const option=(label,value)=>{const node=document.createElement('option');node.textContent=label;node.value=value;return node};
function button(label,key,handler){
  const node=document.createElement('button');node.type='button';node.textContent=label;
  if(key)node.dataset.questionVersion=key;
  node.onclick=handler;return node
}
function add(list,element){const li=document.createElement('li');li.append(element);list.append(li)}
async function http(path,init={}){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000),...init});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.data){const error=new Error(json?.code||'PRACTICE_UNAVAILABLE');error.status=response.status;throw error}
  return json.data
}
function clearDetail(){
  signature='';version=null;questions=[];practiceMode='standard';$('practice-detail').hidden=true;$('practice-feedback').hidden=true;$('practice-attempt-panel').hidden=true;
  for(const id of ['practice-session-questions','practice-attempts','practice-prompt-text','practice-accepted','practice-explanation-text','practice-grading','practice-quality','quick-session-coverage','practice-hint-text','practice-evaluation'])
    $(id).replaceChildren();
  $('practice-dispute-reason').value='';
  $('practice-answer')?.remove();$('practice-source').removeAttribute('href');$('quick-return-reader').removeAttribute('href');
  $('quick-session-coverage').hidden=$('quick-return-reader').hidden=true;
}
function clearAll(){
  epoch++;reads++;actor=null;catalogSignature='';versions=[];sessions=[];picked.clear();receipt=null;busy=false;waiting=false;
  controller?.abort();controller=null;clearDetail();$('practice-workspace').hidden=true;$('practice-author-form').reset();
  $('practice-term-reader').hidden=true;$('practice-term-reader').removeAttribute('href');$('practice-catalog-title').textContent='可用题目';
  quickPreview=null;$('quick-coverage').textContent='';
  for(const id of ['practice-questions','practice-history','practice-project'])$(id).replaceChildren()
}
function setControls(){
  $('practice-fields').disabled=$('practice-author-fields').disabled=busy;
  $('practice-start').disabled=busy||!picked.size;
  $('practice-start-guided').disabled=busy||picked.size!==1;
  $('quick-count').disabled=$('quick-units').disabled=$('quick-preview').disabled=busy;
  $('quick-generate').disabled=busy||!quickPreview?.available;
  $('practice-hint').disabled=$('practice-dispute').disabled=$('practice-reveal').disabled=busy;
}
function renderCatalog(projects){
  const changed=JSON.stringify([versions,sessions,projects]);
  if(changed===catalogSignature)return;
  catalogSignature=changed;
  picked=new Set([...picked].filter(id=>versions.some(row=>row.version_id===id)));
  $('practice-questions').replaceChildren();
  $('practice-empty').hidden=versions.length!==0;
  for(const question of versions){
    const node=button(kinds[question.kind]+' · '+question.prompt,question.version_id,()=>{
      const id=question.version_id;
      if(picked.has(id))picked.delete(id);
      else if(picked.size<20)picked.add(id);
      else {status('每次练习最多选择 20 题。');return}
      node.setAttribute('aria-pressed',String(picked.has(id)));setControls();
    });
    node.setAttribute('aria-pressed',String(picked.has(question.version_id)));add($('practice-questions'),node)
  }
  $('practice-history').replaceChildren();$('practice-no-history').hidden=sessions.length!==0;
  for(const item of sessions){
    const node=button(item.title+' · '+item.count+' 题',null,()=>void open(item.id));
    node.dataset.practiceSession=item.id;node.setAttribute('aria-current',String(active===item.id));add($('practice-history'),node)
  }
  const project=$('practice-project'), prior=project.value;
  project.replaceChildren(option('仅自己',''),...projects.map(row=>option(row.title,row.id)));
  if(projects.some(row=>row.id===prior))project.value=prior;
  setControls()
}
function formatAnswer(question,value){
  if(question.kind==='choice')return question.options[Number(value)-1]||'';
  if(question.kind==='judgment')return value?'正确':'错误';
  return Array.isArray(value)?value.join(' · '):String(value)
}
function currentQuestion(){return questions.find(row=>row.version_id===version)}
function paintQuestion(){
  const question=currentQuestion();
  if(!question){$('practice-detail').hidden=true;return}
  $('practice-detail').hidden=false;$('practice-prompt-text').textContent=kinds[question.kind]+' · '+question.prompt;
  $('practice-mode').textContent=practiceMode==='guided'?'独立与提示练习':practiceMode==='transfer'?'独立迁移复测':'当前练习';
  $('practice-quality').hidden=question.origin_kind!=='generated';
  $('practice-quality').textContent=question.origin_kind==='generated'?(question.quality_state==='needs_review'?'题目待复核，仅用于练习。':'引用已匹配，仅用于练习。'):'';
  const input=document.createElement(question.kind==='fill'?'input':'select');
  input.id='practice-answer';input.required=true;
  if(question.kind==='choice')input.append(option('选择答案',''),...question.options.map((value,i)=>option(value,String(i+1))));
  if(question.kind==='judgment')input.append(option('选择答案',''),option('正确','true'),option('错误','false'));
  if(question.kind==='fill')input.maxLength=500;
  $('practice-answer')?.remove();$('practice-answer-field').append(input);$('practice-confidence').value='sure';
  $('practice-session-questions').replaceChildren();
  for(const row of questions){
    const b=button(kinds[row.kind]+' · '+row.prompt,row.version_id,()=>{if(!busy&&version!==row.version_id){version=row.version_id;paintQuestion()}});
    b.setAttribute('aria-current',String(version===row.version_id));add($('practice-session-questions'),b)
  }
  const feedback=question.feedback;
  $('practice-feedback').hidden=!feedback;$('practice-attempt-panel').hidden=question.attempts.length===0;
  const hasFirst=question.attempts.length!==0;
  const guided=practiceMode==='guided';
  $('practice-hint').hidden=practiceMode==='transfer'||question.hints.length>=2||(guided?(!hasFirst||!!feedback):hasFirst);
  $('practice-reveal').hidden=!guided||!hasFirst||!!feedback;
  $('practice-transfer-link').hidden=!guided||!hasFirst||!feedback;
  $('practice-hint').textContent=question.hints.length?'查看下一提示':'查看提示';
  $('practice-hint-text').hidden=question.hints.length===0;
  $('practice-hint-text').textContent=question.hints.map(hint=>hint.text).join(' ');
  $('practice-accepted').textContent=feedback?'参考答案：'+formatAnswer(question,feedback.accepted_answer):'';
  $('practice-explanation-text').textContent=feedback?.explanation||'';$('practice-grading').textContent=feedback?.grading_basis||'';
  if(feedback)$('practice-source').href=feedback.evidence.href;else $('practice-source').removeAttribute('href');
  $('practice-attempts').replaceChildren();
  for(const attempt of question.attempts){
    const content=document.createElement('span');
    content.textContent=(attempt.sequence===1?'首次作答':'后续作答 '+attempt.sequence)+' · '+formatAnswer(question,attempt.answer)+' · '+grades[attempt.grading_state]+(attempt.confidence==='unsure'?' · 不确定':'');
    add($('practice-attempts'),content)
  }
  const first=question.attempts[0];
  $('practice-evaluation').textContent=first?.evaluation_status==='paused'?'当前评价暂停，原作答已保留。':
    first?.evaluation_status==='corrected'?'当前重判：'+grades[first.effective_grading]+'。上方解析属于作答时的题目版本。':'';
  $('practice-submit').textContent=question.attempts.length?'提交重答':'提交首次答案';setControls()
}
async function load(force=false){
  if(waiting&&!force)return;
  waiting=true;const turn=++reads, g=epoch,id=active,checkedQuick=quickPreview;
  try{
    const details=id?http(api+'/'+id+'/questions').catch(error=>{
      if(error.status===404||error.status===409)return null;
      throw error;
    }):null;
    const [catalog,history,current,keepsQuick]=await Promise.all([http(termFilter===null?bank:bank+'?'+new URLSearchParams({term:termFilter})),http(api),details,checkedQuick?quickAccess(checkedQuick.input,actor):true]);
    if(g!==epoch||turn!==reads)return;
    if(catalog.actor_id!==history.actor_id||current&&current.actor_id!==catalog.actor_id||actor&&actor!==catalog.actor_id){
      clearAll();status(errors.ACTOR_CHANGED);return
    }
    if(!actor)status('');
    actor=catalog.actor_id;versions=catalog.questions;sessions=history.sessions;$('practice-login').hidden=true;$('practice-workspace').hidden=false;
    if(checkedQuick&&checkedQuick===quickPreview&&!keepsQuick){
      quickPreview=null;controller?.abort();$('quick-coverage').textContent='';status('原文范围已不可访问。');setControls()
    }
    $('quick-practice').hidden=!quickScope;
    if(quickScope){$('quick-scope').textContent=scopeLabels[quickScope];$('quick-units-label').hidden=quickScope!=='chapter'}
    if(citation&&validId.test(citation)){$('practice-citation').value=citation;$('practice-author').open=true;citation=null}
    const term=catalog.term_origin;
    $('practice-catalog-title').textContent=term?'「'+term.term+'」的相关题目':'可用题目';
    $('practice-term-reader').hidden=!term;
    if(term)$('practice-term-reader').href=term.origin;else $('practice-term-reader').removeAttribute('href');
    $('practice-empty').textContent=term?'这处术语还没有可练的题目。':'暂无可练习题目。';
    renderCatalog(catalog.projects);
    if(id&&!current){
      clearDetail();active=null;receipt=null;status('练习、题目或来源已不可访问。');return
    }
    const covered=current?.session.quick_coverage;
    const returnHref=current?.session.term_origin?.origin||covered?.return_href;
    $('quick-session-coverage').hidden=!covered;$('quick-return-reader').hidden=!returnHref;
    $('quick-session-coverage').textContent=covered?coverageText(covered):'';
    if(returnHref)$('quick-return-reader').href=returnHref;else $('quick-return-reader').removeAttribute('href');
    const next=JSON.stringify(current?.questions||[]);
    if(next!==signature){
      signature=next;questions=current?.questions||[];practiceMode=current?.session.mode||'standard';
      if(!currentQuestion())version=questions[0]?.version_id;
      paintQuestion()
    }
  }catch(error){
    if(g!==epoch||turn!==reads)return;
    clearAll();$('practice-login').hidden=error.status!==401;status(errors[error.message]||'暂时无法读取题库。');
  }finally{if(turn===reads)waiting=false}
}
async function open(id){
  if(!validId.test(id))return;
  reads++;clearDetail();active=id;receipt=null;termFilter=null;address.searchParams.delete('term');address.searchParams.delete('citation');address.searchParams.set('session',id);
  if(quickScope){
    for(const name of ['quick','asset','version','unit','conversion','start','end','anchor'])address.searchParams.delete(name);
    quickScope=quickPreview=null;
  }
  history.replaceState(null,'',address);catalogSignature='';await load(true)
}
async function write(path,payload){
  if(!actor||busy)return;
  const g=epoch,user=actor,digest=JSON.stringify([path,payload]);
  if(receipt?.digest!==digest)receipt={digest,key:crypto.randomUUID()};
  busy=true;setControls();status('正在提交…');
  const abort=new AbortController();controller=abort;
  try{
    const result=await http(path,{method:'POST',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(path===api+'/generate'?45000:12000)]),
      headers:{'content-type':'application/json','x-knowledgeos-request':'1','x-knowledgeos-reader-actor':user,'idempotency-key':receipt.key},body:JSON.stringify(payload)});
    if(g!==epoch)return;
    if(result.actor_id!==actor){clearAll();status(errors.ACTOR_CHANGED);return}
    receipt=null;
    if(path===api){picked.clear();await open(result.session.id);if(g===epoch&&active===result.session.id)status('练习已开始。')}
    else if(path===api+'/generate'){
      if(result.status==='insufficient')status('当前范围依据不足，请返回原文扩大或更换选区。');
      else {await open(result.session.id);if(g===epoch&&active===result.session.id)status('快答练习已开始。')}
    }
    else if(path===bank){$('practice-author-form').reset();authorControls();await load(true);if(g===epoch)status('题目已创建。')}
    else if(path.endsWith('/hints')){await load(true);if(g===epoch&&currentQuestion())status('已记录提示。')}
    else if(path.endsWith('/reveal')){await load(true);if(g===epoch&&currentQuestion())status('已记录查看标准答案。')}
    else if(path.endsWith('/disputes')){$('practice-dispute-reason').value='';await load(true);if(g===epoch&&currentQuestion())status('争议已记录，当前评价暂停。')}
    else {await load(true);if(g===epoch&&currentQuestion())status('作答已保存 · '+grades[result.attempt.grading_state])}
  }catch(error){
    if(g!==epoch)return;
    status(errors[error.message]||'未收到有效回执，可以重试本次提交。');
    if(path===api+'/generate'&&[404,409].includes(error.status)){quickPreview=null;$('quick-coverage').textContent='请重新检查原文范围。'}
    if([401,404,409].includes(error.status))await load(true)
  }finally{if(g===epoch){controller=null;busy=false;setControls()}}
}
function coverageText(c){
  const units=c.first===c.last?'第 '+c.first+' 单元':'第 '+c.first+'–'+c.last+' 单元';
  const actual=c.included.length?' · 原文单元 '+c.included.join('、'):' · 无足够的原文摘录';
  return scopeLabels[c.scope]+' · '+c.title+' · '+units+actual+(c.clipped?' · 按显示范围取样':'')+(c.unavailable.length?' · 跳过 '+c.unavailable.join('、'):'')
}
function quickInput(){
  const q=address.searchParams,count=Number($('quick-count').value),units=Number($('quick-units').value);
  if(!Number.isInteger(count)||count<1||count>4||quickScope==='chapter'&&(!Number.isInteger(units)||units<1||units>6))return;
  const value={scope:quickScope,count,asset_id:q.get('asset'),version_id:q.get('version'),ordinal:Number(q.get('unit'))};
  if(q.get('conversion'))value.conversion_id=q.get('conversion');
  if(quickScope==='chapter')value.units=units;
  else {value.start=Number(q.get('start'));value.end=Number(q.get('end'));value.source_hash=q.get('anchor')}
  return value
}
async function quickAccess(input,user){
  try{
    const path='/knowledge/v1/assets/'+input.asset_id+'/versions/'+input.version_id+'/reader-access';
    return (await http(path)).actor_id===user
  }catch(error){if([401,403,404,409].includes(error.status))return false;throw error}
}
async function previewQuick(){
  if(busy||!actor||!quickScope)return;
  const input=quickInput();
  if(!input){status('请调整题量或章节单元数。');return}
  const g=epoch,user=actor;quickPreview=null;busy=true;setControls();status('正在核对原文范围…');
  const abort=new AbortController();controller=abort;
  try{
    const result=await http(api+'/generate/preview',{method:'POST',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]),
      headers:{'content-type':'application/json','x-knowledgeos-request':'1','x-knowledgeos-reader-actor':user},body:JSON.stringify(input)});
    const visible=await quickAccess(input,user);
    if(g!==epoch)return;
    if(result.actor_id!==actor){clearAll();status(errors.ACTOR_CHANGED);return}
    if(!visible){status('原文范围已不可访问。');return}
    quickPreview={...result,input};
    $('quick-coverage').textContent=coverageText(result.coverage);
    status(result.available?'已核对原文范围。':'当前范围的原文不足。');
  }catch(error){if(g===epoch){$('quick-coverage').textContent='';status(errors[error.message]||'无法核对原文范围。')}}
  finally{if(g===epoch){controller=null;busy=false;setControls()}}
}
$('quick-preview').onclick=()=>void previewQuick();
$('quick-generate').onclick=()=>{
  if(quickPreview?.available)void write(api+'/generate',{...quickPreview.input,fingerprint:quickPreview.fingerprint})
};
for(const id of ['quick-count','quick-units'])$(id).oninput=()=>{quickPreview=null;$('quick-coverage').textContent='';setControls()};
function lines(value){return value.split(/\\r?\\n/u).map(item=>item.trim()).filter(Boolean)}
function authorControls(){
  const kind=$('practice-kind').value;
  $('practice-options-label').hidden=kind!=='choice';$('practice-options').required=kind==='choice';
  $('practice-author-answer-label').textContent=kind==='choice'?'正确选项序号':kind==='judgment'?'正确答案（正确或错误）':'可接受答案（每行一个）';
}
$('practice-kind').onchange=authorControls;
$('practice-author-form').onsubmit=event=>{
  event.preventDefault();const kind=$('practice-kind').value, raw=$('practice-author-answer').value.trim();
  const payload={kind,prompt:$('practice-prompt').value,explanation:$('practice-explanation').value,source_citation_id:$('practice-citation').value.trim(),difficulty:$('practice-difficulty').value};
  if($('practice-project').value)payload.project_id=$('practice-project').value;
  if(kind==='choice'){
    payload.options=lines($('practice-options').value);payload.answer=Number(raw);
    if(!Number.isInteger(payload.answer)||payload.answer<1||payload.answer>payload.options.length){status('请填写有效的正确选项序号。');return}
  }else if(kind==='judgment'){
    if(!['正确','错误','true','false'].includes(raw)){status('判断题答案请输入正确或错误。');return}
    payload.answer=raw==='正确'||raw==='true';
  }else payload.answer=lines(raw);
  void write(bank,payload)
};
$('practice-start').onclick=()=>{if(picked.size)void write(api,{question_version_ids:[...picked],...(termFilter!==null?{term_id:termFilter}:{})})};
$('practice-start-guided').onclick=()=>{if(picked.size===1)void write(api,{question_version_ids:[...picked],mode:'guided',...(termFilter!==null?{term_id:termFilter}:{})})};
$('practice-hint').onclick=()=>{
  const question=currentQuestion();
  if(question&&active&&!$('practice-hint').hidden&&question.hints.length<2)
    void write(api+'/'+active+'/hints',{question_version_id:question.version_id,level:question.hints.length+1})
};
$('practice-reveal').onclick=()=>{
  const question=currentQuestion();
  if(question&&active&&!$('practice-reveal').hidden)void write(api+'/'+active+'/reveal',{question_version_id:question.version_id})
};
$('practice-dispute-form').onsubmit=event=>{
  event.preventDefault();const question=currentQuestion();
  if(question&&active&&question.attempts.length)
    void write(api+'/'+active+'/disputes',{question_version_id:question.version_id,reason:$('practice-dispute-reason').value})
};
$('practice-answer-form').onsubmit=event=>{
  event.preventDefault();const question=currentQuestion();if(!question||!active)return;
  const raw=$('practice-answer').value;
  const answer=question.kind==='choice'?Number(raw):question.kind==='judgment'?raw==='true':raw;
  void write(api+'/'+active+'/attempts',{question_version_id:question.version_id,expected_sequence:question.attempts.at(-1)?.sequence||0,
    answer,confidence:$('practice-confidence').value})
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
window.addEventListener('focus',()=>void load());window.addEventListener('pagehide',clearAll);
window.addEventListener('pageshow',event=>{if(event.persisted)void load()});
setInterval(()=>{if(!document.hidden)void load()},1750);authorControls();void load();
</script></body></html>`
}
