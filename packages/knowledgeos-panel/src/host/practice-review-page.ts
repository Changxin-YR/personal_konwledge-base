export function buildPracticeReviewHtml(nonce:string){
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>错题与复习 · KnowledgeOS</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f6faf8;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}[hidden]{display:none!important}
header{background:white;border-bottom:1px solid #cbdcd5}nav,main{max-width:1120px;margin:auto;padding:14px 22px}
nav,.row{display:flex;align-items:center;flex-wrap:wrap;gap:12px}a{color:#146255;text-underline-offset:3px}
h1,h2,h3,p{margin:0 0 8px}h1{font-size:26px}h2{font-size:19px}h3{font-size:16px}
.layout{display:grid;grid-template-columns:minmax(13rem,1fr) minmax(0,2fr);gap:20px}
.card{padding:16px;background:#fff;border:1px solid #cbdcd5;border-radius:8px;margin-bottom:14px;overflow-wrap:anywhere}
ul{list-style:none;padding:0;margin:10px 0}li{margin-bottom:5px}label{display:grid;gap:4px}
fieldset{display:grid;gap:9px;border:0;padding:0;margin:0;min-width:0}
input,select,textarea,button{max-width:100%;min-width:0;font:inherit;color:inherit;background:white;border:1px solid #90aaa1;border-radius:5px;padding:6px 9px}
textarea{width:100%;min-height:4rem}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}
button[type=submit]{background:#225f51;color:white;border-color:#225f51}button[aria-current=true]{background:#e1efe9}
#review-questions button{width:100%;text-align:left;overflow-wrap:anywhere}#review-status{min-height:1.6em}.subtle{color:#46685f}
summary{cursor:pointer;font-weight:600}details>div{margin-top:10px}
:focus-visible{outline:2px solid #1d7392;outline-offset:2px}
@media(max-width:700px){main,nav{padding:12px 14px}.layout{grid-template-columns:minmax(0,1fr)}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/today">今日计划</a><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/practice">题库与练习</a><a href="/knowledgeos/review" aria-current="page">错题与复习</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>错题与复习</h1><p id="review-status" role="status">正在读取…</p><a id="review-login" href="/knowledgeos/account" hidden>登录</a>
<div class="layout" id="review-workspace" hidden><aside>
<section class="card"><h2>我的作答分类</h2><label>筛选<select id="review-filter"><option value="">全部</option><option value="wrong">错题</option><option value="uncertain">答对但不确定</option><option value="assisted">有辅助</option><option value="disputed">待复核</option><option value="independent_correct">独立答对</option></select></label>
<p id="review-empty" class="subtle" hidden>暂无符合条件的作答。</p><ul id="review-questions"></ul></section>
<section class="card"><h2>我的后续复习</h2><p class="subtle" id="review-no-queue">暂无已安排的复习。</p><ul id="review-queue"></ul></section>
</aside><div>
<section class="card"><h2>学习方向与目标</h2><p id="review-tracks"></p><p id="review-goal"></p><a href="/knowledgeos/account">调整个人目标</a></section>
<section class="card" id="review-detail" hidden><h2 id="review-title"></h2><p id="review-classification"></p><p id="review-first"></p><p id="review-effective"></p><p><a id="review-attempt-link">查看原作答</a> <a id="review-term-session" hidden>回看术语练习</a></p>
<form id="review-form"><fieldset id="review-fields"><label>个人错因或复习笔记<textarea id="review-reason" maxlength="1000"></textarea></label>
<label>复习状态<select id="review-mastery"><option value="new">未开始</option><option value="reviewing">复习中</option><option value="mastered">已掌握</option></select></label>
<label>下次复习时间<input id="review-date" type="datetime-local"></label><button id="review-save" type="submit">保存个人安排</button></fieldset></form></section>
<details class="card" id="review-author" hidden><summary>复核我创建的题目</summary><div>
<label>题目<select id="review-author-question"></select></label>
<form id="review-correction" hidden><fieldset id="review-correction-fields"><p id="review-old-rubric"></p>
<label><span id="review-answer-label">新的标准答案</span><textarea id="review-answer" required></textarea></label>
<label>新解析<textarea id="review-explanation" maxlength="4000" required></textarea></label>
<label>修订原因<textarea id="review-correction-reason" maxlength="1000" required></textarea></label>
<button type="submit" id="review-correct">发布新答案版本</button></fieldset></form></div></details>
</div></div></main>
<script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id), api='/knowledge/v1/me/wrong-questions',states='/knowledge/v1/me/question-states',bank='/knowledge/v1/questions';
const groups={wrong:'错题',uncertain:'答对但不确定',assisted:'有辅助',disputed:'待复核',independent_correct:'独立答对'};
const grades={correct:'正确',incorrect:'错误',disputed:'待复核'};
const tracks={engineering_practice:'工程实践',architecture_exam:'架构师考试',knowledge_accumulation:'知识积累'};
const errors={AUTH_REQUIRED:'请先登录。',QUESTION_NOT_FOUND:'题目或原作答当前不可访问。',ACTOR_CHANGED:'登录身份已变化，请刷新。',
  REVISION_CONFLICT:'个人安排已更新，请核对最新版本。',QUESTION_VERSION_CHANGED:'题目版本已更新，请重新选择题目。',
  INVALID_PRACTICE_INPUT:'请核对所填内容。',INVALID_PRACTICE_ANSWER:'请按题型填写标准答案。',IDEMPOTENCY_CONFLICT:'同一次提交的内容已变化。'};
const status=value=>$('review-status').textContent=value;
const option=(label,value)=>{const element=document.createElement('option');element.value=value;element.textContent=label;return element};
const put=(list,element)=>{const li=document.createElement('li');li.append(element);list.append(li)};
let actor=null,items=[],queue=[],authored=[],selected=null,managed=null,busy=false,polling=false,epoch=0,managedToken=0,receipt=null,signature='';
const choice=()=>items.find(item=>item.question.id===selected);
async function http(path,init={}){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(6000),...init});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.data){const error=new Error(json?.code||'PRACTICE_UNAVAILABLE');error.status=response.status;throw error}
  return json.data;
}
function clearOwn(){
  selected=null;$('review-detail').hidden=true;$('review-form').reset();
  for(const id of ['review-title','review-classification','review-first','review-effective'])$(id).textContent='';
  $('review-attempt-link').removeAttribute('href');$('review-term-session').removeAttribute('href');$('review-term-session').hidden=true;
}
function clearAuthor(){
  managedToken++;managed=null;$('review-correction').hidden=true;$('review-correction').reset();$('review-old-rubric').textContent='';
}
function clear(){
  epoch++;actor=null;items=[];queue=[];authored=[];receipt=null;busy=false;signature='';clearOwn();clearAuthor();
  $('review-fields').disabled=$('review-correction-fields').disabled=false;
  $('review-workspace').hidden=true;
  for(const id of ['review-questions','review-queue','review-author-question','review-tracks','review-goal'])$(id).replaceChildren();
}
const formatDate=value=>new Date(value).toLocaleString('zh-CN');
function inputDate(value){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function renderItem(reset=true){
  const item=choice();if(!item){clearOwn();return}
  $('review-detail').hidden=false;$('review-title').textContent=item.question.prompt;
  $('review-classification').textContent=groups[item.classification];
  $('review-first').textContent='首答原判：'+grades[item.original_grading]+' · '+formatDate(item.attempt.submitted_at);
  $('review-effective').textContent=item.evaluation_status==='paused'?'当前评价暂停':
    item.evaluation_status==='corrected'?'修订后判定：'+grades[item.effective_grading]:'当前判定：'+grades[item.effective_grading];
  $('review-attempt-link').href='/knowledgeos/practice?'+new URLSearchParams({session:item.session_id});
  const linked=$('review-term-session');linked.hidden=!item.term_session_id;
  if(item.term_session_id)linked.href='/knowledgeos/practice?'+new URLSearchParams({session:item.term_session_id});else linked.removeAttribute('href');
  if(reset){
    $('review-reason').value=item.state.wrong_reason;$('review-mastery').value=item.state.mastery_state;$('review-date').value=inputDate(item.state.next_review_at);
  }
}
function renderLists(){
  const filter=$('review-filter').value;
  const visible=items.filter(item=>!filter||item.classification===filter);
  $('review-questions').replaceChildren();$('review-empty').hidden=visible.length!==0;
  for(const item of visible){
    const node=document.createElement('button');node.type='button';node.textContent=groups[item.classification]+' · '+item.question.prompt;
    node.dataset.questionId=item.question.id;node.dataset.classification=item.classification;
    node.setAttribute('aria-current',String(item.question.id===selected));
    node.onclick=()=>{if(!busy){selected=item.question.id;renderItem();renderLists()}};
    put($('review-questions'),node);
  }
  $('review-queue').replaceChildren();$('review-no-queue').hidden=queue.length!==0;
  for(const item of queue){
    const link=document.createElement('a');link.href='/knowledgeos/practice?'+new URLSearchParams({session:item.session_id});
    link.textContent=formatDate(item.next_review_at)+' · '+item.title;link.dataset.questionId=item.question_id;put($('review-queue'),link);
  }
}
async function load(){
  if(polling)return;polling=true;const g=epoch,previous=choice()?.state.revision;
  try{
    const [review,questionBank,profile]=await Promise.all([http(api),http(bank),http('/knowledge/v1/me')]);
    if(g!==epoch)return;
    if(review.actor_id!==profile.id||questionBank.actor_id!==profile.id||actor&&actor!==profile.id){clear();status(errors.ACTOR_CHANGED);return}
    if(!actor)status('');
    actor=profile.id;items=review.items;queue=review.review_queue;
    authored=questionBank.questions.filter(question=>question.author_id===actor&&question.origin_kind==='author');
    $('review-tracks').textContent=profile.learning_tracks.map(value=>tracks[value]||value).join('、')||'尚未设置学习方向';
    $('review-goal').textContent=profile.goal_text||'尚未填写个人目标';
    $('review-login').hidden=true;$('review-workspace').hidden=false;
    const next=JSON.stringify([items,queue,authored]);
    if(next===signature)return;signature=next;
    if(selected&&!choice()){clearOwn();status('原作答或来源当前不可访问。')}
    const select=$('review-author-question'),old=select.value;
    select.replaceChildren(option('选择自建题目',''),...authored.map(question=>option(question.prompt+' · 版本 '+question.version,question.id)));
    if(authored.some(question=>question.id===old))select.value=old;else clearAuthor();
    $('review-author').hidden=authored.length===0;
    renderLists();if(selected)renderItem(previous!==choice()?.state.revision);
  }catch(error){
    if(g!==epoch)return;
    clear();$('review-login').hidden=error.status!==401;status(errors[error.message]||'暂时无法读取复习记录。');
  }finally{polling=false}
}
async function chooseAuthor(){
  clearAuthor();const id=$('review-author-question').value,g=epoch,token=managedToken;
  if(!id||!actor)return;
  try{
    const result=await http(bank+'/'+id+'/author');
    if(g!==epoch||token!==managedToken)return;
    if(result.actor_id!==actor){clear();status(errors.ACTOR_CHANGED);return}
    if(!authored.some(question=>question.id===id&&question.version_id===result.question.version_id))return;
    managed=result.question;const answer=result.feedback.accepted_answer;
    $('review-old-rubric').textContent='当前版本 '+managed.version+' · 标准答案 '+(Array.isArray(answer)?answer.join('、'):typeof answer==='boolean'?(answer?'正确':'错误'):String(answer));
    $('review-answer-label').textContent=managed.kind==='choice'?'新标准答案序号':managed.kind==='judgment'?'新标准答案（正确或错误）':'新标准答案（每行一个）';
    $('review-explanation').value=result.feedback.explanation;$('review-correction').hidden=false;
  }catch(error){if(g===epoch&&token===managedToken)status(errors[error.message]||'无法读取题目复核信息。')}
}
async function write(path,method,data){
  if(!actor||busy)return;
  const g=epoch,user=actor,digest=JSON.stringify([path,method,data]);
  if(receipt?.digest!==digest)receipt={digest,key:crypto.randomUUID()};
  busy=true;$('review-fields').disabled=$('review-correction-fields').disabled=true;status('正在保存…');
  try{
    const result=await http(path,{method,headers:{'content-type':'application/json','x-knowledgeos-request':'1',
      'x-knowledgeos-reader-actor':user,'idempotency-key':receipt.key},body:JSON.stringify(data)});
    if(g!==epoch)return;
    if(result.actor_id!==actor){clear();status(errors.ACTOR_CHANGED);return}
    receipt=null;await load();
    if(g!==epoch)return;
    if(result.correction){await chooseAuthor();status('已发布修订，受影响的个人判定已重算。')}
    else status('个人复习安排已保存。');
  }catch(error){
    if(g!==epoch)return;
    status(errors[error.message]||'保存失败，可重试本次请求。');
    if([401,404,409].includes(error.status))await load();
  }finally{if(g===epoch){busy=false;$('review-fields').disabled=$('review-correction-fields').disabled=false}}
}
$('review-filter').onchange=renderLists;$('review-author-question').onchange=()=>void chooseAuthor();
$('review-form').onsubmit=event=>{
  event.preventDefault();const item=choice();if(!item)return;
  const date=$('review-date').value;
  void write(states+'/'+item.question.id,'PATCH',{expected_revision:item.state.revision,wrong_reason:$('review-reason').value,
    mastery_state:$('review-mastery').value,next_review_at:date?new Date(date).toISOString():null});
};
$('review-correction').onsubmit=event=>{
  event.preventDefault();if(!managed)return;
  const raw=$('review-answer').value.trim();let answer;
  if(managed.kind==='choice')answer=Number(raw);
  else if(managed.kind==='judgment'){
    if(!['正确','错误','true','false'].includes(raw)){status('请输入正确或错误。');return}
    answer=raw==='正确'||raw==='true';
  }else answer=raw.split(/\\r?\\n/u).map(value=>value.trim()).filter(Boolean);
  void write(bank+'/'+managed.id+'/corrections','POST',{expected_version:managed.version,answer,explanation:$('review-explanation').value,reason:$('review-correction-reason').value});
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
window.addEventListener('focus',()=>void load());window.addEventListener('pagehide',clear);
window.addEventListener('pageshow',event=>{if(event.persisted)void load()});
setInterval(()=>{if(!document.hidden)void load()},1750);void load();
</script></body></html>`
}
