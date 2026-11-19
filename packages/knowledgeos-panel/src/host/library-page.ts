/** Standalone library surface. Only the cookie-authenticated business API is used. */
export function buildLibraryHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDF 资料库 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;color:#223638;background:#f8faf9;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:#fff;border-bottom:1px solid #d2ddda}header>div,main{max-width:900px;margin:auto;padding:0 22px}header>div,nav,.bar,.links{display:flex;align-items:center;gap:18px;flex-wrap:wrap}header>div{justify-content:space-between;min-height:54px;padding-block:8px}header strong{color:#18565a;font-size:19px}a{color:#176166;text-underline-offset:3px}main{padding-block:24px}h1,h2,p,dl{margin:0}h1{font-size:26px}h2{font-size:18px}section{margin-top:20px;border-top:1px solid #cbd9d6;padding-top:16px}.bar{justify-content:space-between;gap:8px}.muted,dt,small{color:#536866}#who{overflow-wrap:anywhere}form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto;align-items:end;gap:12px;margin-top:12px}label{display:grid;gap:5px;font-weight:600}input,select,button{font:inherit}input,select{width:100%;min-width:0;color:inherit;background:white;border:1px solid #889f9c;border-radius:5px;padding:7px;height:42px}input::file-selector-button{border:0;border-right:1px solid #ccd8d5;background:white;color:#18565a;margin-right:8px;padding:2px 8px 2px 0}button{border:1px solid #698c88;border-radius:5px;padding:6px 12px;background:white;color:#215c5c;cursor:pointer}button[type=submit]{background:#226461;color:white;height:42px}button:disabled,input:disabled,select:disabled{opacity:.6;cursor:default}:focus-visible{outline:3px solid #176d92;outline-offset:3px}#status{margin-top:12px;border-left:3px solid #9ebcb4;padding-left:9px;color:#354d48}#status[data-error]{border-color:#ae622e;color:#794019}#receipt{border-color:#669d90}.entry{padding:12px 0;overflow-wrap:anywhere}.entry+.entry{border-top:1px solid #dde5e2}.entry strong{display:block}.entry dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 12px;margin:5px 0}.entry dd{margin:0}.hash{font:13px/1.7 Consolas,monospace}.links{gap:15px;margin-top:6px}#list>p{padding-block:12px}[hidden]{display:none!important}@media(max-width:640px){header>div,main{padding-inline:14px}main{padding-top:18px}form{grid-template-columns:minmax(0,1fr)}form button{justify-self:start}nav{gap:12px}}
#parse-picker{margin:8px 0;max-width:36rem}#parse-panel{overflow-wrap:anywhere}#parse-panel .links{gap:8px}#parse-pages{list-style:none;margin:8px 0;padding:0}#parse-pages li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;border-top:1px solid #dde5e2;padding:6px 0}#parse-pages strong{min-width:5em}#parse-pages small{flex-basis:100%}#parse-note{color:#794019}
</style></head><body>
<header><div><strong>KnowledgeOS</strong><nav aria-label="业务导航"><a href="/knowledgeos/account">账号与登录</a><a href="/knowledgeos/ai">AI 工具</a></nav></div></header>
<main><div class="bar"><h1>PDF 资料库</h1><span id="who" class="muted"></span></div>
<section aria-labelledby="import-heading"><h2 id="import-heading">导入原件</h2>
<form id="import"><label>导入到<select id="target" disabled><option value="">新建资料</option></select></label>
<label>PDF 文件<input id="file" type="file" accept=".pdf,application/pdf" disabled></label>
<button id="submit" type="submit" disabled>导入 PDF</button></form>
<p id="status" role="status" aria-live="polite" aria-atomic="true">正在核对登录…</p></section>
<section id="receipt" aria-labelledby="receipt-heading" hidden><h2 id="receipt-heading">导入回执</h2><div id="result"></div></section>
<section id="parse" aria-labelledby="parse-heading" hidden><h2 id="parse-heading">解析进度</h2>
<label id="parse-picker">资料版本<select id="parse-version"></select></label>
<div id="parse-panel" hidden><p id="parse-summary" aria-live="polite"></p><p id="parse-note" aria-live="polite"></p>
<div class="links"><button id="parse-action" type="button" hidden></button><button id="parse-refresh" type="button">刷新进度</button></div>
<ul id="parse-pages" aria-label="分章节页状态"></ul><div class="links" id="parse-nav" hidden><button id="parse-prev" type="button">上一组</button><span id="parse-range"></span><button id="parse-next" type="button">下一组</button></div></div></section>
<section aria-labelledby="list-heading"><div class="bar"><h2 id="list-heading">我的资料</h2><button id="refresh" type="button">刷新资料</button></div><div id="list"></div></section></main>
<script>(()=>{
'use strict';
const $ = id => document.getElementById(id);
const api = '/knowledge/v1/', file = $('file'), target = $('target');
let owner = null, generation = 0, busy = false, ready = false, key = null, conflict = false, rows = [];
function status(text,error=false){ $('status').textContent=text; $('status').toggleAttribute('data-error',error) }
function controls(){
  file.disabled = target.disabled = !ready || busy;
  $('parse-version').disabled = !ready || busy;
  $('submit').disabled = file.disabled || !key || conflict;
  $('refresh').disabled = busy;
}
function clearDraft(){ file.value=''; key=null; conflict=false }
function clearPrivate(){
  clearParse();
  owner=null; ready=false; rows=[]; clearDraft(); target.replaceChildren(new Option('新建资料',''));
  $('who').textContent=''; $('receipt').hidden=true; $('result').replaceChildren(); $('list').replaceChildren();
}
function signedOut(){ ++generation; busy=false; clearPrivate(); controls(); status('请先登录：前往「账号与登录」，登录后刷新资料。',true) }
function problem(http){ return Object.assign(new Error(),{http}) }
async function request(path,options){
  const r=await fetch(api+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok) throw problem(r.status);
  return (await r.json()).data;
}
async function me(){ const m=await request('me'); if(!m || typeof m.id!=='string' || !m.id)throw problem(502); return m }
// Every asynchronous commit belongs to both an operation and the same session principal.
async function confirmOwner(gen){
  if(gen!==generation)return false;
  const m=await me(); if(gen!==generation)return false;
  if(m.id!==owner){ void load(true); return false } return true;
}
function fail(e,gen,upload){
  if(gen!==generation)return;
  if(e.http===401){signedOut();return}
  if(e.http===403 || e.http===404){
    ++generation; busy=false; clearPrivate(); controls(); status('资料不可访问。请核对账号和权限，再刷新资料。',true); return;
  }
  if(!upload){status('无法读取资料。请检查连接后刷新资料。',true);return}
  const hint={400:'文件或导入信息无效，请重新选择 PDF。',409:'资料或请求状态已变化，请刷新资料后核对版本再导入。',413:'文件过大，请重新选择较小的 PDF。',415:'格式不受支持，请重新选择 PDF。',422:'无法导入此文件，请重新选择有效的 PDF。',507:'存储空间不足，请联系管理员释放空间后重试。'};
  if(e.http===409)conflict=true;
  status(hint[e.http] || '未收到有效回执。请检查连接或服务状态，保留当前选择并重试。',true);
}
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function record(r){
  if(!r || !uuid.test(r.id) || !uuid.test(r.version_id) || typeof r.title!=='string' || !Number.isSafeInteger(r.version) || r.version<1 || !Number.isSafeInteger(r.byte_length) || r.byte_length<0 || !/^[a-f\d]{64}$/i.test(r.sha256))throw problem(502);
  return r;
}
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function entry(r){
  const node=el('div',null,'entry'), meta=el('dl'), links=el('div',null,'links');
  for(const [label,value] of [['版本','v'+r.version],['大小',r.byte_length+' 字节'],['SHA-256',r.sha256]])
    meta.append(el('dt',label),el('dd',value,label==='SHA-256'?'hash':''));
  const path=api+'assets/'+r.id+'/versions/'+r.version_id+'/original';
  const view=el('a','查看原件'), save=el('a','导出 PDF'); view.href=path;view.target='_blank';view.rel='noopener';save.href=path+'?download=1';save.download='';
  links.append(view,save);node.append(el('strong',r.title),meta,links);return node;
}
function head(id){return rows.find(r=>r.id===id)}
const docStates={idle:'未开始',queued:'排队中',running:'解析中',complete:'解析完成',partial:'部分完成',failed:'解析失败',cancelled:'已取消'};
const pageStates={pending:'未处理',ready:'可用',review:'待复核',failed:'失败'};
const pageSize=25, parseVersion=$('parse-version'), writes=new Map();
let selection=null, pollTimer;
function clearParse(){
  clearTimeout(pollTimer);selection=null;parseVersion.replaceChildren();$('parse').hidden=true;resetPanel();
}
function resetPanel(){
  $('parse-panel').hidden=true;$('parse-action').hidden=true;$('parse-nav').hidden=true;
  $('parse-summary').textContent='';$('parse-note').textContent='';$('parse-pages').replaceChildren();$('parse-range').textContent='';
}
function progress(data){
  const nullableText=v=>v===null || typeof v==='string';
  if(!data || !Object.hasOwn(docStates,data.state) || !Number.isSafeInteger(data.total) || data.total<0 || !nullableText(data.error) || !Array.isArray(data.pages))throw problem(502);
  const seen=new Set(), counts={pending:0,ready:0,review:0,failed:0};
  for(const p of data.pages){
    if(!p || !Number.isSafeInteger(p.page) || p.page<1 || p.page>data.total || seen.has(p.page) || !Object.hasOwn(pageStates,p.state) || typeof p.chapter!=='string' || !nullableText(p.error))throw problem(502);
    seen.add(p.page);++counts[p.state];
  }
  return {...data,counts,pages:data.pages.sort((a,b)=>a.page-b.page)};
}
function activeJob(state){return state==='queued' || state==='running'}
function drawPages(s){
  const {pages,state}=s.data, last=Math.max(0,Math.ceil(pages.length/pageSize)-1);
  s.group=Math.min(last,Math.max(0,s.group));const from=s.group*pageSize, end=Math.min(from+pageSize,pages.length);
  const items=pages.slice(from,end).map(p=>{
    const li=el('li');li.append(el('strong','第 '+p.page+' 页'),el('span',pageStates[p.state]),el('span',p.chapter));
    if(state==='partial' && (p.state==='failed' || p.state==='review')){
      const retry=el('button','重试第 '+p.page+' 页');retry.type='button';retry.disabled=s.writing;
      retry.onclick=()=>requestProgress(s,'/retry/'+p.page);li.append(retry);
    }
    if(p.error)li.append(el('small',p.error));return li;
  });
  $('parse-pages').replaceChildren(...items);$('parse-nav').hidden=last===0;
  $('parse-prev').disabled=s.group===0;$('parse-next').disabled=s.group===last;
  $('parse-range').textContent=pages.length?'第 '+(from+1)+'–'+end+' 条，共 '+pages.length+' 条':'';
}
function drawProgress(s){
  const {state,total,counts,error}=s.data, action=$('parse-action');
  const summary=docStates[state]+' · 共 '+total+' 页'+Object.keys(pageStates).map(k=>' · '+pageStates[k]+' '+counts[k]).join('');
  if($('parse-summary').textContent!==summary)$('parse-summary').textContent=summary;
  $('parse-note').textContent=error || '';
  const labels={idle:'开始解析',queued:'取消解析',running:'取消解析',failed:'重新解析',cancelled:'继续解析'};
  action.hidden=!labels[state];action.textContent=labels[state] || '';action.disabled=action.hidden || s.writing;
  action.onclick=action.hidden?null:()=>requestProgress(s,activeJob(state)?'/cancel':'/start');drawPages(s);
}
async function requestProgress(s,action=''){
  if(selection!==s || s.writing)return;
  clearTimeout(pollTimer);const seq=++s.seq, current=()=>selection===s && s.seq===seq;
  async function sameOwner(){
    if(!current())return false;
    const m=await me();if(!current())return false;
    if(m.id!==owner){void load(true);return false}return true;
  }
  s.writing=!!action;$('parse-refresh').disabled=true;
  if(s.writing){drawProgress(s);$('parse-note').textContent='正在提交…'}
  try{
    // Returning to a version while its previous POST is in flight must read after that write.
    if(writes.has(s.path))await writes.get(s.path);
    if(!await sameOwner())return;
    const req=request(s.path+action,action?{method:'POST',headers:{'x-knowledgeos-request':'1'}}:undefined);
    if(action)writes.set(s.path,req.catch(()=>{}));
    let data;try{data=await req}finally{if(action)writes.delete(s.path)}
    if(!await sameOwner())return;
    s.data=progress(data);s.writing=false;drawProgress(s);
    if(activeJob(s.data.state))pollTimer=setTimeout(()=>requestProgress(s),2000);
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    s.data=null;s.group=0;resetPanel();$('parse-panel').hidden=false;
    $('parse-note').textContent='无法确认当前解析状态。请刷新进度后再操作。';
  }finally{if(current()){s.writing=false;$('parse-refresh').disabled=false}}
}
parseVersion.onchange=()=>{
  clearTimeout(pollTimer);selection=null;resetPanel();const r=rows.find(row=>row.version_id===parseVersion.value);
  if(!r || !ready || busy)return;
  selection={path:'assets/'+r.id+'/versions/'+r.version_id+'/parse',seq:0,group:0,writing:false,data:null};
  $('parse-panel').hidden=false;$('parse-summary').textContent='正在读取解析进度…';void requestProgress(selection);
};
$('parse-refresh').onclick=()=>{if(selection)void requestProgress(selection)};
for(const [id,delta] of [['parse-prev',-1],['parse-next',1]])$(id).onclick=()=>{if(selection?.data){selection.group+=delta;drawPages(selection)}};
function renderRows(items,selected){
  rows=items.slice().sort((a,b)=>b.version-a.version);
  const seen=new Set();target.replaceChildren(new Option('新建资料',''));
  for(const r of rows)if(!seen.has(r.id)){seen.add(r.id);target.add(new Option(r.title+' · v'+r.version,r.id))}
  target.value=seen.has(selected)?selected:'';
  $('list').replaceChildren(...(rows.length?rows.map(entry):[el('p','暂无资料','muted')]));
  parseVersion.replaceChildren(new Option('选择资料版本',''),...rows.map(r=>new Option(r.title+' · v'+r.version,r.version_id)));$('parse').hidden=!rows.length;
}
async function load(reset=false){
  const gen=++generation;busy=true;clearParse();if(reset)clearPrivate();controls();status('正在读取资料…');
  try{
    const m=await me();if(gen!==generation)return;
    if(m.id!==owner)clearPrivate();owner=m.id;$('who').textContent=m.display_name || m.login_name || m.id;
    const selected=target.value, previous=head(selected), data=await request('assets');
    if(!await confirmOwner(gen))return;
    renderRows(data.items.map(record),selected);ready=true;
    if(conflict || (selected && head(selected)?.version!==previous?.version)){
      clearDraft();status('资料版本已刷新，请核对导入目标并重新选择 PDF。');
    }else status('资料已刷新。');
  }catch(e){if(gen===generation){ready=false;$('list').replaceChildren();fail(e,gen,false)}}
  finally{if(gen===generation){busy=false;controls()}}
}
function changed(){
  if(busy || !ready)return;
  ++generation;conflict=false;key=file.files[0]?crypto.randomUUID():null;controls();status(key?'文件已选择。':'请选择 PDF 文件。');
}
file.addEventListener('change',changed);target.addEventListener('change',changed);
$('refresh').onclick=()=>load();
$('import').onsubmit=async event=>{
  event.preventDefault();if(!ready || busy || conflict || !key || !file.files[0])return;
  const gen=++generation, selected=target.value, dest=head(selected), blob=file.files[0];busy=true;controls();status('正在导入…');
  try{
    if(!await confirmOwner(gen))return;
    const headers={'content-type':'application/pdf','x-knowledgeos-request':'1','x-knowledgeos-filename':encodeURIComponent(blob.name),'idempotency-key':key};
    if(selected){headers['x-knowledgeos-asset-id']=dest.id;headers['x-knowledgeos-expected-version']=String(dest.version)}
    const raw=await request('imports',{method:'POST',headers,body:blob});
    if(!await confirmOwner(gen))return;
    const r=record(raw);clearDraft();clearParse();renderRows([r,...rows.filter(old=>old.version_id!==r.version_id)],selected);
    $('result').replaceChildren(entry(r));$('receipt').hidden=false;status('导入成功，已接收 v'+r.version+'。');
  }catch(e){fail(e,gen,true)}finally{if(gen===generation){busy=false;controls()}}
};
function checkSession(){
  if(document.hidden)return;
  if(!owner){if(!busy)void load();return}
  const gen=generation;confirmOwner(gen).catch(e=>{if(gen!==generation)return;if(e.http===401)signedOut();else if(!busy)void load()});
}
window.addEventListener('focus',checkSession);document.addEventListener('visibilitychange',checkSession);
window.addEventListener('pageshow',e=>{if(e.persisted)void load(true)});
void load();
})()</script></body></html>`
}
