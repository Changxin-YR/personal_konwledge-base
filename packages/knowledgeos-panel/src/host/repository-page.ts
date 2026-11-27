import { explainHtml, explainScript } from './repository-explanation-page.ts'
import { moduleExplainHtml, moduleExplainScript } from './repository-module-explanation-page.ts'

export function buildRepositoryHtml(nonce: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>仓库与代码 · KnowledgeOS</title>
<style nonce="${nonce}">
:root{font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif;color:#233835;background:#f5f8f7}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0}header{background:#fff;border-bottom:1px solid #d5e0dc}nav,main{max-width:1260px;margin:auto;padding:16px 24px}nav{display:flex;flex-wrap:wrap;align-items:center;gap:18px}nav strong{color:#184d44}a{color:#135f51;text-underline-offset:3px}h1{font-size:25px;margin:6px 0 10px}h2{font-size:17px;margin:0 0 8px}h3{font-size:15px;margin:0 0 8px}p{margin:0 0 8px}.badge{font-size:13px;color:#3b635a}#status{min-height:24px;color:#3b514c}.workspace{display:grid;grid-template-columns:minmax(215px,280px) minmax(0,1fr);gap:24px}.side,.content{min-width:0}.side{padding-right:18px;border-right:1px solid #d5e0dc}.section{margin:0 0 18px;padding:12px 0;border-bottom:1px solid #d5e0dc}.fields{border:0;padding:0;margin:0 0 8px;display:grid;grid-template-columns:minmax(0,2fr) minmax(90px,1fr) minmax(0,2fr);gap:10px;min-width:0}label{display:grid;gap:4px}input,select,button{font:inherit;color:inherit;border:1px solid #aabbaf;border-radius:5px;background:#fff;padding:6px 9px;max-width:100%}button{cursor:pointer;text-align:left}button:disabled{cursor:default;color:#63756f}button[type=submit]{background:#215f52;color:white;border-color:#215f52}button[aria-current=true]{background:#ddece7;border-color:#5c867a}summary{cursor:pointer;color:#3b635a}summary+div{display:grid;gap:6px;grid-template-columns:1fr 1fr;margin:8px 0}ul{list-style:none;padding:0;margin:5px 0}li{margin-bottom:4px;overflow-wrap:anywhere}li button{width:100%;white-space:normal}code,pre{font:13px/1.55 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#fff;border:1px solid #d5e0dc;border-radius:5px;padding:12px;max-height:520px;overflow:auto;margin:8px 0}.tree{max-height:420px;overflow:auto}.tree li{display:grid;grid-template-columns:minmax(0,1fr) minmax(75px,auto);gap:8px;align-items:center}.tree span:last-child{font-size:12px;color:#3b635a;white-space:nowrap}.snapshot-row small{display:block;overflow-wrap:anywhere}#commit{display:block;margin-bottom:6px}.file-facts{display:flex;flex-wrap:wrap;gap:8px 16px}
#explain-panel{border-top:1px solid #d5e0dc;margin-top:16px;padding-top:16px}#explain-form{display:grid;gap:8px;justify-items:start}#explain-form>label{width:100%}.code-range{display:flex;gap:12px}.code-range input{width:7em}textarea{font:inherit;resize:vertical;border:1px solid #aabbaf;border-radius:5px;padding:7px}#explain-answer,#citation-box,#module-answer{overflow-wrap:anywhere}#explain-answer h3,#module-answer h3{margin-top:14px}#explain-facts,#module-facts{padding-left:24px}#explain-facts button,#module-facts button{width:auto}#explain-status,#module-status{margin-top:8px}#citation-box{border-left:3px solid #5c867a;padding-left:12px}#module-panel{border-top:1px solid #d5e0dc;margin-top:16px;padding-top:16px}#module-form{display:grid;gap:8px;justify-items:start}#module-form>label{width:100%}#module-sources{display:grid;gap:6px;padding:0}#module-sources li{display:flex;flex-wrap:wrap;align-items:center;gap:8px}#module-sources code{min-width:220px}.module-range{display:flex;gap:8px;flex-wrap:wrap}.module-range label{display:flex;align-items:center;gap:4px}.module-range input{width:6em}#module-flows section{border-left:3px solid #d5e0dc;padding-left:10px;margin:10px 0}
@media(max-width:700px){nav,main{padding:12px 16px}.workspace,.fields{grid-template-columns:minmax(0,1fr)}.side{border:0;padding:0}.tree{max-height:280px}}
</style></head><body>
<header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/repositories" aria-current="page">仓库与代码</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>仓库与代码</h1><p class="badge">GitHub、GitLab、Gitee · 只读</p><p id="status" role="status">正在读取…</p><a id="login" href="/knowledgeos/account" hidden>登录</a>
<div class="workspace" id="workspace" hidden>
<aside class="side"><h2>固定快照</h2><ul id="snapshots"></ul></aside>
<div class="content"><section class="section"><h2>连接仓库</h2><form id="connect">
<label>托管平台<select id="platform"><option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="gitee">Gitee</option></select></label>
<fieldset class="fields" id="connect-fields"><label>仓库<input id="repository" placeholder="owner/repository" maxlength="255" required></label>
<label>引用类型<select id="ref-kind"><option value="branch">分支</option><option value="tag">标签</option><option value="commit">完整 SHA</option></select></label>
<label>引用<input id="ref" placeholder="main" maxlength="200" required></label></fieldset>
<details><summary>可选设置</summary><div><label>原生凭据别名<input id="credential" maxlength="55" placeholder="github_example" autocomplete="off"></label><label>同时保存文件<input id="initial-path" maxlength="1024" placeholder="README.md"></label></div></details>
<button id="save" type="submit">保存固定快照</button></form></section>
<section class="section" id="detail" hidden><h2 id="title"></h2><code id="commit"></code><p><a id="tree-link" target="_blank" rel="noopener noreferrer">查看固定提交</a></p><p class="badge" id="ref-facts"></p>
<label>筛选路径<input id="filter" type="search" maxlength="160"></label><ul class="tree" id="tree" aria-label="仓库文件"></ul></section>
<section class="section" id="file" hidden><h3 id="file-path"></h3><p class="file-facts"><code id="blob"></code><a id="blob-link" target="_blank" rel="noopener noreferrer">查看固定文件</a></p><pre id="file-text"></pre><button id="module-toggle" type="button" aria-pressed="false">加入模块讲解</button>${explainHtml}${moduleExplainHtml}</section>
</div></div></main>
<script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id), api='/knowledge/v1/repositories', status=text=>$('status').textContent=text;
const errors={ACTOR_MISMATCH:'账号已变更，请重新打开页面。',NOT_FOUND:'未找到快照或文件。',REMOTE_REPOSITORY_NOT_FOUND:'仓库或引用不存在，或入口无权访问。',REPOSITORY_REDIRECT_REJECTED:'仓库平台返回了重定向，未读取。',REPOSITORY_RATE_LIMIT:'已达到仓库平台请求上限。',REPOSITORY_LIMIT_EXCEEDED:'仓库树或文件超过读取上限。',REPOSITORY_CREDENTIAL_UNCONFIGURED:'指定的原生凭据未配置。',INVALID_REPOSITORY_INPUT:'检查仓库、引用、文件路径和凭据别名。',REPOSITORY_TIMEOUT:'仓库平台读取超时。',REPOSITORY_CHANGED:'远端仓库身份发生变化，未保存。',REPOSITORY_INVALID_RESPONSE:'仓库平台返回的对象无法验证。',REPOSITORY_BUSY:'已有仓库请求正在执行。',REPOSITORY_FILE_QUOTA:'已达到本地文件快照上限。',REPOSITORY_SNAPSHOT_QUOTA:'已达到本地仓库快照上限。'};
const kinds={directory:'目录',symlink:'符号链接',submodule:'子模块',file:'文件'};
const platforms={github:'GitHub',gitlab:'GitLab',gitee:'Gitee'};
function platformHints(){const selected=$('platform').value;$('repository').placeholder=selected==='gitlab'?'group/subgroup/project':'owner/repository';$('credential').placeholder=selected+'_example';}
let actor, rows=[], selected, entries=[], files=[], busy=false, gated=false, generation=0, focusEpoch=0, controller=new AbortController();
function clear(){closeCode();resetModule();generation++;focusEpoch++;controller.abort();controller=new AbortController();actor=selected=undefined;rows=[];entries=[];files=[];busy=gated=false;$('connect').reset();platformHints();$('save').disabled=false;$('filter').value='';$('workspace').hidden=$('detail').hidden=$('file').hidden=true;
 for(const id of ['snapshots','title','commit','ref-facts','tree','file-path','blob','file-text'])$(id).textContent='';for(const id of ['tree-link','blob-link'])$(id).removeAttribute('href');}
function noAccess(){clear();$('login').hidden=false;status('登录后读取仓库快照。');}
async function request(url,method='GET',payload){const current=generation, response=await fetch(url,{method,redirect:'error',cache:'no-store',signal:controller.signal,headers:method==='GET'?{}:{'content-type':'application/json','x-knowledgeos-request':'1'},body:payload===undefined?undefined:JSON.stringify(payload)});
 const result=await response.json();if(current!==generation)throw Error('STALE');if(response.status===401||response.status===403&&result.code!=='PROVIDER_PERMISSION_DENIED'||result.code==='ACTOR_MISMATCH'){noAccess();throw Error('STALE');}if(!response.ok)throw Error(result.code);
 if(actor&&actor!==result.data.actor_id){noAccess();throw Error('STALE');}return result.data;}
function button(parent,text,index,callback){const b=document.createElement('button');b.type='button';b.textContent=text;if(index)b.setAttribute('aria-current','true');b.addEventListener('click',callback);parent.append(b);return b;}
function snapshots(){const ul=$('snapshots');ul.replaceChildren();if(!rows.length){const li=document.createElement('li');li.textContent='没有快照';ul.append(li);return;}
 for(const s of rows){const li=document.createElement('li');li.className='snapshot-row';const b=button(li,s.repository,s.id===selected,()=>operation(()=>open(s.id)));const small=document.createElement('small');small.textContent=platforms[s.platform]+' · '+s.commit.slice(0,12)+' · '+s.ref_value;b.append(small);ul.append(li);}}
function tree(){const raw=$('filter').value.toLowerCase(), ul=$('tree');ul.replaceChildren();for(const e of entries){if(raw&&!e.path.toLowerCase().includes(raw))continue;
 const li=document.createElement('li');if(e.kind==='file'&&(e.size===null||e.size<=524288))button(li,e.path,false,()=>operation(()=>show(e.path)));else{const label=document.createElement('span');label.textContent=e.path;li.append(label);}
 const tag=document.createElement('span');tag.textContent=files.includes(e.path)?'已保存':(e.kind==='file'&&e.size>524288?'超出上限':kinds[e.kind]);li.append(tag);ul.append(li);}}
async function list(){const data=await request(api);actor=data.actor_id;rows=data.snapshots;$('workspace').hidden=gated;$('login').hidden=true;snapshots();}
async function open(id){closeCode();resetModule();const data=await request(api+'/'+id); selected=id;entries=data.entries;files=data.files;const s=data.snapshot;
 $('detail').hidden=false;$('file').hidden=true;$('file-text').textContent='';$('blob-link').removeAttribute('href');$('title').textContent=s.repository;$('commit').textContent=s.commit;$('tree-link').href=s.source_url;
 $('ref-facts').textContent=platforms[s.platform]+' · '+s.ref_kind+' · '+s.ref_value+(s.credential_ref?' · '+s.credential_ref:' · 匿名读取');$('filter').value='';snapshots();tree();status('已读取固定快照。');}
async function show(path){closeCode();const base=api+'/'+selected+'/files';const data=files.includes(path)?await request(base+'?path='+encodeURIComponent(path)):await request(base,'POST',{actor_id:actor,path});
 if(!files.includes(path)){files.push(path);const line=[...$('tree').children].find(li=>li.firstElementChild.textContent===path);if(line)line.lastElementChild.textContent='已保存';}
 const f=data.file;$('file-path').textContent=f.path;$('blob').textContent=f.sha+' · '+f.size+' 字节';$('blob-link').href=f.source_url;
 $('file-text').textContent=f.text===null?'二进制文件，不预览。':f.text;$('file').hidden=false;selectCode(f);moduleCurrentFileButton(f);status('已读取固定文件。');}
async function operation(work){if(busy)return;busy=true;const current=generation;$('save').disabled=true;
 try{await work();}catch(e){if(current===generation&&e.message!=='STALE')status(codeErrors[e.message]||errors[e.message]||'当前无法读取仓库。');}
 finally{if(current===generation){busy=false;$('save').disabled=false;}}}
${explainScript}
${moduleExplainScript}
$('platform').addEventListener('change',platformHints);$('filter').addEventListener('input',tree);$('connect').addEventListener('submit',event=>{event.preventDefault();void operation(async()=>{status('正在校验并保存快照…');
 const body={actor_id:actor,platform:$('platform').value,repository:$('repository').value.trim(),ref_kind:$('ref-kind').value,ref_value:$('ref').value.trim()};
 if($('credential').value)body.credential_ref=$('credential').value;if($('initial-path').value)body.path=$('initial-path').value;
 const data=await request(api,'POST',body);await list();await open(data.snapshot.id);if(body.path)await show(body.path);
});});
addEventListener('pagehide',clear);addEventListener('pageshow',()=>void operation(async()=>{await list();status('');await restoreCitation();}));
$('module-toggle').addEventListener('click',()=>toggleModuleFile(openCode && {path:openCode.path,text:$('file-text').textContent,commit:openCode.commit,sha:openCode.blob_sha}));
document.addEventListener('visibilitychange',async()=>{
 const epoch=++focusEpoch;
 if(document.visibilityState==='hidden'){if(actor){gated=true;$('workspace').hidden=true;}return;}
 if(!actor||!gated)return;
 try{
   await request(api);
   if(epoch!==focusEpoch)return;
   const active=openCode;
   if(active)await request(api+'/'+active.snapshot+'/files?path='+encodeURIComponent(active.path));
   else if(selected)await request(api+'/'+selected);
   if(epoch===focusEpoch){gated=false;$('workspace').hidden=false;}
 }
 catch(e){if(epoch===focusEpoch){clear();$('login').hidden=false;status('无法确认当前账号，已隐藏仓库内容。');}}
});
</script></body></html>`
}
