/** Private editor: all reads and writes go through the business session. */
export function buildNotesHtml(){return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>笔记 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8faf9;color:#223638;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}
header{background:#fff;border-bottom:1px solid #cedbd7}nav,main{max-width:1120px;margin:auto;padding:0 22px}nav,.tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}nav{min-height:54px;padding-block:8px}nav strong{color:#18565a;font-size:18px;margin-right:8px}
main{padding-block:22px}h1,h2,p{margin:0}h1{font-size:25px}h2{font-size:17px}a{color:#176166;text-underline-offset:3px}button,input,select,textarea{font:inherit;color:inherit}button,input,select,textarea{border:1px solid #8a9d99;border-radius:5px;background:#fff;padding:6px 9px}button{cursor:pointer;color:#215c5c}button:disabled{opacity:.58;cursor:default}button[type=submit]{background:#226461;color:#fff}button[aria-current=true]{background:#e1efea;border-color:#558b83}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid #176d92;outline-offset:2px}
.workspace{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,3fr);gap:22px;margin-top:18px}.sidebar{border-right:1px solid #cfdad7;padding-right:16px;min-width:0}ul{padding:0;margin:8px 0;list-style:none}li{border-bottom:1px solid #dce6e3;padding:7px 0;overflow-wrap:anywhere}#list button{text-align:left;width:100%;border-color:transparent;overflow-wrap:anywhere}#list button[aria-current=true]{border-color:#558b83}
label{display:grid;gap:4px;font-weight:600;min-width:0}input,select,textarea{width:100%;min-width:0}textarea{resize:vertical;min-height:16em}form,.stack{display:grid;gap:12px}fieldset{border:0;margin:0;padding:0;min-width:0}fieldset[disabled]{opacity:.7}section{border-top:1px solid #cfdad7;padding-top:14px}#status{min-height:1.6em;margin:6px 0;color:#526663}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;max-height:12em;overflow:auto}#conflict{border-left:3px solid #ad7542;padding-left:9px}#references li{display:flex;gap:10px;align-items:center;flex-wrap:wrap}small{color:#536866}#project-list{margin-bottom:0}[hidden]{display:none!important}
@media(max-width:670px){nav,main{padding-inline:14px}.workspace{grid-template-columns:1fr;gap:14px}.sidebar{border-right:0;border-bottom:1px solid #cfdad7;padding:0 0 12px}textarea{min-height:10em}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/notes" aria-current="page">笔记</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>笔记</h1><p id="status" role="status">正在读取…</p><div id="workspace" class="workspace" hidden>
<aside class="sidebar" aria-label="我的笔记"><button type="button" id="new">新建笔记</button><ul id="list"></ul><button type="button" id="more" hidden>更多笔记</button></aside>
<div class="stack"><form id="editor"><fieldset id="fields" class="stack"><label>标题<input id="title" maxlength="200" required></label>
<label>类型<select id="kind"><option value="plain">普通笔记</option><option value="reading">读书笔记</option><option value="project">项目随记</option><option value="reflection">个人复盘</option></select></label>
<label>正文<textarea id="body" maxlength="32000"></textarea></label><div class="tools"><button type="submit" id="save">保存笔记</button><small id="revision"></small></div></fieldset></form>
<section id="conflict" hidden><h2>服务器版本</h2><p id="latest-title"></p><pre id="latest-body"></pre><button type="button" id="rebase">保留草稿并使用此修订</button></section>
<section><h2>资料引用</h2><ul id="references"></ul></section>
<section id="project-section" hidden><h2>项目引用</h2><label>我的项目<select id="projects"><option value="">选择项目</option></select></label><div class="tools">
<button type="button" id="link-project" disabled>关联当前笔记</button><button type="button" id="more-projects" hidden>更多项目</button></div><ul id="project-list"></ul><button type="button" id="more-links" hidden>更多关联</button></section></div></div></main>
<script>
const $=id=>document.getElementById(id), path='/knowledge/v1/notes', q=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
let owner, note, rows=[], next=null, pending=null, key=null, conflict=null, projectsNext=null, linksNext=null;
let busy=false, locked=false, checking=false;
const status=text=>$('status').textContent=text;
const form=()=>({title:$('title').value,kind:$('kind').value,body:$('body').value});
const desired=q.get('note'), citation=q.get('citation');
function stop(message){
  locked=true;$('workspace').hidden=true;note=null;rows=[];pending=null;conflict=null;
  $('title').value=$('body').value=$('latest-title').textContent=$('latest-body').textContent='';
  for(const id of ['list','references','projects','project-list'])$(id).replaceChildren();status(message);
}
function error(code){const e=new Error(code);e.code=code;return e}
async function request(url,method='GET',body,extra={}){
  const r=await fetch(url,{method,cache:'no-store',redirect:'error',credentials:'same-origin',
    ...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json','x-knowledgeos-request':'1',...extra}}:{})});
  if(r.status===401||r.status===403){stop('会话不可用，请重新登录并刷新。');throw error('AUTH_REQUIRED')}
  const result=await r.json();if(!r.ok){if(result.code==='ACTOR_CHANGED')stop('账号已切换，请刷新笔记。');throw error(result.code)}
  if(url.startsWith(path)){
    if(result.data?.actor_id!==owner){stop('账号已切换，请刷新笔记。');throw error('ACTOR_CHANGED')}
    // The shared session cookie can change after this response was generated.
    await checkAccount();
  }
  if(locked)throw error('AUTH_REQUIRED');return result.data;
}
async function checkAccount(){const current=await request('/knowledge/v1/me');if(!uuid(current?.id)||owner&&owner!==current.id){stop('账号已切换，请刷新笔记。');throw error('ACTOR_CHANGED')}owner=current.id}
function enabled(){
  $('fields').disabled=busy||locked;$('new').disabled=busy;$('more').disabled=busy;
  $('save').disabled=!!conflict;$('rebase').disabled=busy;$('projects').disabled=busy;
  $('link-project').disabled=busy||!note||!$('projects').value;$('more-projects').disabled=busy;$('more-links').disabled=busy;
  for(const el of document.querySelectorAll('#list button,#references button,#project-list button'))el.disabled=busy;
}
async function action(work){
  if(busy||locked||checking)return;busy=true;enabled();
  try{await checkAccount();await work()}catch(e){
    if(!locked)status(({SOURCE_NOT_FOUND:'引用来源不可用，草稿仍保留。',PROJECT_NOT_FOUND:'项目不可用。',NOTE_NOT_FOUND:'笔记或关联不可用。',INVALID_NOTE:'无法保存，请检查标题和内容。'})[e.code]||'没有确认操作结果，可以刷新核对；草稿仍保留。');
  }finally{busy=false;enabled()}
}
function item(text,onClick){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=onClick;li.append(button);return li}
function renderList(){
  $('list').replaceChildren(...rows.map(r=>{
    const li=item(r.title,()=>action(()=>open(r.id)));li.firstChild.setAttribute('aria-current',String(note?.id===r.id));return li;
  }));$('more').hidden=!next;enabled();
}
function renderRefs(){
  $('references').replaceChildren();
  if(pending){const li=document.createElement('li');li.textContent='待保存的固定版本引用';$('references').append(li)}
  (note?.references||[]).forEach((r,i)=>{
    const li=item('移除引用',()=>action(()=>saveChanges({remove_reference:r.id},true)));
    const label=document.createElement(r.status==='linked'?'a':'span');label.textContent=r.status==='linked'?'原文引用 '+(i+1):'来源不可用';
    if(r.status==='linked'){label.href='/knowledgeos/reader?'+new URLSearchParams({asset:r.asset_id,version:r.version_id,citation:r.citation_id});label.target='_blank';label.rel='noopener noreferrer'}
    li.prepend(label);$('references').append(li);
  });
  if(!$('references').children.length){const li=document.createElement('li');li.textContent='暂无引用';$('references').append(li)}
}
function clearConflict(){conflict=null;$('conflict').hidden=true;$('latest-title').textContent=$('latest-body').textContent=''}
function showConflict(latest){conflict=latest.revision;$('latest-title').textContent=latest.title;$('latest-body').textContent=latest.body;$('conflict').hidden=false}
function apply(n,newCitation=null){
  note=n;pending=newCitation;key=null;clearConflict();$('title').value=n?.title??'';$('kind').value=n?.kind??(newCitation?'reading':'plain');$('body').value=n?.body??'';
  $('revision').textContent=n?'修订 '+n.revision:'未保存';renderList();renderRefs();
}
function dirty(){const d=form();return note?(d.title!==note.title||d.kind!==note.kind||d.body!==note.body):(d.title!==''||d.body!=='')}
function edits(d){return Object.fromEntries(Object.entries(d).filter(([key,value])=>value!==note[key]))}
async function open(id){if(dirty()&&!confirm('离开未保存的草稿？'))return;const n=await request(path+'/'+id);apply(n);history.replaceState(null,'','?note='+id);status('已打开笔记。')}
async function saveChanges(extra={},preserveDraft=false){
  if(conflict)return;
  const data={actor_id:owner,...(preserveDraft?{}:form()),...extra},draft=form();if(!note&&pending)data.add_citation=pending;
  try{
    let result;
    if(note){data.expected_revision=note.revision;result=await request(path+'/'+note.id,'PATCH',data)}
    else{const digest=JSON.stringify(data);if(key?.digest!==digest)key={digest,id:crypto.randomUUID()};result=await request(path,'POST',data,{'idempotency-key':key.id})}
    rows=[result,...rows.filter(r=>r.id!==result.id)];apply(result);
    if(preserveDraft){$('title').value=draft.title;$('body').value=draft.body;$('kind').value=draft.kind}
    history.replaceState(null,'','?note='+result.id);status('笔记已保存。');
  }catch(e){
    if(e.code!=='REVISION_CONFLICT'||!note)throw e;
    status('笔记已在另一处更新，草稿未覆盖服务器版本。');
    showConflict(await request(path+'/'+note.id));
  }
}
async function listMore(reset){const data=await request(path+(reset?'':'?after='+encodeURIComponent(next)));rows=reset?data.items:[...rows,...data.items.filter(i=>!rows.some(r=>r.id===i.id))];next=data.next;renderList()}
async function projectMore(reset){const data=await request(path+'/projects'+(reset?'':'?after='+encodeURIComponent(projectsNext)));projectsNext=data.next;
  for(const p of data.items){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('projects').append(o)}$('project-section').hidden=$('projects').options.length===1;$('more-projects').hidden=!projectsNext;
}
async function linkList(reset){
  const project=$('projects').value;
  if(reset){$('project-list').replaceChildren();$('more-links').hidden=true;linksNext=null}
  if(!project)return;
  const data=await request(path+'/projects/'+project+(reset?'':'?after='+encodeURIComponent(linksNext)));linksNext=data.next;
  $('project-list').append(...data.items.map(i=>item(i.title,()=>action(()=>open(i.id)))));$('more-links').hidden=!linksNext;
}
$('new').onclick=()=>action(()=>{if(dirty()&&!confirm('离开未保存的草稿？'))return;apply(null);history.replaceState(null,'','/knowledgeos/notes');status('新笔记。')});
$('more').onclick=()=>action(()=>listMore(false));$('more-projects').onclick=()=>action(()=>projectMore(false));$('more-links').onclick=()=>action(()=>linkList(false));
$('editor').onsubmit=e=>{e.preventDefault();void action(saveChanges)};
$('rebase').onclick=()=>action(async()=>{
  if(!conflict||!note)return;
  const changed=edits(form()),latest=await request(path+'/'+note.id);
  note={...note,references:latest.references};renderRefs();
  if(latest.revision!==conflict){showConflict(latest);status('服务器版本再次更新，草稿未覆盖。');return}
  apply(latest);for(const [key,value] of Object.entries(changed))$(key).value=value;
  status('已保留草稿，尚未保存。');
});
$('projects').onchange=()=>action(()=>linkList(true));
$('link-project').onclick=()=>action(async()=>{const project=$('projects').value;if(!note||!project)return;await request(path+'/projects/'+project,'POST',{actor_id:owner,note_id:note.id});await linkList(true);status('项目引用已保存。')});
async function checkVisible(){
  if(document.hidden||busy||locked||checking||!owner)return;checking=true;
  try{await checkAccount();if(note){const refreshed=await request(path+'/'+note.id);note={...note,references:refreshed.references};renderRefs()}$('workspace').hidden=false}
  catch{if(!locked)$('workspace').hidden=true}
  finally{checking=false;enabled()}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)$('workspace').hidden=true;else void checkVisible()});
setInterval(checkVisible,10000);
void action(async()=>{
  try{await listMore(true);await projectMore(true);
    if(uuid(desired)){const saved=await request(path+'/'+desired);apply(saved)}else apply(null,uuid(citation)?citation:null);
    $('workspace').hidden=document.hidden;status(note?'已打开笔记。':'新笔记。');
  }catch(e){if(e.code==='NOTE_NOT_FOUND'&&!locked){apply(null);$('workspace').hidden=document.hidden}throw e}
});
</script></body></html>`}
