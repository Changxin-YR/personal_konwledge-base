/** Private editor: all reads and writes go through the business session. */
export function buildNotesHtml(){return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>笔记 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8faf9;color:#223638;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}
header{background:#fff;border-bottom:1px solid #cedbd7}nav,main{max-width:1120px;margin:auto;padding:0 22px}nav,.tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}nav{min-height:54px;padding-block:8px}nav strong{color:#18565a;font-size:18px;margin-right:8px}
main{padding-block:22px}h1,h2,p{margin:0}h1{font-size:25px}h2{font-size:17px}a{color:#176166;text-underline-offset:3px}button,input,select,textarea{font:inherit;color:inherit}button,input,select,textarea{border:1px solid #8a9d99;border-radius:5px;background:#fff;padding:6px 9px}button{cursor:pointer;color:#215c5c}button:disabled{opacity:.58;cursor:default}button[type=submit]{background:#226461;color:#fff}button[aria-current=true]{background:#e1efea;border-color:#558b83}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid #176d92;outline-offset:2px}
.workspace{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,3fr);gap:22px;margin-top:18px}.sidebar{border-right:1px solid #cfdad7;padding-right:16px;min-width:0}ul{padding:0;margin:8px 0;list-style:none}li{border-bottom:1px solid #dce6e3;padding:7px 0;overflow-wrap:anywhere}#list button{text-align:left;width:100%;border-color:transparent;overflow-wrap:anywhere}#list button[aria-current=true]{border-color:#558b83}
label{display:grid;gap:4px;font-weight:600;min-width:0}input,select,textarea{width:100%;min-width:0}textarea{resize:vertical;min-height:16em}form,.stack{display:grid;gap:12px}fieldset{border:0;margin:0;padding:0;min-width:0}fieldset[disabled]{opacity:.7}section{border-top:1px solid #cfdad7;padding-top:14px}#status{min-height:1.6em;margin:6px 0;color:#526663}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;max-height:12em;overflow:auto}#conflict{border-left:3px solid #ad7542;padding-left:9px}#references li{display:flex;gap:10px;align-items:center;flex-wrap:wrap}small{color:#536866}#project-list{margin-bottom:0}[hidden]{display:none!important}
#outline-list{max-height:21em;overflow:auto}#outline-list li{padding:2px 0;border:0}#outline-list ol{list-style:none;margin:0;padding:0}#outline-list button{text-align:left;max-width:100%;overflow-wrap:anywhere}#node-body{min-height:5em}#node-conflict,#node-delete-review{border-inline-start:3px solid #ad7542;padding-inline-start:10px}#node-target{width:min(100%,26em)}
.view-segment{display:inline-flex;gap:1px;background:#cddbd7;border:1px solid #8a9d99;border-radius:6px;overflow:hidden}.view-segment button{border:0;border-radius:0}.view-segment button[aria-pressed=true]{background:#225f5d;color:white}.view-segment button:focus-visible{outline-offset:-3px}#map-direction{width:auto}#mindmap{overflow:auto;max-height:430px;border:1px solid #cddbd7;border-radius:6px;background:#fff;min-width:0}#map-graph{position:relative}#map-graph svg{position:absolute;inset:0;pointer-events:none}#map-graph path{stroke:#739993;stroke-width:1.5;fill:none}#map-graph button{position:absolute;width:152px;height:42px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#map-graph button[data-depth="0"]{font-weight:600;background:#eef6f2}#map-graph button[aria-current=true]{background:#d5ede4;border-color:#397871}
@media(max-width:670px){nav,main{padding-inline:14px}.workspace{grid-template-columns:1fr;gap:14px}.sidebar{border-right:0;border-bottom:1px solid #cfdad7;padding:0 0 12px}textarea{min-height:10em}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/notes" aria-current="page">笔记</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>笔记</h1><p id="status" role="status">正在读取…</p><div id="workspace" class="workspace" hidden>
<aside class="sidebar" aria-label="我的笔记"><button type="button" id="new">新建笔记</button><ul id="list"></ul><button type="button" id="more" hidden>更多笔记</button></aside>
<div class="stack"><form id="editor"><fieldset id="fields" class="stack"><label>标题<input id="title" maxlength="200" required></label>
<label>类型<select id="kind"><option value="plain">普通笔记</option><option value="reading">读书笔记</option><option value="project">项目随记</option><option value="reflection">个人复盘</option></select></label>
<label>正文<textarea id="body" maxlength="32000"></textarea></label><div class="tools"><button type="submit" id="save">保存笔记</button><small id="revision"></small></div></fieldset></form>
<section id="conflict" hidden><h2>服务器版本</h2><p id="latest-title"></p><pre id="latest-body"></pre><button type="button" id="rebase">保留草稿并使用此修订</button></section>
<section id="outline" class="stack" hidden aria-labelledby="outline-heading"><div class="tools"><h2 id="outline-heading">层级大纲</h2><div class="view-segment" role="group" aria-label="笔记视图"><button type="button" id="view-outline" aria-pressed="true">大纲</button><button type="button" id="view-map" aria-pressed="false">脑图</button></div></div>
<ul id="outline-list" aria-label="大纲节点"></ul>
<div id="map-panel" class="stack" hidden><div class="tools"><label for="map-direction">布局</label><select id="map-direction"><option value="horizontal">横向</option><option value="vertical">纵向</option></select><small id="map-layout-status" role="status"></small></div><div id="mindmap" role="region" aria-label="脑图节点" tabindex="0"><div id="map-graph"></div></div></div>
<p id="node-detached" role="status" hidden>原节点已回收。草稿不会写入其他节点。</p>
<fieldset id="node-controls" class="stack"><label id="node-label">节点正文<textarea id="node-body" maxlength="32000"></textarea></label>
<div class="tools"><button id="node-add" type="button">添加子节点</button><button id="node-save" type="button">保存节点</button>
<button id="node-indent" type="button" aria-label="缩进" title="缩进">⇥</button><button id="node-promote" type="button" aria-label="提升" title="提升">⇤</button>
<button id="node-up" type="button" aria-label="上移" title="上移">↑</button><button id="node-down" type="button" aria-label="下移" title="下移">↓</button>
<button id="node-undo" type="button" aria-label="撤销结构改动" title="撤销结构改动">↶</button><button id="node-preview" type="button">删除预览</button></div>
<label>移动到<select id="node-target"></select></label><div class="tools"><button id="node-move" type="button">移动到目标末尾</button></div></fieldset>
<div id="node-delete-review" class="stack" hidden><h2>删除影响</h2><p id="node-delete-summary"></p><ul id="node-impact"></ul><div class="tools">
<button id="node-delete-subtree" type="button">连同子树回收</button><button id="node-delete-promote" type="button">回收当前节点，提升子节点</button><button id="node-delete-cancel" type="button">取消</button></div></div>
<div id="node-conflict" class="stack" hidden><h2>大纲修订冲突</h2><p id="node-conflict-revision"></p><pre id="node-latest"></pre><button id="node-refresh" type="button">读取最新大纲并保留草稿</button></div></section>
<section><h2>资料引用</h2><ul id="references"></ul></section>
<section id="project-section" hidden><h2>项目引用</h2><label>我的项目<select id="projects"><option value="">选择项目</option></select></label><div class="tools">
<button type="button" id="link-project" disabled>关联当前笔记</button><button type="button" id="more-projects" hidden>更多项目</button></div><ul id="project-list"></ul><button type="button" id="more-links" hidden>更多关联</button></section></div></div></main>
<script>
const $=id=>document.getElementById(id), path='/knowledge/v1/notes', q=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
let owner, note, rows=[], next=null, pending=null, key=null, conflict=null, projectsNext=null, linksNext=null;
let busy=false, locked=false, checking=false;
let selected=null,preview=null,outlineConflict=null;
let view=q.get('view')==='map'?'map':'outline',refreshRequested=false,pendingMapFocus;
const changeChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('knowledgeos-notes-change-v1'):null;
const announceChange=()=>changeChannel?.postMessage('changed');
const status=text=>$('status').textContent=text;
const form=()=>({title:$('title').value,kind:$('kind').value,body:$('body').value});
const desired=q.get('note'), citation=q.get('citation');
function stop(message){
  locked=true;$('workspace').hidden=true;note=null;rows=[];pending=null;conflict=null;
  $('title').value=$('body').value=$('latest-title').textContent=$('latest-body').textContent='';
  selected=null;pendingMapFocus=undefined;clearOutlinePanels();$('node-body').value='';$('node-target').replaceChildren();$('outline-list').replaceChildren();$('map-graph').replaceChildren();$('map-layout-status').textContent='';$('outline').hidden=true;
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
  const wait=busy||checking||locked;
  $('fields').disabled=wait;$('new').disabled=wait;$('more').disabled=wait;
  $('save').disabled=!!(conflict||outlineConflict);$('rebase').disabled=wait;$('projects').disabled=wait;
  $('link-project').disabled=wait||!note||!$('projects').value;$('more-projects').disabled=wait;$('more-links').disabled=wait;
  for(const el of document.querySelectorAll('#list button,#references button,#project-list button'))el.disabled=wait;
  const n=currentNode(),movable=!!n?.parent_id,peers=movable?children(n.parent_id):[],index=peers.findIndex(x=>x.id===selected);
  const blocked=wait||!!conflict||!!outlineConflict;
  $('node-controls').disabled=blocked||!!preview;
  $('node-add').disabled=!n;$('node-save').disabled=!movable||!nodeDirty();$('node-preview').disabled=!movable;
  $('node-indent').disabled=index<=0;$('node-promote').disabled=!movable||!nodeById(n.parent_id)?.parent_id;
  $('node-up').disabled=index<=0;$('node-down').disabled=index<0||index>=peers.length-1;
  $('node-move').disabled=!movable||!$('node-target').value;$('node-undo').disabled=!note?.outline?.can_undo;
  for(const el of document.querySelectorAll('#outline-list button,#node-delete-review button'))el.disabled=blocked;
  for(const el of document.querySelectorAll('#map-graph button'))el.disabled=blocked;
  $('view-map').disabled=$('view-outline').disabled=busy||locked;
  $('map-direction').disabled=wait;
  $('node-refresh').disabled=busy||checking||locked;
}
async function action(work){
  if(busy||locked||checking)return;busy=true;enabled();
  try{await checkAccount();await work()}catch(e){
    if(!locked)status(({SOURCE_NOT_FOUND:'引用来源不可用，草稿仍保留。',PROJECT_NOT_FOUND:'项目不可用。',NOTE_NOT_FOUND:'笔记或关联不可用。',INVALID_NOTE:'无法保存，请检查标题和内容。',INVALID_OUTLINE_TARGET:'大纲位置不可用，未修改节点。',OUTLINE_LIMIT:'已达到大纲节点上限，草稿仍保留。',OUTLINE_PREVIEW_REQUIRED:'删除预览失效，请重新预览。',OUTLINE_UNDO_UNAVAILABLE:'没有可撤销的结构改动。'})[e.code]||'没有确认操作结果，可以刷新核对；草稿仍保留。');
  }finally{busy=false;enabled();if(refreshRequested)void checkVisible(true)}
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
function apply(n,newCitation=null,outlineDraft=null){
  note=n;pending=newCitation;key=null;clearConflict();$('title').value=n?.title??'';$('kind').value=n?.kind??(newCitation?'reading':'plain');$('body').value=n?.body??'';
  $('revision').textContent=n?'修订 '+n.revision:'未保存';renderList();renderRefs();
  $('map-layout-status').textContent='';
  clearOutlinePanels();chooseNode(outlineDraft?.id,outlineDraft?.body);
}
function dirty(){const d=form();return note?(d.title!==note.title||d.kind!==note.kind||d.body!==note.body):(d.title!==''||d.body!=='')}
function edits(d){return Object.fromEntries(Object.entries(d).filter(([key,value])=>value!==note[key]))}
function rememberView(){if(note)history.replaceState(null,'','?'+new URLSearchParams({note:note.id,...(view==='map'?{view}:{})}));}
async function open(id){if((dirty()||nodeDirty())&&!confirm('离开未保存的草稿？'))return;const n=await request(path+'/'+id);apply(n);rememberView();status('已打开笔记。')}
async function saveChanges(extra={},preserveDraft=false){
  if(conflict||outlineConflict)return;
  const data={actor_id:owner,...(preserveDraft?{}:form()),...extra},draft=form();if(!note&&pending)data.add_citation=pending;
  try{
    let result;
    if(note){data.expected_revision=note.revision;result=await request(path+'/'+note.id,'PATCH',data)}
    else{const digest=JSON.stringify(data);if(key?.digest!==digest)key={digest,id:crypto.randomUUID()};result=await request(path,'POST',data,{'idempotency-key':key.id})}
    rows=[result,...rows.filter(r=>r.id!==result.id)];apply(result,null,keepNodeDraft());
    if(preserveDraft){$('title').value=draft.title;$('body').value=draft.body;$('kind').value=draft.kind}
    rememberView();announceChange();status('笔记已保存。');
  }catch(e){
    if(e.code!=='REVISION_CONFLICT'||!note)throw e;
    status('笔记已在另一处更新，草稿未覆盖服务器版本。');
    showConflict(await request(path+'/'+note.id));
  }
}
const nodeById=(id,n=note)=>n?.outline?.nodes.find(x=>x.id===id);
const currentNode=()=>nodeById(selected);
const children=id=>(note?.outline?.nodes??[]).filter(n=>n.parent_id===id).sort((a,b)=>a.order_key-b.order_key);
const nodeBase=n=>n?.parent_id?n.body:'';
const detached=()=>!!selected&&!currentNode();
const nodeDirty=()=>detached()||$('node-body').value!==nodeBase(currentNode());
const keepNodeDraft=()=>({id:selected,body:nodeDirty()?$('node-body').value:undefined});
const nodeName=n=>n.parent_id===null?'正文（根节点）':(n.body.trim().slice(0,100)||'空白节点');
function clearPreview(){preview=null;$('node-delete-review').hidden=true;$('node-delete-summary').textContent='';$('node-impact').replaceChildren()}
function clearOutlinePanels(){clearPreview();outlineConflict=null;$('node-conflict').hidden=true;$('node-conflict-revision').textContent=$('node-latest').textContent=''}
function chooseNode(id,draft){
  selected=nodeById(id)?.id??(id&&draft!==undefined?id:children(null)[0]?.id??null);
  $('node-body').value=draft??nodeBase(currentNode());
  renderOutline();
}
function selectNode(row){return action(()=>{
  if(row.id===selected)return;
  if(nodeDirty()&&!confirm('离开未保存的节点草稿？'))return;
  clearPreview();chooseNode(row.id);
  $(view==='map'?'map-graph':'outline-list').querySelector('[aria-current="true"]')?.focus();
})}
function showView(){
  $('outline-list').hidden=view!=='outline';$('map-panel').hidden=view!=='map';
  $('outline-heading').textContent=view==='map'?'笔记脑图':'层级大纲';
  $('view-map').setAttribute('aria-pressed',String(view==='map'));$('view-outline').setAttribute('aria-pressed',String(view==='outline'));
}
function renderMap(){
  const graph=$('map-graph');graph.replaceChildren();
  const root=children(null)[0];if(!root||view!=='map')return;
  const direction=note.layout.direction,vertical=direction==='vertical';$('map-direction').value=direction;
  graph.dataset.direction=direction;graph.dataset.revision=String(note.layout.revision);
  const NS='http://www.w3.org/2000/svg',drawing=document.createElementNS(NS,'svg'),points=new Map();
  let leaf=0,maxDepth=0;
  // Assign each subtree a contiguous band of leaves, then center its parent over the band.
  function place(row,depth){
    const first=leaf,childrenOfRow=children(row.id);if(childrenOfRow.length)childrenOfRow.forEach(child=>place(child,depth+1));else leaf++;
    const center=(first+leaf-1)/2;
    maxDepth=Math.max(maxDepth,depth);
    points.set(row.id,{row,depth,x:12+(vertical?center*176:depth*186),y:12+(vertical?depth*76:center*60)});
  }
  place(root,0);
  const width=176+(vertical?(leaf-1)*176:maxDepth*186),height=66+(vertical?maxDepth*76:(leaf-1)*60);
  graph.style.width=width+'px';graph.style.height=height+'px';
  drawing.setAttribute('width',String(width));drawing.setAttribute('height',String(height));drawing.setAttribute('aria-hidden','true');graph.append(drawing);
  const order=[root.id];
  for(let i=0;i<order.length;i++){
    const id=order[i],{row,x,y,depth}=points.get(id),parent=points.get(row.parent_id);
    order.push(...children(id).map(child=>child.id));
    if(parent){
      const edge=document.createElementNS(NS,'path');edge.dataset.childId=id;
      const ax=parent.x+(vertical?76:152),ay=parent.y+(vertical?42:21),bx=x+(vertical?76:0),by=y+(vertical?0:21);
      const mx=(ax+bx)/2,my=(ay+by)/2;
      edge.setAttribute('d','M '+ax+' '+ay+' C '+(vertical?ax:mx)+' '+(vertical?my:ay)+' '+(vertical?bx:mx)+' '+(vertical?my:by)+' '+bx+' '+by);
      drawing.append(edge);
    }
    const button=document.createElement('button');button.type='button';button.dataset.nodeId=id;button.dataset.parentId=row.parent_id??'';button.dataset.depth=depth;
    button.style.left=x+'px';button.style.top=y+'px';button.textContent=nodeName(row);button.title=nodeName(row);
    button.setAttribute('aria-current',String(selected===id));button.onclick=()=>selectNode(row);graph.append(button);
  }
}
for(const mode of ['outline','map'])$('view-'+mode).onclick=()=>{view=mode;showView();renderMap();enabled();rememberView()};
function renderOutline(){
  const list=$('outline-list'),target=$('node-target'),root=children(null)[0],n=currentNode();
  list.replaceChildren();target.replaceChildren(new Option('选择目标节点',''));$('outline').hidden=!root;
  showView();renderMap();
  if(!root)return;
  const orphan=detached();$('node-detached').hidden=!orphan;$('node-body').readOnly=orphan;
  $('node-body').ariaLabel=orphan?'已回收节点的草稿':n?.parent_id?'节点正文':'新子节点正文';
  const visit=(row,depth,host,excluded)=>{
    const li=document.createElement('li'),button=document.createElement('button');
    li.dataset.depth=depth;li.dataset.parentId=row.parent_id??'';li.style.paddingInlineStart=depth>0&&depth<=5?'14px':'0';
    button.type='button';button.dataset.nodeId=row.id;button.textContent=nodeName(row);button.setAttribute('aria-current',String(row.id===selected));
    button.onclick=()=>selectNode(row);
    li.append(button);host.append(li);
    excluded||=row.id===selected;
    if(!excluded)target.add(new Option('　'.repeat(Math.min(depth,5))+nodeName(row),row.id));
    const nested=children(row.id);
    if(nested.length){const sub=document.createElement('ol');host.append(sub);for(const child of nested)visit(child,depth+1,sub,excluded)}
  };
  visit(root,0,list,false);
}
function adoptOutline(latest,local){
  const changed=edits(form());apply(latest,null,local);
  for(const [field,value] of Object.entries(changed))$(field).value=value;
}
function showOutlineConflict(latest){
  clearPreview();outlineConflict=latest.revision;
  const serverNode=nodeById(selected,latest);
  $('node-conflict-revision').textContent='服务器修订 '+latest.revision+' · '+(serverNode?'所选节点正文':'所选节点已不在大纲中');
  $('node-latest').textContent=serverNode?.body??'';$('node-conflict').hidden=false;
  status('大纲修订冲突。草稿仍保留，操作未重放。');
}
function outlineRequest(op){return {actor_id:owner,expected_revision:note.revision,...op}}
async function outlineChange(op){
  if(!note||outlineConflict||conflict)return;
  const draft=keepNodeDraft(),oldIds=new Set(note.outline.nodes.map(x=>x.id));
  try{
    const result=await request(path+'/'+note.id+'/nodes','PATCH',outlineRequest(op));
    if(op.action==='add'){
      draft.id=result.outline.nodes.find(x=>!oldIds.has(x.id))?.id;draft.body=undefined;
    }else if(op.action==='edit')draft.body=undefined;
    else if(op.action==='delete'&&draft.body===undefined)draft.id=currentNode()?.parent_id;
    adoptOutline(result,draft);announceChange();status('大纲已保存。');
  }catch(e){
    if(e.code==='OUTLINE_PREVIEW_REQUIRED')clearPreview();
    if(e.code!=='REVISION_CONFLICT')throw e;
    showOutlineConflict(await request(path+'/'+note.id));
  }
}
async function previewDelete(){
  try{
    const p=await request(path+'/'+note.id+'/delete-preview','POST',outlineRequest({node_id:selected}));
    preview={...p,node_id:selected};
    $('node-delete-summary').textContent=nodeName(currentNode())+' · '+p.child_ids.length+' 个直接子节点，'+p.descendant_ids.length+' 个后代';
    $('node-impact').replaceChildren(...p.descendant_ids.map(id=>{
      const li=document.createElement('li');li.textContent=(p.child_ids.includes(id)?'直接子节点：':'更深后代：')+nodeName(nodeById(id));return li;
    }));
    $('node-delete-review').hidden=false;
  }catch(e){if(e.code!=='REVISION_CONFLICT')throw e;showOutlineConflict(await request(path+'/'+note.id))}
}
const move=(parent_id,index)=>outlineChange({action:'move',node_id:selected,parent_id,index});
const reorder=by=>{
  const p=currentNode().parent_id;return move(p,children(p).findIndex(n=>n.id===selected)+by);
};
$('node-body').oninput=enabled;$('node-target').onchange=enabled;
$('node-add').onclick=()=>action(()=>outlineChange({action:'add',parent_id:selected,body:nodeDirty()?$('node-body').value:''}));
$('node-save').onclick=()=>action(()=>outlineChange({action:'edit',node_id:selected,body:$('node-body').value}));
$('node-up').onclick=()=>action(()=>reorder(-1));$('node-down').onclick=()=>action(()=>reorder(1));
$('node-indent').onclick=()=>action(()=>{
  const peers=children(currentNode().parent_id),sibling=peers[peers.findIndex(n=>n.id===selected)-1];return move(sibling.id,children(sibling.id).length);
});
$('node-promote').onclick=()=>action(()=>{
  const p=nodeById(currentNode().parent_id);return move(p.parent_id,children(p.parent_id).findIndex(n=>n.id===p.id)+1);
});
$('node-move').onclick=()=>action(()=>{const parent=$('node-target').value;return move(parent,children(parent).filter(n=>n.id!==selected).length)});
$('node-undo').onclick=()=>action(()=>outlineChange({action:'undo'}));$('node-preview').onclick=()=>action(previewDelete);
$('node-delete-cancel').onclick=()=>{clearPreview();enabled();$('node-preview').focus()};
for(const mode of ['subtree','promote'])$('node-delete-'+mode).onclick=()=>action(()=>outlineChange({action:'delete',node_id:preview.node_id,mode,preview_token:preview.preview_token}));
$('node-refresh').onclick=()=>action(async()=>{
  const latest=await request(path+'/'+note.id);
  if(latest.revision!==outlineConflict){showOutlineConflict(latest);return;}
  const local=keepNodeDraft(),missing=!nodeById(local.id,latest);adoptOutline(latest,local);
  status(missing&&local.body!==undefined?'原节点不可用，草稿保留在节点输入框。':'已读取最新大纲。草稿未保存，结构操作未重放。');
});
$('map-direction').onchange=()=>{
  const direction=$('map-direction').value;
  void action(async()=>{
    $('map-layout-status').textContent='正在保存布局…';
    try{
      const result=await request(path+'/'+note.id+'/layout','PATCH',{actor_id:owner,expected_revision:note.layout.revision,direction});
      note={...note,layout:result.layout};renderMap();announceChange();$('map-layout-status').textContent='布局已保存。';
    }catch(e){
      if(locked)return;
      $('map-direction').value=note.layout.direction;
      if(e.code==='LAYOUT_CONFLICT'){
        const latest=await request(path+'/'+note.id);note={...note,layout:latest.layout};renderMap();
        $('map-layout-status').textContent='布局已在另一处更新，未覆盖。';
      }else $('map-layout-status').textContent='布局未确认，请重新选择。';
    }
  });
};
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
$('new').onclick=()=>action(()=>{if((dirty()||nodeDirty())&&!confirm('离开未保存的草稿？'))return;apply(null);history.replaceState(null,'','/knowledgeos/notes');status('新笔记。')});
$('more').onclick=()=>action(()=>listMore(false));$('more-projects').onclick=()=>action(()=>projectMore(false));$('more-links').onclick=()=>action(()=>linkList(false));
$('editor').onsubmit=e=>{e.preventDefault();void action(saveChanges)};
$('rebase').onclick=()=>action(async()=>{
  if(!conflict||!note)return;
  const changed=edits(form()),latest=await request(path+'/'+note.id);
  note={...note,references:latest.references};renderRefs();
  if(latest.revision!==conflict){showConflict(latest);status('服务器版本再次更新，草稿未覆盖。');return}
  apply(latest,null,keepNodeDraft());for(const [key,value] of Object.entries(changed))$(key).value=value;
  status('已保留草稿，尚未保存。');
});
$('projects').onchange=()=>action(()=>linkList(true));
$('link-project').onclick=()=>action(async()=>{const project=$('projects').value;if(!note||!project)return;await request(path+'/projects/'+project,'POST',{actor_id:owner,note_id:note.id});await linkList(true);status('项目引用已保存。')});
async function checkVisible(allowHidden=false){
  if(document.hidden&&!allowHidden||busy||locked||checking||!owner)return;
  const focus=focusedMapNode()??pendingMapFocus;
  checking=true;refreshRequested=false;enabled();
  try{
    await checkAccount();
    if(note){
      const refreshed=await request(path+'/'+note.id);
      if(refreshed.revision!==note.revision&&!dirty()&&!nodeDirty()&&!preview&&!conflict&&!outlineConflict){
        rows=rows.map(row=>row.id===refreshed.id?refreshed:row);apply(refreshed,null,keepNodeDraft());
      }else{
        const reflow=refreshed.layout.revision!==note.layout.revision;
        note={...note,layout:refreshed.layout,references:refreshed.references};renderRefs();if(reflow)renderMap();
      }
    }
    $('workspace').hidden=document.hidden;
  }
  catch{if(!locked)$('workspace').hidden=true}
  finally{
    checking=false;enabled();
    if(!locked&&!$('workspace').hidden){
      pendingMapFocus=undefined;
      if(view==='map'&&focus&&document.activeElement===document.body){
        const target=[...$('map-graph').querySelectorAll('button')].find(b=>b.dataset.nodeId===focus&&!b.disabled);
        (target??$('mindmap')).focus({preventScroll:true});
      }
    }
    if(refreshRequested&&!locked)void checkVisible(true);
  }
}
if(changeChannel)changeChannel.onmessage=()=>{refreshRequested=true;void checkVisible(true)};
function focusedMapNode(){const current=document.activeElement;return current?.matches('#map-graph button')?current.dataset.nodeId:undefined}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){pendingMapFocus=focusedMapNode()??pendingMapFocus;$('workspace').hidden=true;}
  else{refreshRequested=true;void checkVisible();}
});
setInterval(checkVisible,10000);
void action(async()=>{
  try{await listMore(true);await projectMore(true);
    if(uuid(desired)){const saved=await request(path+'/'+desired);apply(saved)}else apply(null,uuid(citation)?citation:null);
    $('workspace').hidden=document.hidden;status(note?'已打开笔记。':'新笔记。');
  }catch(e){if(e.code==='NOTE_NOT_FOUND'&&!locked){apply(null);$('workspace').hidden=document.hidden}throw e}
});
</script></body></html>`}
