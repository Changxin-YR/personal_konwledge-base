export function buildOntologyHtml(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>知识关系 · KnowledgeOS</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f6faf8;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}[hidden]{display:none!important}
header{background:white;border-bottom:1px solid #cbdcd5}nav,main{max-width:1120px;margin:auto;padding:14px 22px}nav,.actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
a{color:#146255;text-underline-offset:3px}h1,h2,h3,p{margin:0 0 8px}h1{font-size:26px}h2{font-size:19px}h3{font-size:16px}
.layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:22px}.card{padding:16px;background:#fff;border:1px solid #cbdcd5;border-radius:8px;margin-bottom:14px}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}fieldset{display:grid;gap:8px;padding:0;border:0;margin:0;min-width:0}
label{display:grid;gap:3px}input,select,button{font:inherit;color:inherit;background:white;border:1px solid #90aaa1;border-radius:5px;padding:6px 9px;min-width:0;max-width:100%}
button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button[type=submit]{background:#225f51;color:white;border-color:#225f51}
button[aria-current=true]{background:#e1efe9}ul{list-style:none;padding:0;margin:0}li{margin-bottom:5px;overflow-wrap:anywhere}
#relation-facts button{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;text-align:center}
.node{padding:4px 8px;background:#e7f2ee;border-radius:4px;overflow-wrap:anywhere}.edge-label{color:#195f51;font-weight:600}
#relation-list button{width:100%;text-align:left;overflow-wrap:anywhere}#relation-status{min-height:1.6em}.subtle,small{color:#46685f}
:focus-visible{outline:2px solid #1d7392;outline-offset:2px}
@media(max-width:700px){main,nav{padding:12px 14px}.layout{grid-template-columns:minmax(0,1fr)}}
@media(max-width:400px){.pair{grid-template-columns:minmax(0,1fr)}#relation-facts button{gap:4px}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/knowledge">知识条目</a><a href="/knowledgeos/ontology" aria-current="page">知识关系</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>知识关系</h1><p id="relation-status" role="status">正在读取…</p><a id="relation-login" href="/knowledgeos/account" hidden>登录</a>
<div id="relation-workspace" class="layout" hidden><section>
<section class="card"><h2>已确认关系图</h2><p id="relation-graph-empty" class="subtle">暂无已确认且来源有效的关系。</p><ul id="relation-facts" aria-label="已确认关系图"></ul></section>
<section class="card"><h2>关系列表</h2><p id="relation-list-empty" class="subtle">暂无关系。</p><ul id="relation-list"></ul></section>
<section class="card" id="relation-detail" hidden><h2 id="relation-title"></h2><p id="relation-state"></p><p id="relation-proposal"></p><p id="relation-review"></p>
<h3>固定证据</h3><ul id="relation-witnesses"></ul>
<div class="actions"><button id="relation-confirm" type="button">确认关系</button><button id="relation-reject" type="button">拒绝关系</button><button id="relation-correct" type="button">纠正关系</button></div>
<h3>修订历史</h3><ul id="relation-history"></ul></section>
</section><section class="card"><h2 id="relation-form-title">提出关系</h2><form id="relation-form"><fieldset id="relation-fields">
<div class="pair"><label>起点<select id="relation-from" required></select></label><label>终点<select id="relation-to" required></select></label></div>
<label>关系类型<select id="relation-type"></select></label><p id="relation-rule" class="subtle"></p>
<label>资料引用编号<input id="relation-evidence" required maxlength="160" aria-describedby="relation-evidence-help"></label>
<small id="relation-evidence-help">填写 Reader 中固定引用的编号。多个编号可用空格或逗号隔开。</small>
<div class="actions"><button id="relation-submit" type="submit">提交关系</button><button id="relation-ai" type="button" aria-describedby="relation-ai-help">请 AI 建议</button><button id="relation-cancel" type="button" hidden>取消纠正</button></div>
<small id="relation-ai-help">AI 建议会将所选条目的标题、正文片段和引用选区发给已配置的模型。</small>
</fieldset></form></section></div></main><script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id), api='/knowledge/v1/ontology', entries='/knowledge/v1/knowledge-items';
const states={proposed:'待确认',confirmed:'已确认',rejected:'已拒绝',needs_review:'待复核'};
const kinds={term:'术语',concept:'概念',case:'案例',solution:'方案'};
const actions={confirm:'已确认',reject:'已拒绝',correct:'已提出纠正'};
const errors={INVALID_RELATION_INPUT:'请核对条目、关系类型和引用编号。',RELATION_RULE_VIOLATION:'所选方向、类型或领域不符合关系规则。',RELATION_NOT_FOUND:'关系、条目或证据当前不可访问。',RELATION_NODE_UNCONFIRMED:'请先确认条目的当前版本。',RELATION_SOURCE_CHANGED:'条目、引用或规则已变化，请核对后重新提交。',DUPLICATE_RELATION:'已存在相同的关系。',REVISION_CONFLICT:'此关系已更新，请查看最新修订。',INVALID_RELATION_REVIEW_STATE:'此版本不能执行该审核操作。',RELATION_EVIDENCE_INSUFFICIENT:'所选证据不足以建议关系。',MODEL_NOT_CONFIGURED:'当前没有可用的模型。',MODEL_OUTPUT_INVALID:'模型建议无法验证。',AUTH_REQUIRED:'请登录后继续。',ACTOR_CHANGED:'登录身份已变化，请刷新。'};
const status=value=>$('relation-status').textContent=value;
const ruleFor=type=>rules.find(rule=>rule.id===type);
const labelFor=type=>ruleFor(type)?.label||type;
const arrowFor=type=>ruleFor(type)?.direction==='symmetric'?'↔':'→';
let actor=null,rules=[],items=[],rows=[],facts=[],selected=null,historical=null,correction=null,revisions=[];
let busy=false,polling=false,epoch=0,selection=0,snapshot='',receipt=null,request=null,sourceQuery=new URLSearchParams(location.search).get('citation');
function option(text,value){const el=document.createElement('option');el.value=value;el.textContent=text;return el}
function child(id,text,classes){const el=document.createElement(id);el.textContent=text;if(classes)el.className=classes;return el}
function listButton(list,button){const li=document.createElement('li');li.append(button);list.append(li)}
function url(id){return api+'/relations/'+id}
async function http(path,init={}){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',...init});
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.data){const error=new Error(body?.code||'ONTOLOGY_UNAVAILABLE');error.status=response.status;throw error}
  return body.data
}
function clearDetail(){
  selection++;selected=historical=correction=null;revisions=[];
  $('relation-detail').hidden=true;
  for(const id of ['relation-title','relation-state','relation-proposal','relation-review','relation-witnesses','relation-history'])$(id).replaceChildren()
}
function clear(){
  epoch++;actor=null;snapshot='';items=[];rows=[];facts=[];rules=[];busy=false;receipt=null;
  request?.abort();request=null;clearDetail();$('relation-form').reset();
  for(const id of ['relation-from','relation-to','relation-type','relation-list','relation-facts'])$(id).replaceChildren();
  $('relation-workspace').hidden=true
}
function typeOptions(){
  const from=items.find(item=>item.id===$('relation-from').value),to=items.find(item=>item.id===$('relation-to').value);
  const select=$('relation-type'), prior=select.value;
  const available=from&&to&&from.id!==to.id?rules.filter(rule=>rule.from_kinds.includes(from.kind)&&rule.to_kinds.includes(to.kind)&&
    (!rule.same_domain||from.domain===to.domain)&&(!rule.same_kind||from.kind===to.kind)):[];
  select.replaceChildren(option('选择规则',''),...available.map(rule=>option(rule.label,rule.id)));
  if(available.some(rule=>rule.id===prior))select.value=prior;
  if(!select.value&&available.length===1)select.value=available[0].id;
  syncControls()
}
function itemOptions(){
  for(const id of ['relation-from','relation-to']){
    const select=$(id), prior=select.value;
    select.replaceChildren(option('选择条目',''),...items.map(item=>option(item.title+' · '+kinds[item.kind],item.id)));
    if(items.some(item=>item.id===prior))select.value=prior;
  }
  typeOptions()
}
function syncControls(){
  const rule=ruleFor($('relation-type').value), complete=$('relation-type').options.length>1;
  $('relation-fields').disabled=busy;
  $('relation-form-title').textContent=correction?'纠正关系':'提出关系';
  $('relation-submit').textContent=correction?'保存纠正并待确认':'提交关系';
  $('relation-submit').disabled=!rule;
  $('relation-ai').hidden=$('relation-ai-help').hidden=!!correction;
  $('relation-ai').disabled=!complete;
  $('relation-cancel').hidden=!correction;
  $('relation-rule').textContent=rule?(rule.direction==='symmetric'?'双向':'有方向')+' · 规则版本 '+rule.version:complete?'选择要提出的关系类型。':'选择两个符合规则的已确认条目。';
  const now=rows.find(row=>row.id===selected?.id);
  const enabled=!busy&&now&&(!historical||historical===now.revision);
  $('relation-confirm').disabled=!enabled||now?.state!=='proposed';
  $('relation-reject').disabled=!enabled||now?.state==='rejected';
  $('relation-correct').disabled=!enabled||!!correction;
}
function mark(){
  for(const button of document.querySelectorAll('[data-relation-id]'))
    button.setAttribute('aria-current',String(button.dataset.relationId===selected?.id))
}
function renderLists(){
  $('relation-list').replaceChildren();$('relation-facts').replaceChildren();
  $('relation-list-empty').hidden=rows.length!==0;$('relation-graph-empty').hidden=facts.length!==0;
  for(const row of rows){
    const button=child('button',row.from.title+' '+labelFor(row.relation_type)+' '+arrowFor(row.relation_type)+' '+row.to.title+' · '+states[row.state]);
    bindEdge(button,row);listButton($('relation-list'),button);
  }
  for(const row of facts){
    const button=document.createElement('button'), label=labelFor(row.relation_type), arrow=arrowFor(row.relation_type);
    button.append(child('span',row.from.title,'node'),child('span',label+' '+arrow,'edge-label'),child('span',row.to.title,'node'));
    button.setAttribute('aria-label',row.from.title+' '+label+' '+arrow+' '+row.to.title);
    bindEdge(button,row);listButton($('relation-facts'),button);
  }
  mark()
}
function bindEdge(button,row){button.type='button';button.dataset.relationId=row.id;button.dataset.revision=String(row.revision);button.onclick=()=>void open(row.id)}
function paint(row){
  $('relation-detail').hidden=false;
  $('relation-title').textContent=row.from.title+' '+labelFor(row.relation_type)+' '+arrowFor(row.relation_type)+' '+row.to.title;
  $('relation-state').textContent=states[row.state]+' · 修订 '+row.revision+' · 规则版本 '+row.relation_type_version;
  $('relation-proposal').textContent=row.proposal.kind==='ai'?'AI 原始建议 · '+row.proposal.model+' · '+row.proposal.reason:'人工提出';
  $('relation-review').textContent=row.review?actions[row.review.action]+' · '+new Date(row.review.at).toLocaleString('zh-CN'):'等待人工审核';
  $('relation-witnesses').replaceChildren();
  for(const source of row.evidence){
    const link=child('a',(source.state==='changed'?'来源已换版，查看原引用':'查看原引用')+' · '+source.id);link.href=source.href;
    listButton($('relation-witnesses'),link);
  }
  $('relation-history').replaceChildren();
  for(const version of revisions){
    const button=child('button','修订 '+version.revision+' · '+states[version.recorded_state]);
    button.type='button';button.setAttribute('aria-current',String(version.revision===row.revision));
    button.onclick=()=>void open(row.id,version.revision);
    listButton($('relation-history'),button);
  }
  mark();syncControls()
}
async function open(id,revision=null){
  const g=epoch, token=++selection;
  if(selected?.id!==id){
    if(correction){$('relation-form').reset();typeOptions()}
    correction=null
  }
  selected={id};historical=revision;$('relation-detail').hidden=true;mark();syncControls();
  try{
    const [result, history]=await Promise.all([http(url(id)+(revision?'/versions/'+revision:'')),http(url(id)+'/versions')]);
    if(g!==epoch||token!==selection)return;
    if(result.actor_id!==actor||history.actor_id!==actor){clear();status(errors.ACTOR_CHANGED);return}
    selected=result.relation;revisions=history.versions;paint(selected);
  }catch(error){if(g===epoch&&token===selection){clearDetail();status(errors[error.message]||'无法读取关系。')}}
}
async function load(quiet=false){
  if(polling)return;polling=true;const g=epoch;
  try{
    const [catalog,list,knowledge]=await Promise.all([http(api+'/types'),http(api+'/relations'),http(entries)]);
    if(g!==epoch)return;
    if(catalog.actor_id!==list.actor_id||catalog.actor_id!==knowledge.actor_id){clear();status(errors.ACTOR_CHANGED);return}
    if(actor&&catalog.actor_id!==actor){clear();status(errors.ACTOR_CHANGED);return}
    const next=JSON.stringify([catalog.types,list.relations,list.facts,knowledge.items]);
    actor=catalog.actor_id;$('relation-login').hidden=true;$('relation-workspace').hidden=false;
    if(!quiet)status('');
    if(next===snapshot)return;
    snapshot=next;rules=catalog.types;rows=list.relations;facts=list.facts;
    items=knowledge.items.filter(item=>item.confirmation_state==='confirmed');
    const current=rows.find(row=>row.id===selected?.id);
    if(selected&&!current){clearDetail();$('relation-form').reset();status('当前关系或证据已不可访问。')}
    if(sourceQuery&&/^[a-f0-9-]{36}$/.test(sourceQuery))$('relation-evidence').value=sourceQuery;
    sourceQuery=null;
    itemOptions();renderLists();
    if(current&&selected.version_id&&current.version_id!==selected.version_id&&!historical)void open(current.id);
    else if(current&&selected.version_id&&current.state!==selected.state)void open(current.id,historical);
  }catch(error){
    if(epoch!==g)return;
    clear();$('relation-login').hidden=error.status!==401;
    status(errors[error.message]||'暂时无法读取知识关系。');
  }finally{polling=false}
}
function data(){
  return {from_id:$('relation-from').value,to_id:$('relation-to').value,
    evidence_citation_ids:$('relation-evidence').value.trim().split(/[\\s,，]+/u).filter(Boolean)}
}
async function write(path,payload){
  if(busy||!actor)return;
  const g=epoch, user=actor, digest=JSON.stringify([path,payload]);
  if(receipt?.digest!==digest)receipt={digest,key:crypto.randomUUID()};
  const controller=new AbortController();request=controller;busy=true;syncControls();status('正在提交…');
  try{
    const result=await http(path,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','x-knowledgeos-request':'1',
      'x-knowledgeos-reader-actor':user,'idempotency-key':receipt.key},body:JSON.stringify(payload)});
    if(g!==epoch)return;
    if(result.actor_id!==actor){clear();status(errors.ACTOR_CHANGED);return}
    receipt=null;correction=null;
    await load(true);
    if(g!==epoch)return;
    await open(result.relation.id);
    if(g===epoch&&selected?.version_id)status(states[selected.state]+' · 修订 '+selected.revision);
  }catch(error){
    if(g!==epoch)return;
    status(errors[error.message]||'提交失败，请重试。');
    if([401,404,409].includes(error.status))await load(true);
  }finally{if(g===epoch){request=null;busy=false;syncControls()}}
}
function review(action){
  if(!selected)return;
  void write(url(selected.id)+'/review',{expected_revision:selected.revision,action})
}
$('relation-from').onchange=$('relation-to').onchange=typeOptions;
$('relation-type').onchange=syncControls;
$('relation-form').onsubmit=event=>{
  event.preventDefault();const draft={...data(),relation_type:$('relation-type').value};
  if(correction)void write(url(correction.id)+'/review',{...draft,action:'correct',expected_revision:correction.revision});
  else void write(api+'/relations',draft);
};
$('relation-ai').onclick=()=>{if($('relation-form').reportValidity())void write(api+'/proposals',data())};
$('relation-confirm').onclick=()=>review('confirm');$('relation-reject').onclick=()=>review('reject');
$('relation-correct').onclick=()=>{
  if(!selected?.version_id)return;
  correction={id:selected.id,revision:selected.revision};
  $('relation-from').value=selected.from.id;$('relation-to').value=selected.to.id;typeOptions();$('relation-type').value=selected.relation_type;
  $('relation-evidence').value=selected.evidence.map(source=>source.id).join(', ');
  syncControls();$('relation-from').focus();
};
$('relation-cancel').onclick=()=>{correction=null;$('relation-form').reset();typeOptions()};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load(true)});
window.addEventListener('focus',()=>void load(true));
window.addEventListener('pagehide',()=>clear());window.addEventListener('pageshow',event=>{if(event.persisted)void load()});
setInterval(()=>{if(!document.hidden)void load(true)},1750);void load();
</script></body></html>`
}
