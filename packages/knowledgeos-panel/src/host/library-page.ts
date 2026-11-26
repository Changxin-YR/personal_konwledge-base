/** Standalone library surface. Only the cookie-authenticated business API is used. */
export function buildLibraryHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDF 资料库 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;color:#223638;background:#f8faf9;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:#fff;border-bottom:1px solid #d2ddda}header>div,main{max-width:900px;margin:auto;padding:0 22px}header>div,nav,.bar,.links{display:flex;align-items:center;gap:18px;flex-wrap:wrap}header>div{justify-content:space-between;min-height:54px;padding-block:8px}header strong{color:#18565a;font-size:19px}a{color:#176166;text-underline-offset:3px}main{padding-block:24px}h1,h2,p,dl{margin:0}h1{font-size:26px}h2{font-size:18px}section{margin-top:20px;border-top:1px solid #cbd9d6;padding-top:16px}.bar{justify-content:space-between;gap:8px}.muted,dt,small{color:#536866}#who{overflow-wrap:anywhere}form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto;align-items:end;gap:12px;margin-top:12px}label{display:grid;gap:5px;font-weight:600}input,select,button{font:inherit}input,select{width:100%;min-width:0;color:inherit;background:white;border:1px solid #889f9c;border-radius:5px;padding:7px;height:42px}input::file-selector-button{border:0;border-right:1px solid #ccd8d5;background:white;color:#18565a;margin-right:8px;padding:2px 8px 2px 0}button{border:1px solid #698c88;border-radius:5px;padding:6px 12px;background:white;color:#215c5c;cursor:pointer}button[type=submit]{background:#226461;color:white;height:42px}button:disabled,input:disabled,select:disabled{opacity:.6;cursor:default}:focus-visible{outline:3px solid #176d92;outline-offset:3px}#status{margin-top:12px;border-left:3px solid #9ebcb4;padding-left:9px;color:#354d48}#status[data-error]{border-color:#ae622e;color:#794019}#receipt{border-color:#669d90}.entry{padding:12px 0;overflow-wrap:anywhere}.entry+.entry{border-top:1px solid #dde5e2}.entry strong{display:block}.entry dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 12px;margin:5px 0}.entry dd{margin:0}.hash{font:13px/1.7 Consolas,monospace}.links{gap:15px;margin-top:6px}#list>p{padding-block:12px}[hidden]{display:none!important}@media(max-width:640px){header>div,main{padding-inline:14px}main{padding-top:18px}form{grid-template-columns:minmax(0,1fr)}form button{justify-self:start}nav{gap:12px}}
#parse-picker{margin:8px 0;max-width:36rem}#parse-panel{overflow-wrap:anywhere}#parse-panel .links{gap:8px}#parse-pages{list-style:none;margin:8px 0;padding:0}#parse-pages li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;border-top:1px solid #dde5e2;padding:6px 0}#parse-pages strong{min-width:5em}#parse-pages small{flex-basis:100%}#parse-note{color:#794019}
#parse-plan{display:flex;flex-wrap:wrap;align-items:end;gap:8px 14px;margin-block:8px}#parse-ranges-field{flex:1 1 16rem}#parse-ranges{width:100%}#parse-chapters{display:flex;gap:6px 14px;flex-wrap:wrap;max-height:10em;overflow:auto;margin:6px 0}
#mode-picker,#block-picker{max-width:36rem;margin-top:8px}#encoding-picker{grid-column:1/-1;max-width:24rem}#blocks li{padding-block:6px;border-bottom:1px solid #dde5e2}#blocks pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0;font:inherit}#reader{overflow-wrap:anywhere}
#office{overflow-wrap:anywhere}#office-version{max-width:36rem}#office-notes li{white-space:pre-wrap}#office-note-form{grid-template-columns:minmax(5rem,7rem) minmax(0,1fr) auto}#office-body{font:inherit;min-width:0;width:100%;resize:vertical;padding:6px;border:1px solid #889f9c;border-radius:5px}@media(max-width:640px){#office-note-form{grid-template-columns:minmax(0,1fr)}}
#zip{overflow-wrap:anywhere}#zip-resume{max-width:36rem}#zip-entries{list-style:none;padding:0}#zip-entries li{border-bottom:1px solid #dde5e2;padding:8px 0}#zip-entries label{display:flex;align-items:center;gap:8px}#zip-entries input{width:18px;height:18px;flex:none}#zip-entries small{display:block}
#search-form{grid-template-columns:minmax(0,1fr) auto}#search-results{list-style:none;padding:0;margin:4px 0;overflow-wrap:anywhere}#search-results li{padding:8px 0;border-bottom:1px solid #dde5e2}#search-results small{margin-inline-start:8px}#search-results p{white-space:pre-wrap}#search-status{min-height:1.55em;margin-top:6px;color:#536866}
</style></head><body>
<header><div><strong>KnowledgeOS</strong><nav aria-label="业务导航"><a href="/knowledgeos/knowledge">知识条目</a><a href="/knowledgeos/ontology">知识关系</a><a href="/knowledgeos/practice">题库与练习</a><a href="/knowledgeos/review">错题与复习</a><a href="/knowledgeos/notes">笔记</a><a href="/knowledgeos/recall">遮挡背诵</a><a href="/knowledgeos/repositories">仓库与代码</a><a href="/knowledgeos/projects">项目协作</a><a href="/knowledgeos/invitations">邀请码</a><a href="/knowledgeos/account">账号与登录</a><a href="/knowledgeos/ai">AI 工具</a></nav></div></header>
<main><div class="bar"><h1>PDF 资料库</h1><span id="who" class="muted"></span></div>
<section aria-labelledby="search-heading"><h2 id="search-heading">全文检索</h2>
<form id="search-form"><label>关键词<input id="search-query" type="search" maxlength="128" disabled required></label><button id="search-submit" type="submit" disabled>检索</button></form>
<p id="search-status" role="status"></p><ul id="search-results"></ul></section>
<section aria-labelledby="import-heading"><h2 id="import-heading">导入原件</h2>
<label id="mode-picker">导入格式<select id="mode" disabled><option value="pdf">PDF</option><option value="text">Markdown / 纯文本</option><option value="word">Word</option><option value="zip">ZIP 压缩包</option></select></label>
<form id="import"><label id="encoding-picker" hidden>文本编码<select id="encoding" disabled><option value="">自动识别</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030</option></select></label>
<label>导入到<select id="target" disabled><option value="">新建资料</option></select></label>
<label><span id="file-label">PDF 文件</span><input id="file" type="file" accept=".pdf,application/pdf" disabled></label>
<button id="submit" type="submit" disabled>导入 PDF</button></form>
<p id="status" role="status" aria-live="polite" aria-atomic="true">正在核对登录…</p></section>
<section id="zip" aria-labelledby="zip-heading" hidden><h2 id="zip-heading">压缩包清单</h2>
<label>继续处理压缩包<select id="zip-resume"></select></label><div class="links"><button id="zip-refresh" type="button">刷新清单</button></div>
<p id="zip-status" role="status"></p><div id="zip-panel" hidden><strong id="zip-title"></strong><p id="zip-meta" class="muted"></p>
<ul id="zip-entries" aria-label="压缩包成员"></ul><div class="links"><button id="zip-commit" type="button">导入所选文件</button><span id="zip-count"></span></div></div></section>
<section id="receipt" aria-labelledby="receipt-heading" hidden><h2 id="receipt-heading">导入回执</h2><div id="result"></div></section>
<section id="office" aria-labelledby="office-heading" hidden><h2 id="office-heading">Word 转换与质量核对</h2>
<label for="office-version">Word 版本</label><select id="office-version"></select>
<div id="office-panel" hidden><p id="office-status" aria-live="polite" aria-atomic="true"></p>
<div class="links"><button id="office-action" type="button" hidden></button><button id="office-refresh" type="button">刷新转换状态</button></div>
<div id="office-result" hidden><h3>可用转换结果</h3><p id="office-quality"></p>
<div class="links"><a id="office-preview" target="_blank" rel="noopener">预览转换 PDF</a><a id="office-download" download>下载转换 PDF</a></div>
<h3>逐页质量记录</h3><ol id="office-notes" aria-label="逐页质量记录"></ol>
<button id="office-older-notes" type="button" hidden>查看更早质量记录</button>
<form id="office-note-form"><label>页码<input type="number" id="office-page" min="1" step="1" required></label>
<label>质量问题<textarea id="office-body" rows="2" required></textarea></label><button type="submit" id="office-save">保存质量记录</button></form></div>
<section id="office-history" aria-label="转换历史" hidden><h3>转换历史</h3><ol id="office-attempts"></ol>
<div class="links"><button id="office-older" type="button" hidden>更早转换</button><button id="office-newest" type="button" hidden>返回最近转换</button></div></section>
<section id="office-detail" aria-label="历史质量记录" hidden><h3 id="office-detail-title" tabindex="-1">历史质量记录</h3>
<a id="office-detail-pdf" target="_blank" rel="noopener">预览此记录的 PDF</a><ol id="office-detail-notes"></ol>
<div class="links"><button id="office-detail-older" type="button" hidden>更早记录</button><button id="office-detail-newest" type="button" hidden>最新记录</button>
<button id="office-detail-close" type="button">关闭历史记录</button></div></section><p id="office-nav-status" role="status"></p></div></section>
<section id="reader" aria-labelledby="reader-heading" hidden><h2 id="reader-heading">文本回读</h2>
<label id="block-picker">文本版本<select id="block-version"></select></label>
<p id="block-summary" aria-live="polite"></p><ol id="blocks" aria-label="文本块"></ol>
<div id="block-nav" class="links" hidden><button id="block-prev" type="button">上一页</button><button id="block-next" type="button">下一页</button></div>
<button id="block-retry" type="button" hidden>重试读取</button></section>
<section id="parse" aria-labelledby="parse-heading" hidden><h2 id="parse-heading">解析进度</h2>
<label id="parse-picker">资料版本<select id="parse-version"></select></label>
<div id="parse-panel" hidden><p id="parse-summary" aria-live="polite"></p><p id="parse-note" aria-live="polite"></p>
<div id="parse-plan" hidden><label>解析范围<select id="parse-mode"><option value="whole">整本</option><option value="chapters">分章</option></select></label>
<label id="parse-ranges-field" hidden>原书页段<input id="parse-ranges" maxlength="1400" placeholder="1-45, 46-98, 102"></label></div>
<div id="parse-chapters" aria-label="章节页段" hidden></div>
<div class="links"><button id="parse-action" type="button" hidden></button><button id="parse-refresh" type="button">刷新进度</button></div>
<ul id="parse-pages" aria-label="分章节页状态"></ul><div class="links" id="parse-nav" hidden><button id="parse-prev" type="button">上一组</button><span id="parse-range"></span><button id="parse-next" type="button">下一组</button></div></div></section>
<section aria-labelledby="list-heading"><div class="bar"><h2 id="list-heading">我的资料</h2><button id="refresh" type="button">刷新资料</button></div><div id="list"></div></section></main>
<script>(()=>{
'use strict';
const $ = id => document.getElementById(id);
const api = '/knowledge/v1/', file = $('file'), target = $('target');
const mode=$('mode'), encoding=$('encoding'), textTypes={md:'text/markdown',txt:'text/plain'};
const textMode=()=>mode.value==='text';
const wordTypes={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',doc:'application/msword'};
const wordMode=()=>mode.value==='word';
const zipMode=()=>mode.value==='zip';
function fileType(blob){
  if(!blob)return null;
  if(zipMode())return /\.zip$/i.test(blob.name)?'application/zip':null;
  const ext=/\.(pdf|md|txt|docx?)$/i.exec(blob.name)?.[1].toLowerCase();
  return textMode()?textTypes[ext] || null:wordMode()?wordTypes[ext] || null:ext==='pdf'?'application/pdf':null;
}
function drawMode(){
  const text=textMode(), word=wordMode();$('file-label').textContent=text?'文本文件':word?'Word 文件':'PDF 文件';
  file.accept=text?'.md,.txt,text/markdown,text/plain':word?['.docx','.doc',...Object.values(wordTypes)].join(','):'.pdf,application/pdf';
  $('encoding-picker').hidden=!text;$('submit').textContent=text?'导入文本':word?'导入 Word':'导入 PDF';
  target.parentElement.hidden=zipMode();$('zip').hidden=!zipMode();
  if(zipMode()){$('file-label').textContent='ZIP 文件';file.accept='.zip,application/zip';$('submit').textContent='预览压缩包'}
}
let owner = null, generation = 0, busy = false, ready = false, key = null, conflict = false, rows = [];
let searchSequence=0, searchReceipt=null, searchChecking=false;
function status(text,error=false){ $('status').textContent=text; $('status').toggleAttribute('data-error',error) }
function controls(){
  mode.disabled = file.disabled = target.disabled = !ready || busy;
  encoding.disabled = file.disabled || !textMode();
  $('office-version').disabled = $('block-version').disabled = $('parse-version').disabled = !ready || busy;
  $('submit').disabled = file.disabled || !key || conflict;
  $('refresh').disabled = busy;
  $('search-query').disabled=$('search-submit').disabled=!ready||busy;
  if(zipMode()){target.disabled=true;zipControls()}
}
function clearDraft(){ file.value=''; encoding.value=''; key=null; conflict=false }
function clearPrivate(){
  clearSearch();$('search-query').value='';
  clearZip();clearOffice();clearParse();clearReader();mode.value='pdf';drawMode();
  owner=null; ready=false; rows=[]; clearDraft(); target.replaceChildren(new Option('新建资料',''));
  $('who').textContent=''; $('receipt').hidden=true; $('result').replaceChildren(); $('list').replaceChildren();
}
function signedOut(){ ++generation; busy=false; clearPrivate(); controls(); status('请先登录：前往「账号与登录」，登录后刷新资料。',true) }
function problem(http){ return Object.assign(new Error(),{http}) }
async function request(path,options,readBody=true){
  const r=await fetch(api+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok) throw problem(r.status);
  if(readBody)return (await r.json()).data;
}
async function me(){ const m=await request('me'); if(!m || typeof m.id!=='string' || !m.id)throw problem(502); return m }
// Every asynchronous commit belongs to both an operation and the same session principal.
async function confirmOwner(gen){
  return checkOwnerWhile(()=>gen===generation);
}
async function checkOwnerWhile(current){
  if(!current())return false;
  const m=await me(); if(!current())return false;
  if(m.id!==owner){ void load(true); return false } return true;
}
function fail(e,gen,upload){
  if(gen!==generation)return;
  if(e.http===401){signedOut();return}
  if(e.http===403 || e.http===404){
    ++generation; busy=false; clearPrivate(); controls(); status('资料不可访问。请核对账号和权限，再刷新资料。',true); return;
  }
  if(!upload){status('无法读取资料。请检查连接后刷新资料。',true);return}
  const format=zipMode()?'ZIP 压缩包':textMode()?'文本文件':wordMode()?'Word 文件':'PDF';
  const hint={400:'文件或导入信息无效，请重新选择'+format+'。',409:'资料或请求状态已变化，请刷新资料后核对版本再导入。',413:'文件过大，请重新选择较小的'+format+'。',415:'格式不受支持，请重新选择'+format+'。',422:textMode()?'无法导入此文本，请核对编码或重新选择文件。':'无法导入此文件，请重新选择有效的 PDF。',507:'存储空间不足，请联系管理员释放空间后重试。'};
  if(e.http===409)conflict=true;
  status(zipMode() && e.http===422?'压缩包无效或超出安全限制，未导入任何文件。':wordMode() && e.http===422?'无法导入此 Word 文件，请核对原件后重新选择。':hint[e.http] || '未收到有效回执。请检查连接或服务状态，保留当前选择并重试。',true);
}
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function clearSearch(message=''){
  searchSequence++;searchReceipt=null;$('search-results').replaceChildren();$('search-status').textContent=message;
}
function searchRecord(r){
  if(!r||!uuid.test(r.asset_id)||!uuid.test(r.version_id)||!Number.isSafeInteger(r.version)||r.version<1||
    !Number.isSafeInteger(r.ordinal)||r.ordinal<1||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start||
    typeof r.title!=='string'||typeof r.snippet!=='string'||typeof r.quote!=='string'||!['pdf','text','office'].includes(r.kind)||
    (r.kind==='office'?!uuid.test(r.conversion_id):r.conversion_id!==undefined)||!/^[a-f0-9]{64}$/.test(r.source_hash))throw problem(502);
  const li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('small'),p=document.createElement('p');
  a.href='/knowledgeos/reader?'+new URLSearchParams({asset:r.asset_id,version:r.version_id,unit:String(r.ordinal),
    ...(r.kind==='office'?{conversion:r.conversion_id}:{}),match:r.start+':'+r.end+':'+r.source_hash});
  a.textContent=r.title;meta.textContent='v'+r.version+' · '+(r.kind==='text'?'文本块 '+r.ordinal:(r.kind==='office'?'转换件 · ':'')+'第 '+r.ordinal+' 页');
  p.textContent=r.snippet;li.append(a,meta,p);return li;
}
$('search-form').onsubmit=async e=>{
  e.preventDefault();const query=$('search-query').value.trim();if(!ready||!owner||!query||document.hidden)return;
  clearSearch('检索中…');const s=searchSequence,gen=generation,actor=owner;
  const current=()=>s===searchSequence&&gen===generation&&actor===owner&&!document.hidden;
  try{
    const data=await request('search',{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1'},body:JSON.stringify({query})});
    if(!await checkOwnerWhile(current))return;
    if(data?.actor_id!==actor||!uuid.test(data.query_id)||!Array.isArray(data.items)||data.items.length>30)throw problem(502);
    const nodes=data.items.map(searchRecord),access=await request('search/'+data.query_id+'/access',{signal:AbortSignal.timeout(2500)});
    if(!current()||access?.actor_id!==actor||access.query_id!==data.query_id)return;
    $('search-results').replaceChildren(...nodes);searchReceipt=nodes.length?data.query_id:null;
    $('search-status').textContent=nodes.length?'显示 '+nodes.length+' 条':'没有匹配的可访问内容。';
  }catch(e){if(current())clearSearch(e.http===422?'请输入有效关键词。':'无法确认检索结果，请重试。')}
};
$('search-query').oninput=()=>clearSearch();
async function checkSearch(){
  const id=searchReceipt,s=searchSequence,actor=owner;
  if(!id||document.hidden||searchChecking)return;
  searchChecking=true;
  try{const a=await request('search/'+id+'/access',{signal:AbortSignal.timeout(2500)});
    if(s===searchSequence&&(a?.actor_id!==actor||a.query_id!==id))clearSearch('检索权限已变化，请重查。');
  }catch{if(s===searchSequence)clearSearch('无法确认检索权限，请重查。')}
  finally{searchChecking=false}
}
function record(r){
  if(!r || !uuid.test(r.id) || !uuid.test(r.version_id) || typeof r.title!=='string' || !Number.isSafeInteger(r.version) || r.version<1 || !Number.isSafeInteger(r.byte_length) || r.byte_length<0 || !/^[a-f\d]{64}$/i.test(r.sha256))throw problem(502);
  return {...r,media_type:r.media_type===undefined?'application/pdf':r.media_type};
}
const isPdf=r=>r.media_type==='application/pdf', isText=r=>Object.values(textTypes).includes(r.media_type);
const isWord=r=>Object.values(wordTypes).includes(r.media_type);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function readLink(r,label,params={}){const a=el('a',label);a.href='/knowledgeos/reader?'+new URLSearchParams({asset:r.id,version:r.version_id,...params});return a}
function entry(r,withReader=false){
  const node=el('div',null,'entry'), meta=el('dl'), links=el('div',null,'links');
  for(const [label,value] of [['版本','v'+r.version],['大小',r.byte_length+' 字节'],['SHA-256',r.sha256]])
    meta.append(el('dt',label),el('dd',value,label==='SHA-256'?'hash':''));
  const path=api+'assets/'+r.id+'/versions/'+r.version_id+'/original';
  if(withReader)links.append(readLink(r,'打开阅读'));
  if(isPdf(r)){const view=el('a','查看原件');view.href=path;view.target='_blank';view.rel='noopener';links.append(view)}
  const save=el('a',isPdf(r)?'导出 PDF':'导出原件');save.href=path+'?download=1';save.download='';links.append(save);
  node.append(el('strong',r.title),meta,links);return node;
}
function head(id){return rows.find(r=>r.id===id)}
const archive=$('zip-resume'), zipStates={available:'可选择',selected:'待导入',imported:'已导入',failed:'导入失败'};
const archiveStates={staged:'待选择',selected:'导入中',partial:'有失败项',imported:'已导入所选文件'};
const zipReasons={ZIP_DIRECTORY:'目录',ZIP_UNSUPPORTED_MEDIA:'不支持此文件格式',ZIP_INTEGRITY:'内容校验失败，请重新打包',ZIP_NESTED_ARCHIVE:'不支持嵌套压缩包',INVALID_WORD:'Word 文件无效',INVALID_PDF:'PDF 文件无效',INVALID_FILENAME:'文件名过长',TEXT_TOO_LARGE:'文本超出大小限制',TEXT_BINARY:'包含非文本内容',TEXT_INVALID_ENCODING:'文本编码无效',TEXT_INVALID_INPUT:'文本内容无效'};
let zipSeq=0, manifest=null, picked=new Set(), retrySelection=null;
function clearManifest(){
  manifest=null;picked.clear();retrySelection=null;$('zip-panel').hidden=true;
  for(const id of ['zip-title','zip-meta','zip-status','zip-count','zip-entries'])$(id).replaceChildren();
}
function clearZip(){++zipSeq;clearManifest();archive.replaceChildren(new Option('选择压缩包',''))}
function zipControls(){
  archive.disabled=$('zip-refresh').disabled=busy || !ready;
  $('zip-commit').disabled=busy || !ready || !manifest || !picked.size;
  $('zip-commit').textContent=retrySelection?'重试上次提交':'导入所选文件';
  $('zip-count').textContent='已勾选 '+picked.size+' 项';
  for(const input of $('zip-entries').querySelectorAll('input'))input.disabled=busy || !ready || !!retrySelection || input.dataset.eligible!=='yes';
}
function zipHeader(d){
  if(!d || !uuid.test(d.id) || typeof d.title!=='string' || !/^[a-f\d]{64}$/i.test(d.sha256))throw problem(502);
  return d;
}
const zipSize=n=>Number.isSafeInteger(n)&&n>=0;
function showManifest(d,expected,previous=new Set()){
  zipHeader(d);if((expected && d.id!==expected) || typeof d.state!=='string' || !zipSize(d.byte_length) || !Array.isArray(d.entries))throw problem(502);
  const seen=new Set(),counts={selected:0,imported:0,failed:0},next=new Set();
  const nodes=d.entries.map(e=>{
    if(!e || !uuid.test(e.id) || seen.has(e.id) || typeof e.path!=='string' || typeof e.name!=='string' ||
      !zipSize(e.size) || !zipSize(e.compressed_size) || !Object.hasOwn(zipStates,e.state) ||
      !(e.reason===null || typeof e.reason==='string') || !(e.media_type===null || typeof e.media_type==='string'))throw problem(502);
    seen.add(e.id);if(Object.hasOwn(counts,e.state))counts[e.state]++;
    const eligible=e.reason===null && e.state!=='imported',li=el('li'),label=el('label'),input=el('input');
    input.type='checkbox';input.value=e.id;input.dataset.eligible=eligible?'yes':'no';
    input.checked=eligible && (e.state==='selected' || previous.has(e.id));if(input.checked)next.add(e.id);
    input.onchange=()=>{if(manifest!==d || !eligible || busy || retrySelection)return;if(input.checked)picked.add(e.id);else picked.delete(e.id);zipControls()};
    label.append(input,el('span',e.path));li.append(label,el('small','原始名称：'+e.name+' · '+e.size+' 字节（压缩后 '+e.compressed_size+' 字节）'+(e.media_type?' · '+e.media_type:'')));
    li.append(el('span',e.reason!==null?'不可导入：'+(zipReasons[e.reason]??e.reason):zipStates[e.state]+(e.error?'：'+(zipReasons[e.error]??e.error):'')));
    if(e.state==='imported' && e.receipt)li.append(entry(record(e.receipt)));
    return li;
  });
  const opt=Array.from(archive.options).find(o=>o.value===d.id),caption=d.title+' · '+(archiveStates[d.state]??d.state);if(opt)opt.textContent=caption;else archive.add(new Option(caption,d.id));archive.value=d.id;
  manifest=d;picked=next;retrySelection=null;$('zip-title').textContent=d.title;$('zip-meta').textContent=d.byte_length+' 字节 · SHA-256 '+d.sha256;
  $('zip-status').textContent='共 '+nodes.length+' 项 · 待导入 '+counts.selected+' · 已导入 '+counts.imported+' · 失败 '+counts.failed;
  $('zip-entries').replaceChildren(...nodes);$('zip-panel').hidden=false;zipControls();
}
async function readZip(id=''){
  if(!zipMode() || !ready || busy)return;
  const seq=++zipSeq,current=()=>seq===zipSeq && zipMode();clearManifest();$('zip-status').textContent='正在读取清单…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request(id?'imports/'+id+'/entries':'imports');if(!await checkOwnerWhile(current))return;
    if(id)showManifest(data,id);
    else{
      if(!Array.isArray(data?.items))throw problem(502);
      const opts=data.items.map(zipHeader).map(d=>new Option(d.title+(typeof d.state==='string'?' · '+(archiveStates[d.state]??d.state):''),d.id));
      archive.replaceChildren(new Option('选择压缩包',''),...opts);$('zip-status').textContent=opts.length?'请选择要继续处理的压缩包。':'暂无压缩包。';
    }
  }catch(e){if(!current())return;if([401,403,404].includes(e.http))fail(e,generation,false);else $('zip-status').textContent='清单读取失败，请刷新重试。'}
}
archive.onchange=()=>void readZip(archive.value);$('zip-refresh').onclick=()=>void readZip(archive.value);
$('zip-commit').onclick=async()=>{
  if(!ready || busy || !zipMode() || !manifest || !picked.size)return;
  const id=manifest.id,gen=++generation,seq=++zipSeq,current=()=>seq===zipSeq && gen===generation;
  const attempt=retrySelection || {key:crypto.randomUUID(),ids:[...picked].sort()};retrySelection=attempt;
  busy=true;controls();$('zip-status').textContent='正在导入 '+attempt.ids.length+' 项…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request('imports/'+id+'/selection',{method:'POST',headers:{'x-knowledgeos-request':'1','content-type':'application/json','idempotency-key':attempt.key},body:JSON.stringify({entry_ids:attempt.ids})});
    if(!await checkOwnerWhile(current))return;
    showManifest(data,id,new Set(attempt.ids));
    // Only published receipts enter the ordinary version pickers, never a preview row.
    const added=data.entries.filter(e=>e.state==='imported' && e.receipt).map(e=>record(e.receipt));
    if(added.length){const ids=new Set(added.map(r=>r.version_id));clearOffice();clearReader();clearParse();renderRows([...added,...rows.filter(r=>!ids.has(r.version_id))],target.value)}
  }catch(e){if(!current())return;if([401,403,404].includes(e.http))fail(e,gen,false);
    else $('zip-status').textContent='未确认导入结果。可重试上次提交，或刷新清单核对已导入项。';
  }finally{if(current()){busy=false;controls()}}
};
const docStates={idle:'未开始',queued:'排队中',running:'解析中',complete:'解析完成',partial:'部分完成',failed:'解析失败',cancelled:'已取消'};
const pageStates={pending:'未处理',ready:'可用',review:'待复核',failed:'失败'};
const pageSize=25, parseVersion=$('parse-version'), writes=new Map();
let selection=null, pollTimer;
function clearParse(){
  clearTimeout(pollTimer);selection=null;parseVersion.replaceChildren();$('parse').hidden=true;resetPanel();
}
function resetPanel(){
  $('parse-panel').hidden=true;$('parse-action').hidden=true;$('parse-nav').hidden=true;
  $('parse-plan').hidden=$('parse-chapters').hidden=true;$('parse-chapters').replaceChildren();
  $('parse-summary').textContent='';$('parse-note').textContent='';$('parse-pages').replaceChildren();$('parse-range').textContent='';
}
function progress(data){
  const nullableText=v=>v===null || typeof v==='string';
  if(!data || !Object.hasOwn(docStates,data.state) || !Number.isSafeInteger(data.total) || data.total<0 || !nullableText(data.error) || !Array.isArray(data.pages))throw problem(502);
  const seen=new Set(), counts={pending:0,ready:0,review:0,failed:0};let outside=0;
  const chapters=data.chapters===undefined?[]:data.chapters;
  if(!Array.isArray(chapters)||chapters.length>100||chapters.some((r,i)=>!Array.isArray(r)||r.length!==2||!r.every(Number.isSafeInteger)||r[0]<1||r[1]<r[0]||r[1]>10000||i>0&&chapters[i-1][1]>=r[0]))throw problem(502);
  for(const p of data.pages){
    if(!p || !Number.isSafeInteger(p.page) || p.page<1 || p.page>data.total || seen.has(p.page) || !Object.hasOwn(pageStates,p.state) || typeof p.chapter!=='string' || !nullableText(p.error))throw problem(502);
    if(chapters.length&&p.selected!==Number(chapters.some(([a,b])=>p.page>=a&&p.page<=b)))throw problem(502);
    seen.add(p.page);if(p.selected===0)outside++;else ++counts[p.state];
  }
  return {...data,counts,outside,chapters,pages:data.pages.sort((a,b)=>a.page-b.page)};
}
function activeJob(state){return state==='queued' || state==='running'}
function drawPages(s){
  const {pages,state}=s.data, last=Math.max(0,Math.ceil(pages.length/pageSize)-1);
  s.group=Math.min(last,Math.max(0,s.group));const from=s.group*pageSize, end=Math.min(from+pageSize,pages.length);
  const items=pages.slice(from,end).map(p=>{
    const li=el('li');li.append(el('strong','第 '+p.page+' 页'),el('span',p.selected===0?'未选':pageStates[p.state]),el('span',p.chapter));
    if(p.state==='ready'||p.state==='review')li.append(readLink(s.row,'阅读第 '+p.page+' 页',{unit:p.page}));
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
  const {state,total,counts,error,outside,chapters,pages}=s.data, action=$('parse-action');
  const editable=state==='idle'||error==='CHAPTER_RANGE_OUTSIDE_DOCUMENT';
  const sectionMode=$('parse-mode');$('parse-plan').hidden=!editable;
  sectionMode.disabled=s.writing||state!=='idle';if(state!=='idle'&&editable)sectionMode.value='chapters';
  $('parse-ranges-field').hidden=sectionMode.value!=='chapters';$('parse-ranges').disabled=s.writing;
  const chapterList=$('parse-chapters');chapterList.hidden=!chapters.length;
  chapterList.replaceChildren(...chapters.map(([a,b],i)=>{
    const label='分段 '+(i+1)+' · '+a+(a===b?'':'–'+b)+' 页';
    const first=pages.find(p=>p.page>=a&&p.page<=b&&['ready','review'].includes(p.state));
    return first?readLink(s.row,label,{unit:first.page}):el('span',label);
  }));
  const summary=docStates[state]+' · 共 '+total+' 页'+Object.keys(pageStates).map(k=>' · '+pageStates[k]+' '+counts[k]).join('')+(chapters.length?' · 未选 '+outside:'');
  if($('parse-summary').textContent!==summary)$('parse-summary').textContent=summary;
  $('parse-note').textContent=error==='CHAPTER_RANGE_OUTSIDE_DOCUMENT'?'页段超出原件页数。':error || '';
  const labels={idle:'开始解析',queued:'取消解析',running:'取消解析',failed:'重新解析',cancelled:'继续解析'};
  action.hidden=!labels[state];action.textContent=labels[state] || '';action.disabled=action.hidden || s.writing;
  action.onclick=action.hidden?null:()=>{
    if(editable&&sectionMode.value==='chapters'){
      const pieces=$('parse-ranges').value.normalize('NFKC').trim().split(/\s*[,、]\s*/);
      if(pieces.length>100||pieces.some(v=>!/^\d{1,5}(?:\s*[-–]\s*\d{1,5})?$/.test(v))){$('parse-note').textContent='原书页段格式无效。';return}
      const ranges=pieces.map(v=>{const [a,b]=v.split(/[-–]/).map(Number);return [a,b??a]});
      if(ranges.some(([a,b],i)=>a<1||b<a||b>10000||i>0&&ranges[i-1][1]>=a)){$('parse-note').textContent='页段须按原书顺序排列，且不能重叠。';return}
      void requestProgress(s,'/chapters',ranges);return;
    }
    void requestProgress(s,activeJob(state)?'/cancel':'/start');
  };drawPages(s);
}
async function requestProgress(s,action='',ranges){
  if(selection!==s || s.writing)return;
  clearTimeout(pollTimer);const seq=++s.seq, current=()=>selection===s && s.seq===seq;
  s.writing=!!action;$('parse-refresh').disabled=true;
  if(s.writing){drawProgress(s);$('parse-note').textContent='正在提交…'}
  try{
    // Returning to a version while its previous POST is in flight must read after that write.
    if(writes.has(s.path))await writes.get(s.path);
    if(!await checkOwnerWhile(current))return;
    const req=request(s.path+action,action?{method:'POST',headers:{'x-knowledgeos-request':'1',...(ranges?{'content-type':'application/json'}:{})},
      ...(ranges?{body:JSON.stringify(ranges)}:{})}:undefined);
    if(action)writes.set(s.path,req.catch(()=>{}));
    let data;try{data=await req}finally{if(action)writes.delete(s.path)}
    if(!await checkOwnerWhile(current))return;
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
  if(!r || !isPdf(r) || !ready || busy)return;
  $('parse-mode').value='whole';$('parse-ranges').value='';
  selection={row:r,path:'assets/'+r.id+'/versions/'+r.version_id+'/parse',seq:0,group:0,writing:false,data:null};
  $('parse-panel').hidden=false;$('parse-summary').textContent='正在读取解析进度…';void requestProgress(selection);
};
$('parse-mode').onchange=()=>{if(selection?.data)drawProgress(selection)};
$('parse-refresh').onclick=()=>{if(selection)void requestProgress(selection)};
for(const [id,delta] of [['parse-prev',-1],['parse-next',1]])$(id).onclick=()=>{if(selection?.data){selection.group+=delta;drawPages(selection)}};
const blockVersion=$('block-version'), blockLimit=5;
let blockRequest=null;
function resetBlocks(){
  blockRequest=null;$('block-summary').textContent='';$('blocks').replaceChildren();$('block-nav').hidden=$('block-retry').hidden=true;
}
function clearReader(){resetBlocks();blockVersion.replaceChildren();$('reader').hidden=true}
function validateBlocks(data,r,from){
  if(!data || data.version_id!==r.version_id || typeof data.encoding!=='string' || !Number.isSafeInteger(data.total) || data.total<0 ||
    from>Math.max(1,data.total) || !Array.isArray(data.blocks) || data.blocks.length!==Math.min(blockLimit,data.total-from+1))throw problem(502);
  for(const [i,b] of data.blocks.entries()){
    if(!b || b.ordinal!==from+i || typeof b.kind!=='string' || typeof b.text!=='string' ||
      !Number.isSafeInteger(b.start) || !Number.isSafeInteger(b.end) || b.start<0 || b.end<b.start)throw problem(502);
  }
}
async function readBlocks(r,from){
  resetBlocks();const req={r,from};blockRequest=req;const current=()=>blockRequest===req;
  $('block-summary').textContent='正在读取文本块…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request('assets/'+r.id+'/versions/'+r.version_id+'/blocks?from='+from+'&limit='+blockLimit);
    if(!await checkOwnerWhile(current))return;
    validateBlocks(data,r,from);
    const end=from+data.blocks.length-1;
    $('block-summary').textContent=data.encoding+' · '+(data.total?'第 '+from+'–'+end+' 块，共 '+data.total+' 块':'暂无文本块');
    $('blocks').start=from;$('blocks').replaceChildren(...data.blocks.map(b=>{
      const li=el('li');li.append(el('small',b.kind+' · 字符偏移 ['+b.start+', '+b.end+')'),el('pre',b.text));
      if(typeof b.anchor==='string' && b.anchor)li.append(el('small','锚点：'+b.anchor));return li;
    }));
    $('block-prev').disabled=from===1;$('block-next').disabled=end>=data.total;$('block-nav').hidden=data.total<=blockLimit;
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    $('block-summary').textContent='无法读取文本块。';$('block-retry').hidden=false;
  }
}
blockVersion.onchange=()=>{
  const r=rows.find(row=>row.version_id===blockVersion.value);
  if(r && isText(r) && ready && !busy)void readBlocks(r,1);else resetBlocks();
};
for(const [id,delta] of [['block-prev',-blockLimit],['block-next',blockLimit],['block-retry',0]]){
  $(id).onclick=()=>{if(blockRequest)void readBlocks(blockRequest.r,blockRequest.from+delta)};
}
const officeVersion=$('office-version'), officeWrites=new Map();
const officeStates={queued:'排队中',running:'转换中',ready:'转换完成',failed:'转换失败',cancelled:'已取消',superseded:'源版本已变化'};
let office=null;
function resetOfficeResult(){
  $('office-result').hidden=true;$('office-quality').textContent='';$('office-notes').replaceChildren();
  $('office-older-notes').hidden=true;
  $('office-preview').removeAttribute('href');$('office-download').removeAttribute('href');
  $('office-body').value='';$('office-page').value='1';
}
function resetOffice(){
  clearTimeout(office?.timer);office=null;resetOfficeHistory();resetOfficeResult();$('office-panel').hidden=true;
  $('office-status').textContent='';$('office-action').hidden=true;$('office-refresh').disabled=false;
}
function clearOffice(){resetOffice();officeVersion.replaceChildren();$('office').hidden=true}
function officeData(data,version){
  if(data?.version_id!==version || !Array.isArray(data.conversions) || data.conversions.length>10 ||
    (data.next_before!==undefined && (!uuid.test(data.next_before)||data.next_before!==data.conversions.at(-1)?.id)))throw problem(502);
  const ids=new Set();
  if(data.latest_ready!==undefined && data.latest_ready?.state!=='ready')throw problem(502);
  for(const c of [...data.conversions,...(data.latest_ready?[data.latest_ready]:[])]){
    if(!c || typeof c.id!=='string' || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) || !Object.hasOwn(officeStates,c.state) ||
      (c.page_count!=null && (!Number.isSafeInteger(c.page_count) || c.page_count<0)) || (c.state==='ready' && !(c.page_count>0)) ||
      (c.failure_code!=null && typeof c.failure_code!=='string') || !Array.isArray(c.missing_fonts) || !c.missing_fonts.every(f=>typeof f==='string') ||
      !Array.isArray(c.notes) || c.notes.length>10 || !c.notes.every(n=>n && Number.isSafeInteger(n.page) && n.page>=1 && n.page<=c.page_count && typeof n.body==='string') ||
      (c.notes_next_before!==undefined && (!uuid.test(c.notes_next_before)||c.notes_next_before!==c.notes[0]?.id)))throw problem(502);
    ids.add(c.id);
  }
  return data;
}
function closeOfficeDetail(){
  $('office-detail').hidden=true;$('office-detail-title').textContent='历史质量记录';
  $('office-detail-notes').replaceChildren();$('office-detail-pdf').removeAttribute('href');
}
function resetOfficeHistory(){
  closeOfficeDetail();$('office-history').hidden=true;$('office-attempts').replaceChildren();$('office-nav-status').textContent='';
}
function drawAttempts(s){
  const page=s.history||s.head,history=$('office-history');
  history.hidden=!s.history && page.conversions.length<2 && !page.next_before;
  $('office-older').hidden=!page.next_before;$('office-newest').hidden=!s.history;
  // Don't replace focused controls on every live status poll.
  const key=JSON.stringify(page.conversions.map(c=>[c.id,c.state,c.failure_code]));if(key===s.historyKey)return;s.historyKey=key;
  $('office-attempts').replaceChildren(...page.conversions.map(c=>{
    const li=el('li',officeStates[c.state]+' · '+c.id+(c.failure_code?' · '+c.failure_code:''));
    if(c.state==='ready'){
      const b=el('button','查看质量记录');b.type='button';b.setAttribute('aria-label','查看质量记录：'+c.id);
      b.onclick=()=>readOfficePage(s,{conversion:c.id});li.append(' ',b);
      li.append(' ',readLink(s.row,'阅读此转换',{conversion:c.id}));
    }
    return li;
  }));
}
const noteRows=c=>c.notes.map(n=>el('li','第 '+n.page+' 页：'+n.body));
async function readOfficePage(s,query){
  if(!s?.head)return;
  const token=++s.nav,current=()=>office===s && token===s.nav;
  $('office-nav-status').textContent='正在读取历史…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=officeData(await request(s.path+'?'+new URLSearchParams(query)),s.version);
    if(!await checkOwnerWhile(current))return;
    if(query.conversion){
      const c=data.conversions[0];if(data.conversions.length!==1 || c.id!==query.conversion || c.state!=='ready')throw problem(502);
      s.detail=c;$('office-detail-title').textContent='历史质量记录 · '+c.id;
      $('office-detail-pdf').href=api+s.path+'/'+c.id+'/pdf';$('office-detail-notes').replaceChildren(...noteRows(c));
      $('office-detail-older').hidden=!c.notes_next_before;$('office-detail-newest').hidden=!query.notes_before;
      $('office-detail').hidden=false;$('office-detail-title').focus();
    }else{
      s.history=data;s.detail=null;closeOfficeDetail();drawAttempts(s);
      $('office-newest').focus();
    }
    $('office-nav-status').textContent=query.conversion?'质量记录已刷新。':'已显示更早转换。';
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    $('office-nav-status').textContent='历史记录读取失败，请重试。';
  }
}
function officeControls(s){
  $('office-action').disabled=$('office-page').disabled=$('office-body').disabled=$('office-save').disabled=s.writing;
  $('office-refresh').disabled=s.writing;
}
function drawOffice(s,data){
  s.head=data;drawAttempts(s);
  const items=data.conversions,latest=items[0],result=data.latest_ready||items.find(c=>c.state==='ready');
  const statusText=latest?'最近一次：'+officeStates[latest.state]+(latest.failure_code?' · '+latest.failure_code:''):'尚未转换。';
  if($('office-status').textContent!==statusText)$('office-status').textContent=statusText;
  s.active=items.find(c=>activeJob(c.state));
  $('office-action').hidden=false;$('office-action').textContent=s.active?'取消转换':latest?'重新转换':'开始转换';
  // Bind the draft to the actual reviewed PDF, never silently move it to a new result.
  if(s.result?.id!==result?.id)resetOfficeResult();
  s.result=result;
  if(!result)return;
  const path=api+s.path+'/'+result.id+'/pdf';
  $('office-preview').href=path;$('office-download').href=path+'?download=1';
  $('office-result').hidden=false;$('office-page').max=String(result.page_count);
  $('office-quality').textContent=(result!==latest?'上一次可用结果':'当前可用结果')+' · '+result.page_count+' 页 · '+
    (result.missing_fonts.length?'缺失字体：'+result.missing_fonts.join('、'):'未报告缺失字体');
  $('office-notes').replaceChildren(...noteRows(result));$('office-older-notes').hidden=!result.notes_next_before;
}
$('office-older').onclick=()=>{const s=office;void readOfficePage(s,{before:(s.history||s.head).next_before})};
$('office-newest').onclick=()=>{const s=office;++s.nav;s.history=s.detail=null;closeOfficeDetail();drawAttempts(s);void syncOffice(s);$('office-nav-status').textContent='已返回最近转换。'};
$('office-older-notes').onclick=()=>{const c=office.result;void readOfficePage(office,{conversion:c.id,notes_before:c.notes_next_before})};
$('office-detail-older').onclick=()=>{const c=office.detail;void readOfficePage(office,{conversion:c.id,notes_before:c.notes_next_before})};
$('office-detail-newest').onclick=()=>void readOfficePage(office,{conversion:office.detail.id});
$('office-detail-close').onclick=()=>{++office.nav;office.detail=null;closeOfficeDetail();$('office-nav-status').textContent='';$('office-refresh').focus()};
async function syncOffice(s,action='',note=null){
  if(!s || s!==office || s.writing)return;
  clearTimeout(s.timer);const seq=++s.seq,current=()=>s===office && s.seq===seq;
  s.writing=!!action;officeControls(s);
  try{
    // A new selection of the same version must observe an already-dispatched write.
    if(officeWrites.has(s.path))await officeWrites.get(s.path);
    if(!await checkOwnerWhile(current))return;
    if(action){
      const headers={'x-knowledgeos-request':'1'};
      if(note || action==='/start')headers['idempotency-key']=crypto.randomUUID();
      if(note)headers['content-type']='application/json';
      const write=request(s.path+action,{method:'POST',headers,body:note?JSON.stringify(note):undefined},false);
      officeWrites.set(s.path,write.catch(()=>{}));
      try{await write}finally{officeWrites.delete(s.path)}
      if(!await checkOwnerWhile(current))return;
      if(note)$('office-body').value='';
    }
    const data=await request(s.path);
    if(!await checkOwnerWhile(current))return;
    drawOffice(s,officeData(data,s.version));
    if(s.active)s.timer=setTimeout(()=>syncOffice(s),2000);
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    ++s.nav;s.head=s.history=s.historyKey=s.detail=null;resetOfficeHistory();s.result=s.active=null;resetOfficeResult();$('office-action').hidden=true;
    $('office-status').textContent='无法确认转换状态，请刷新转换状态后再操作。';
  }finally{if(current()){s.writing=false;officeControls(s)}}
}
officeVersion.onchange=()=>{
  resetOffice();const r=rows.find(row=>row.version_id===officeVersion.value);
  if(!r || !isWord(r) || !ready || busy)return;
  office={row:r,version:r.version_id,path:'assets/'+r.id+'/versions/'+r.version_id+'/office',seq:0,nav:0,writing:false};
  $('office-panel').hidden=false;$('office-status').textContent='正在读取转换状态…';void syncOffice(office);
};
$('office-refresh').onclick=()=>void syncOffice(office);
$('office-action').onclick=()=>{if(office)void syncOffice(office,office.active?'/'+office.active.id+'/cancel':'/start')};
$('office-note-form').onsubmit=e=>{
  e.preventDefault();const r=office?.result,page=$('office-page').valueAsNumber,body=$('office-body').value.trim();
  if(!r || !Number.isSafeInteger(page) || page<1 || page>r.page_count)return;
  if(!body){$('office-body').focus();$('office-status').textContent='请输入质量问题。';return}
  void syncOffice(office,'/'+r.id+'/notes',{page,body});
};
function renderRows(items,selected){
  rows=items.slice().sort((a,b)=>b.version-a.version);
  const seen=new Set();target.replaceChildren(new Option('新建资料',''));
  for(const r of rows)if(!seen.has(r.id)){seen.add(r.id);target.add(new Option(r.title+' · v'+r.version,r.id))}
  target.value=seen.has(selected)?selected:'';
  $('list').replaceChildren(...(rows.length?rows.map(r=>entry(r,true)):[el('p','暂无资料','muted')]));
  for(const [select,section,predicate,prompt] of [[parseVersion,'parse',isPdf,'选择资料版本'],[blockVersion,'reader',isText,'选择文本版本'],[officeVersion,'office',isWord,'选择 Word 版本']]){
    const versions=rows.filter(predicate);select.replaceChildren(new Option(prompt,''),...versions.map(r=>new Option(r.title+' · v'+r.version,r.version_id)));
    $(section).hidden=!versions.length;
  }
}
async function load(reset=false){
  const gen=++generation;busy=true;clearZip();clearOffice();clearReader();clearParse();if(reset)clearPrivate();controls();status('正在读取资料…');
  try{
    const m=await me();if(gen!==generation)return;
    if(m.id!==owner)clearPrivate();owner=m.id;$('who').textContent=m.display_name || m.login_name || m.id;
    const selected=target.value, previous=head(selected), data=await request('assets');
    if(!await confirmOwner(gen))return;
    renderRows(data.items.map(record),selected);ready=true;
    if(conflict || (selected && head(selected)?.version!==previous?.version)){
      clearDraft();status('资料版本已刷新，请核对导入目标并重新选择文件。');
    }else status('资料已刷新。');
  }catch(e){if(gen===generation){ready=false;$('list').replaceChildren();fail(e,gen,false)}}
  finally{if(gen===generation){busy=false;controls();if(zipMode() && ready)void readZip()}}
}
function changed(){
  if(busy || !ready)return;
  ++generation;conflict=false;key=fileType(file.files[0])?crypto.randomUUID():null;controls();
  status(key?'文件已选择。':zipMode()?'请选择 .zip 压缩包。':textMode()?'请选择 .md 或 .txt 文本文件。':wordMode()?'请选择 .docx 或 .doc 文件。':'请选择 PDF 文件。',!!file.files[0] && !key);
}
mode.onchange=()=>{clearZip();clearDraft();drawMode();changed();if(zipMode())void readZip()};
for(const control of [file,target,encoding])control.addEventListener('change',changed);
$('refresh').onclick=()=>load();
$('import').onsubmit=async event=>{
  event.preventDefault();if(!ready || busy || conflict || !key || !file.files[0])return;
  const gen=++generation, selected=zipMode()?'':target.value, dest=head(selected), blob=file.files[0], type=fileType(blob);
  if(!type)return;if(zipMode()){++zipSeq;clearManifest();archive.value='';$('receipt').hidden=true}busy=true;controls();status(zipMode()?'正在上传并读取清单…':'正在导入…');
  try{
    if(!await confirmOwner(gen))return;
    const headers={'content-type':type,'x-knowledgeos-request':'1','x-knowledgeos-filename':encodeURIComponent(blob.name),'idempotency-key':key};
    if(textMode() && encoding.value)headers['x-knowledgeos-encoding']=encoding.value;
    if(selected){headers['x-knowledgeos-asset-id']=dest.id;headers['x-knowledgeos-expected-version']=String(dest.version)}
    const raw=await request('imports',{method:'POST',headers,body:blob});
    if(!await confirmOwner(gen))return;
    if(zipMode()){showManifest(raw);clearDraft();status('清单已就绪，请核对后选择文件。');return}
    const r=record(raw);clearDraft();clearOffice();clearParse();clearReader();renderRows([r,...rows.filter(old=>old.version_id!==r.version_id)],selected);
    $('result').replaceChildren(entry(r));$('receipt').hidden=false;status('导入成功，已接收 v'+r.version+'。');
  }catch(e){fail(e,gen,true)}finally{if(gen===generation){busy=false;controls()}}
};
function checkSession(){
  if(document.hidden)return;
  if(!owner){if(!busy)void load();return}
  const gen=generation;confirmOwner(gen).catch(e=>{if(gen!==generation)return;if(e.http===401)signedOut();else if(!busy)void load()});
}
window.addEventListener('focus',()=>{checkSession();void checkSearch()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearSearch();else checkSession()});
window.addEventListener('pagehide',()=>clearSearch());setInterval(checkSearch,2500);
window.addEventListener('pageshow',e=>{if(e.persisted)void load(true)});
void load();
})()</script></body></html>`
}
