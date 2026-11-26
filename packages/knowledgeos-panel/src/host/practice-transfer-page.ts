export function buildPracticeTransferHtml(nonce:string){
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>迁移复测 · KnowledgeOS</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f6faf8;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}[hidden]{display:none!important}
header{background:white;border-bottom:1px solid #cbdcd5}nav,main{max-width:1120px;margin:auto;padding:14px 22px}nav,.row{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
a{color:#146255;text-underline-offset:3px}h1,h2,h3,p{margin:0 0 8px}h1{font-size:26px}h2{font-size:19px}h3{font-size:16px}
.layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:20px}.card{padding:16px;background:white;border:1px solid #cbdcd5;border-radius:8px;margin-bottom:14px;overflow-wrap:anywhere}
fieldset{display:grid;gap:9px;border:0;padding:0;margin:0;min-width:0}label{display:grid;gap:4px}
input,select,button{max-width:100%;min-width:0;font:inherit;color:inherit;background:white;border:1px solid #90aaa1;border-radius:5px;padding:6px 9px}
button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button[type=submit]{background:#225f51;color:white;border-color:#225f51}button[aria-current=true]{background:#e1efe9}
ul{list-style:none;margin:0;padding:0}li{margin-bottom:5px}#transfer-list button{width:100%;text-align:left}
dl{margin:10px 0}dt{font-weight:600}dd{margin:0 0 5px}#transfer-status{min-height:1.6em}.subtle{color:#46685f}
:focus-visible{outline:2px solid #1d7392;outline-offset:2px}@media(max-width:680px){main,nav{padding:12px 14px}.layout{grid-template-columns:minmax(0,1fr)}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/practice">题库与练习</a><a href="/knowledgeos/review">错题与复习</a><a href="/knowledgeos/transfer" aria-current="page">迁移复测</a></nav></header>
<main><h1>迁移复测</h1><p id="transfer-status" role="status">正在读取…</p><a id="transfer-login" href="/knowledgeos/account" hidden>登录</a>
<div id="transfer-workspace" class="layout" hidden><section>
<section class="card"><h2>我的迁移安排</h2><p id="transfer-empty" class="subtle">暂无复测安排。</p><ul id="transfer-list"></ul></section>
<section class="card"><h2>安排延后复测</h2><form id="transfer-form"><fieldset id="transfer-fields">
<label>原独立与提示练习<select id="transfer-primary" required></select></label>
<label>相同声明难度的其他题目<select id="transfer-target" required></select></label>
<label>最早开放时间<input type="datetime-local" required id="transfer-available"></label>
<button id="transfer-plan" type="submit">保存安排</button></fieldset></form></section></section>
<section class="card" id="transfer-detail" hidden><h2 id="transfer-title"></h2><p id="transfer-facts"></p>
<dl><dt>独立首答</dt><dd id="transfer-first"></dd><dt>提示后作答</dt><dd id="transfer-guided"></dd><dt>迁移作答</dt><dd id="transfer-observed"></dd></dl>
<p id="transfer-evidence"></p><div class="row"><button id="transfer-start" type="button">开始独立复测</button><a id="transfer-practice" hidden>打开复测记录</a></div>
</section></div></main>
<script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id),api='/knowledge/v1/me/transfer-practice',sessionsApi='/knowledge/v1/practice-sessions';
const states={scheduled:'等待开放',ready:'可开始',started:'进行中',observed:'已记录',limited:'证据受限'};
const grades={correct:'正确',incorrect:'错误',disputed:'待复核'},bands={basic:'基础',intermediate:'进阶',advanced:'高级'};
const errors={TRANSFER_NOT_DUE:'复测尚未到开放时间。',TRANSFER_EVIDENCE_INSUFFICIENT:'需先完成独立首答以及保留答案未揭示时的提示后正确作答。',
  TRANSFER_NEEDS_GUIDED_PRACTICE:'请选择独立与提示练习。',TRANSFER_NOT_COMPARABLE:'请选择题型和声明难度相同的题目。',
  TRANSFER_CONTEXT_REQUIRED:'请选择另一种情境和不同固定引用。',TRANSFER_PRIOR_EXPOSURE:'此题已接触答案或提示，请另选迁移题。',
  TRANSFER_QUESTION_DISPUTED:'有关题目的评价已因争议暂停。',TRANSFER_NEEDS_REVIEWED_SOURCE:'请选用有固定来源的人工题目。',
  QUESTION_VERSION_CHANGED:'有关题目版本已修订，本次复测证据受限。',TRANSFER_DELAY_REQUIRED:'开放时间应晚于当前时间。',
  QUESTION_NOT_FOUND:'题目或引用当前不可访问。',PRACTICE_NOT_FOUND:'复测当前不可访问。',TRANSFER_RESULT_INSUFFICIENT:'该次作答缺少可核查的独立证据。',
  AUTH_REQUIRED:'请登录。',ACTOR_CHANGED:'登录身份已变化，请刷新。'};
const status=value=>$('transfer-status').textContent=value;
const option=(label,value)=>{const node=document.createElement('option');node.textContent=label;node.value=value;return node};
const asLocal=value=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const when=value=>new Date(value).toLocaleString('zh-CN');
let actor=null,items=[],selected=null,busy=false,polling=false,epoch=0,receipt=null,signature='';
const current=()=>items.find(item=>item.id===selected);
async function http(path,init={}){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(6000),...init});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.data){const error=new Error(json?.code||'PRACTICE_UNAVAILABLE');error.status=response.status;throw error}
  return json.data;
}
function clearDetail(){
  selected=null;$('transfer-detail').hidden=true;
  for(const id of ['transfer-title','transfer-facts','transfer-first','transfer-guided','transfer-observed','transfer-evidence'])$(id).textContent='';
  $('transfer-practice').removeAttribute('href');
}
function clear(){
  epoch++;actor=null;items=[];receipt=null;signature='';busy=false;clearDetail();
  $('transfer-workspace').hidden=true;$('transfer-fields').disabled=false;$('transfer-form').reset();
  for(const id of ['transfer-list','transfer-primary','transfer-target'])$(id).replaceChildren();
}
function observation(value){
  return value?grades[value.grading_state]+' · '+(value.independent?'独立':'有辅助')+' · '+when(value.submitted_at):'尚未作答';
}
function paint(){
  const item=current();if(!item){clearDetail();return}
  $('transfer-detail').hidden=false;$('transfer-title').textContent=item.target_title;
  $('transfer-facts').textContent=states[item.status]+' · '+bands[item.difficulty]+' · '+when(item.available_at);
  $('transfer-first').textContent=observation(item.first_observation);
  $('transfer-guided').textContent=observation(item.guided_observation);
  $('transfer-observed').textContent=observation(item.transfer_observation);
  $('transfer-evidence').textContent=errors[item.limit_reason]||(item.evidence_state==='independent_transfer_supported'?'已记录本次独立迁移成功。':
    item.evidence_state==='not_demonstrated'?'本次作答未证明迁移成功。':'等待可核查的迁移作答。');
  $('transfer-start').disabled=busy||item.status!=='ready';
  $('transfer-practice').hidden=!item.started_session_id||item.status==='limited';
  if(!$('transfer-practice').hidden)$('transfer-practice').href='/knowledgeos/practice?'+new URLSearchParams({session:item.started_session_id});
  else $('transfer-practice').removeAttribute('href');
}
function render(){
  const list=$('transfer-list');list.replaceChildren();$('transfer-empty').hidden=items.length!==0;
  for(const item of items){
    const node=document.createElement('button'),li=document.createElement('li');
    node.type='button';node.dataset.transferId=item.id;node.textContent=states[item.status]+' · '+item.target_title;
    node.setAttribute('aria-current',String(item.id===selected));node.onclick=()=>{if(!busy){selected=item.id;render()}};
    li.append(node);list.append(li);
  }
  paint()
}
function choices(id,values,label){
  const select=$(id),previous=select.value;select.replaceChildren(option(label,''),...values.map(value=>option(value.title,value.id)));
  if(values.some(value=>value.id===previous))select.value=previous;
}
async function load(){
  if(polling)return;polling=true;const g=epoch;
  try{
    const [plans,history,bank]=await Promise.all([http(api),http(sessionsApi),http('/knowledge/v1/questions')]);
    if(g!==epoch)return;
    if(plans.actor_id!==history.actor_id||plans.actor_id!==bank.actor_id||actor&&actor!==plans.actor_id){clear();status(errors.ACTOR_CHANGED);return}
    if(!actor)status('');
    actor=plans.actor_id;items=plans.items;$('transfer-workspace').hidden=false;$('transfer-login').hidden=true;
    if(!$('transfer-available').value)$('transfer-available').value=asLocal(Date.parse(plans.server_time)+86400000);
    const guides=history.sessions.filter(session=>session.mode==='guided');
    const targets=bank.questions.filter(question=>question.origin_kind==='author'&&!question.has_open_dispute&&question.author_id!==actor)
      .map(question=>({id:question.version_id,title:question.prompt+' · '+bands[question.difficulty]}));
    const next=JSON.stringify([plans.items,guides,targets]);
    if(next===signature)return;signature=next;
    choices('transfer-primary',guides,'选择原练习');choices('transfer-target',targets,'选择迁移题目');
    if(selected&&!current()){clearDetail();status('安排或来源当前不可访问。')}
    render();
  }catch(error){if(g===epoch){clear();$('transfer-login').hidden=error.status!==401;status(errors[error.message]||'无法读取迁移安排。')}}
  finally{polling=false}
}
async function write(path,data){
  if(!actor||busy)return;
  const g=epoch,user=actor,digest=JSON.stringify([path,data]);
  if(receipt?.digest!==digest)receipt={digest,key:crypto.randomUUID()};
  busy=true;$('transfer-fields').disabled=true;paint();status('正在提交…');
  try{
    const output=await http(path,{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1',
      'x-knowledgeos-reader-actor':user,'idempotency-key':receipt.key},body:JSON.stringify(data)});
    if(g!==epoch)return;
    if(output.actor_id!==actor){clear();status(errors.ACTOR_CHANGED);return}
    receipt=null;
    if(output.session){location.assign('/knowledgeos/practice?'+new URLSearchParams({session:output.session.id}));return}
    await load();if(g===epoch){selected=output.transfer.id;render();status('迁移复测安排已保存。')}
  }catch(error){if(g===epoch){status(errors[error.message]||'提交失败，可重试本次请求。');await load()}}
  finally{if(g===epoch){busy=false;$('transfer-fields').disabled=false;paint()}}
}
$('transfer-form').onsubmit=event=>{
  event.preventDefault();const date=$('transfer-available').value;if(!date)return;
  void write(api,{primary_session_id:$('transfer-primary').value,target_version_id:$('transfer-target').value,available_at:new Date(date).toISOString()})
};
$('transfer-start').onclick=()=>{const item=current();if(item?.status==='ready')void write(api+'/'+item.id+'/start',{})};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});window.addEventListener('focus',()=>void load());
window.addEventListener('pagehide',clear);window.addEventListener('pageshow',event=>{if(event.persisted)void load()});
setInterval(()=>{if(!document.hidden)void load()},1750);void load();
</script></body></html>`
}
