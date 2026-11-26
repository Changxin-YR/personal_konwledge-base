export function buildKnowledgeHtml(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>知识条目 · KnowledgeOS</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f6faf8;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}[hidden]{display:none!important}
header{background:#fff;border-bottom:1px solid #cbdcd5}nav,main{max-width:1120px;margin:auto;padding:14px 22px}nav,.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px}nav strong{color:#20594c}a{color:#146255;text-underline-offset:3px}
h1,h2,p{margin:0 0 8px}h1{font-size:25px}h2{font-size:18px}.layout{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,3fr);gap:24px}
aside{border-right:1px solid #cfdfd8;padding-right:16px}ul{list-style:none;margin:8px 0;padding:0}li{margin-bottom:5px;overflow-wrap:anywhere}
button,input,select,textarea{font:inherit;color:inherit;border:1px solid #90aaa1;border-radius:5px;background:white;padding:6px 9px;min-width:0;max-width:100%}button{cursor:pointer}button:disabled{opacity:.6;cursor:default}
button[type=submit]{background:#225f51;color:white;border-color:#225f51}button[aria-current=true]{background:#e1efe9}
label{display:grid;gap:3px}input,textarea{width:100%}textarea{min-height:5rem}fieldset{padding:0;margin:0;border:0;min-width:0}
#entry-form fieldset{display:grid;gap:10px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:9px}
#entry-source{display:grid;grid-template-columns:minmax(7rem,1fr) minmax(0,3fr) minmax(5rem,1fr);gap:9px}#entry-status{min-height:1.6rem;color:#3d6659}
#entry-detail{margin-bottom:12px;border-bottom:1px solid #cfdfd8;padding-bottom:8px}#entry-list button{width:100%;text-align:left;overflow-wrap:anywhere}#entry-facts{overflow-wrap:anywhere;color:#436358}
:focus-visible{outline:2px solid #1d7392;outline-offset:2px}@media(max-width:650px){main,nav{padding:12px 14px}.layout,.pair,#entry-source{grid-template-columns:minmax(0,1fr)}aside{border:0;padding:0}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/notes">笔记</a><a href="/knowledgeos/knowledge" aria-current="page">知识条目</a><a href="/knowledgeos/ontology">知识关系</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>知识条目</h1><p id="entry-status" role="status">正在读取…</p><a href="/knowledgeos/account" id="entry-login" hidden>登录</a>
<div class="layout" id="entry-workspace" hidden><aside><div class="toolbar"><h2>我的条目</h2><button id="entry-new" type="button">新建</button></div><ul id="entry-list"></ul></aside>
<section><section id="entry-detail" hidden><h2 id="entry-current-name"></h2><p id="entry-facts"></p><div class="toolbar">
<label>版本<select id="entry-version"></select></label><button id="entry-confirm" type="button">确认当前版本</button></div><ul id="entry-evidence"></ul></section>
<form id="entry-form"><fieldset id="entry-fields">
<div class="pair"><label>条目类型<select id="entry-kind"><option value="term">术语</option><option value="concept">概念</option><option value="case">案例</option><option value="solution">方案</option></select></label>
<label>领域<select id="entry-domain"><option value="software_engineering">软件工程</option><option value="system_architecture">系统架构</option><option value="hardware_engineering">硬件工程</option><option value="ai_development">AI 开发</option></select></label></div>
<label>标题<input id="entry-title" maxlength="160" required></label><label>专业定义或正文<textarea id="entry-definition" maxlength="4000" required></textarea></label>
<div class="pair"><label>通俗说明<textarea id="entry-plain" maxlength="2000"></textarea></label><label>使用语境<textarea id="entry-context" maxlength="2000"></textarea></label></div>
<div id="entry-source"><label>来源<select id="entry-source-type"><option value="">原创</option><option value="citation">资料引用</option><option value="note">私人笔记</option><option value="term">个人术语</option></select></label>
<label id="entry-source-id-field" hidden>来源编号<input id="entry-source-id" maxlength="36"></label><label id="entry-source-revision-field" hidden>笔记修订<input type="number" id="entry-source-revision" min="1" step="1"></label></div>
<button id="entry-save" type="submit">保存草稿</button></fieldset></form></section></div></main>
<script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id), api='/knowledge/v1/knowledge-items', status=value=>$('entry-status').textContent=value;
const q=new URLSearchParams(location.search), at=/^[a-f0-9-]{36}$/, stateName={pending:'待确认',confirmed:'已确认'};
let actor=null,item=null,rows=[],otherSources=[],generation=0,selection=0,busy=false,polling=false,receipt=null,queryUsed=false;
const names={citation:'固定资料引用',note:'私人笔记来源',term:'模型辅助术语'};
const errors={INVALID_KNOWLEDGE_INPUT:'请核对标题、正文与来源编号。',KNOWLEDGE_ITEM_NOT_FOUND:'条目当前不可访问。',
 SOURCE_NOT_FOUND:'来源当前不可访问。',NOTE_NOT_FOUND:'笔记当前不可访问。',REVISION_CONFLICT:'当前版本已变化，请重新打开条目后处理。',
 KNOWLEDGE_SOURCE_CHANGED:'笔记来源已改版，请核对新修订或保持原证据。',ALREADY_CONFIRMED:'此版本已确认。',IDEMPOTENCY_CONFLICT:'请求内容已变更，请重新提交。'};
function syncForm(){
  const old=item&&!item.is_current, source=$('entry-source-type').value;
  $('entry-source-id-field').hidden=!source;$('entry-source-id').required=!!source;
  $('entry-source-revision-field').hidden=source!=='note';$('entry-source-revision').required=source==='note';
  $('entry-save').disabled=!!old||busy;$('entry-save').textContent=item?'保存新版本':'保存草稿';
  $('entry-confirm').disabled=!!old||busy||!item||item.confirmation_state==='confirmed';
  $('entry-kind').disabled=$('entry-domain').disabled=!!item;
  for(const id of ['entry-title','entry-definition','entry-plain','entry-context','entry-source-type','entry-source-id','entry-source-revision'])$(id).disabled=!!old;
}
function clearEntry(){
  selection++;item=null;otherSources=[];receipt=null;$('entry-form').reset();$('entry-detail').hidden=true;
  for(const id of ['entry-current-name','entry-facts','entry-evidence','entry-version'])$(id).replaceChildren();
  syncForm();
}
function clear(){
  generation++;actor=null;rows=[];busy=false;clearEntry();$('entry-list').replaceChildren();$('entry-workspace').hidden=true;
}
function lock(){
  clear();$('entry-login').hidden=false;status('请重新登录查看知识条目。');
}
async function request(path,method='GET',data){
  const epoch=generation;
  let headers={};
  if(method!=='GET'){
    const signature=path+JSON.stringify(data);
    if(!receipt||receipt.signature!==signature)receipt={signature,key:crypto.randomUUID()};
    headers={'Content-Type':'application/json','X-KnowledgeOS-Request':'1','X-KnowledgeOS-Reader-Actor':actor,'Idempotency-Key':receipt.key};
  }
  const response=await fetch(api+path,{method,headers,credentials:'same-origin',cache:'no-store',redirect:'error',body:data===undefined?undefined:JSON.stringify(data)});
  if(epoch!==generation||document.hidden)throw Error('STALE');
  const decoded=await response.json();
  if(epoch!==generation||document.hidden)throw Error('STALE');
  if(response.status===401||decoded.code==='ACTOR_CHANGED'||(response.ok&&actor&&actor!==decoded.data.actor_id)){
    lock();throw Error('STALE');
  }
  if(!response.ok)throw Object.assign(Error(decoded.code||'KNOWLEDGE_UNAVAILABLE'),{http:response.status});
  return decoded.data;
}
function error(e){
  if(e.message!=='STALE')status(errors[e.message]||'当前无法读取或保存知识条目。');
}
function listView(){
  const items=rows.map(entry=>{
    const row=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=entry.title;
    b.setAttribute('aria-current',String(item?.id===entry.id));b.onclick=()=>void action(()=>openEntry(entry.id));row.append(b);return row;
  });
  if(!items.length){const li=document.createElement('li');li.textContent='暂无知识条目';items.push(li)}
  $('entry-list').replaceChildren(...items);
}
async function list(){
  const data=await request('');actor=data.actor_id;rows=data.items;listView();$('entry-login').hidden=true;$('entry-workspace').hidden=false;
}
function rawSource(source){return {type:source.type,id:source.id,...(source.type==='note'?{revision:source.revision}:{})}}
function display(next,versions){
  item=next;otherSources=next.sources.slice(1).map(rawSource);receipt=null;
  $('entry-detail').hidden=false;$('entry-current-name').textContent=next.title;
  const confirmed=next.confirmed_by?' · 确认人 '+next.confirmed_by:'';
  $('entry-facts').textContent='版本 '+next.version+' · '+stateName[next.confirmation_state]+(next.source_kind==='original'?' · 原创':' · 有来源')+confirmed;
  $('entry-title').value=next.title;$('entry-definition').value=next.definition;$('entry-plain').value=next.plain_explanation;$('entry-context').value=next.context;
  $('entry-kind').value=next.kind;$('entry-domain').value=next.domain;
  const first=next.sources[0];$('entry-source-type').value=first?.type||'';$('entry-source-id').value=first?.id||'';$('entry-source-revision').value=first?.revision||'';
  $('entry-version').replaceChildren(...versions.map(v=>{
    const option=document.createElement('option');option.value=v.version;option.textContent='v'+v.version+' · '+stateName[v.confirmation_state];option.selected=v.version===next.version;return option;
  }));
  $('entry-evidence').replaceChildren(...next.sources.map(source=>{
    const li=document.createElement('li');li.textContent=names[source.type]+(source.title?' · '+source.title:'');
    if(source.state==='changed'){li.append(' · 原修订 '+source.revision+'，笔记已变更');return li}
    if(typeof source.href==='string'&&source.href.startsWith('/knowledgeos/')){
      const link=document.createElement('a');link.href=source.href;link.textContent='查看来源';li.append(' · ',link);
    }return li;
  }));
  listView();syncForm();
}
async function openEntry(id,version){
  const turn=++selection,g=generation;
  try{
    const history=await request('/'+id+'/versions'),data=await request('/'+id+(version?'/versions/'+version:''));
    if(g!==generation||turn!==selection)return;
    display(data.item,history.versions);status('');
  }catch(e){
    if(g===generation&&turn===selection&&[403,404].includes(e.http)){clearEntry();await list().catch(error)}
    throw e;
  }
}
async function action(work){
  if(busy||!actor)return;busy=true;syncForm();const g=generation;
  try{await work()}catch(e){error(e)}finally{if(g===generation){busy=false;syncForm()}}
}
function fromQuery(){
  if(queryUsed)return;queryUsed=true;
  for(const type of ['citation','note','term']){
    const id=q.get(type);if(!id||!at.test(id))continue;
    $('entry-source-type').value=type;$('entry-source-id').value=id;
    if(type==='note'&&/^[1-9][0-9]{0,15}$/.test(q.get('revision')||''))$('entry-source-revision').value=q.get('revision');
    if(type==='term')$('entry-kind').value='term';
    syncForm();return;
  }
}
function draft(){
  const type=$('entry-source-type').value;
  return {title:$('entry-title').value,definition:$('entry-definition').value,plain_explanation:$('entry-plain').value,context:$('entry-context').value,
    sources:[...(type?[{type,id:$('entry-source-id').value.trim(),...(type==='note'?{revision:Number($('entry-source-revision').value)}:{})}]:[]),...otherSources]};
}
async function write(confirm=false){
  if(item&&!item.is_current)return;
  const data=item?{expected_revision:item.version,...(confirm?{}:draft())}:{...draft(),domain:$('entry-domain').value,kind:$('entry-kind').value};
  const path=item?'/'+item.id+(confirm?'/confirm':'/versions'):'';
  const result=await request(path,'POST',data);
  await list();await openEntry(result.item.id);
  status(confirm?'当前版本已确认。':'条目版本已保存。');
}
async function restore(){
  if(document.hidden)return;
  try{await list();if(at.test(q.get('item')||''))await openEntry(q.get('item'),q.get('version'));else fromQuery();status('')}
  catch(e){error(e)}
}
async function recheck(){
  if(document.hidden||!actor||busy||polling)return;
  polling=true;const prior=item,g=generation;
  try{
    if(prior)await request('/'+prior.id+(prior.is_current?'':'/versions/'+prior.version));
    const data=await request('');
    if(g===generation){rows=data.items;listView()}
  }catch(e){
    if(g!==generation)return;
    if(prior===item&&[403,404,409].includes(e.http)){
      clearEntry();await list().catch(error);status('条目来源当前不可访问，内容已清除。');
    }else if(e.message!=='STALE')lock();
  }finally{polling=false}
}
$('entry-form').onsubmit=e=>{e.preventDefault();void action(()=>write())};
$('entry-confirm').onclick=()=>void action(()=>write(true));
$('entry-new').onclick=()=>{if(!busy){clearEntry();listView();status('');$('entry-title').focus()}};
$('entry-source-type').onchange=syncForm;
$('entry-version').onchange=()=>{if(item)void action(()=>openEntry(item.id,Number($('entry-version').value)))};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else void restore()});
window.addEventListener('pagehide',clear);
window.addEventListener('pageshow',e=>{if(e.persisted)void restore()});
window.addEventListener('focus',recheck);
setInterval(recheck,1300);void restore();
</script></body></html>`
}
