export function buildRecallHtml(){return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>遮挡背诵 · KnowledgeOS</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f8faf9;color:#223638;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:#fff;border-bottom:1px solid #cedbd7}header nav,main{max-width:1040px;margin:auto;padding:0 20px}nav,.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}nav{min-height:54px}nav strong{font-size:18px;color:#18565a;margin-right:6px}main{padding-block:20px}h1,h2,h3,p{margin:0}h1{font-size:25px}h2{font-size:18px}h3{font-size:15px}a{color:#176166;text-underline-offset:3px}button,input,select{font:inherit;color:inherit;padding:5px 9px;border:1px solid #8a9d99;border-radius:5px;background:#fff}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button.primary{color:#fff;background:#226461}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #176d92;outline-offset:2px}#status,#practice-meta,#selection-meta{color:#516667;min-height:1.6em;margin:6px 0}section{margin-top:15px}#author-tools{position:sticky;top:0;z-index:1;background:#f8faf9;border-block:1px solid #cedbd7;padding:8px 0}#pages article{border-bottom:1px solid #cedbd7;padding:11px 0}#pages h3{color:#346465}pre,.practice-text{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;line-height:1.65}pre{user-select:text}input{max-width:100%}ul{padding:0;list-style:none;margin:8px 0}li{padding:6px 0;border-bottom:1px solid #dce6e3;overflow-wrap:anywhere}#groups li{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.masked{background:#dbe9e3;color:#244b48;font-weight:600;padding:0 4px;border-bottom:2px solid #92ada4}.warn{color:#8c521d}.muted{color:#536866}label{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}.progress{margin:8px 0}
@media(max-width:620px){header nav,main{padding-inline:12px}#author-tools{position:static}.bar{gap:6px}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/recall" aria-current="page">遮挡背诵</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>遮挡背诵</h1><p id="status" role="status">正在读取…</p>
<section id="collection" hidden><h2>我的练习</h2><ul id="materials"></ul><button id="more" hidden>更多练习</button></section>
<section id="author" hidden><h2 id="source-title"></h2><div id="author-tools"><div class="bar"><button id="range">设为练习范围</button><button id="mask" disabled>添加为遮挡组</button><button id="clear-masks" disabled>清除分组</button><span id="selection-meta" aria-live="polite"></span></div><div class="bar"><label>练习名称 <input id="title" maxlength="200"></label><button id="create" class="primary" disabled>保存并练习</button></div></div>
<button id="prev-page" hidden>加载上一页</button><div id="pages"></div><button id="next-page" hidden>加载下一页</button></section>
<section id="practice" hidden><h2 id="practice-title"></h2><div class="bar"><button id="prev" aria-label="上一练习页">←</button><span id="practice-meta"></span><button id="next" aria-label="下一练习页">→</button><a id="original" target="_blank" rel="noopener noreferrer">固定版本原文</a><a href="/knowledgeos/recall">我的练习</a></div>
<p id="version-warning" class="warn" hidden>来源已有变化；保留旧练习，未迁移选区。</p><div id="practice-text" class="practice-text"></div><ul id="groups"></ul>
<p id="progress" class="progress muted"></p><div class="bar"><label>自评 <select id="rating"><option value="">未评分</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><button id="rate">保存自评</button></div></section></main>
<script>
const $=id=>document.getElementById(id),api='/knowledge/v1/recall',q=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const source={asset_id:q.get('asset'),version_id:q.get('version'),...(q.has('conversion')?{conversion_id:q.get('conversion')}:{})}, starting=Math.max(1,Number(q.get('unit'))||1);
let owner=null,view=null,busy=false,locked=false,loaded=new Map(),total=0,range=null,masks=[],nextGroup=1,attempt=null,cursor=null,materialId=q.get('material'),pending=null;
const status=text=>$('status').textContent=text;
function fail(code){const e=new Error(code);e.code=code;throw e}
function conceal(){for(const section of ['collection','author','practice'])$(section).hidden=true}
function clear(){conceal();pending=null;attempt=null;range=null;masks=[];loaded.clear();for(const id of ['materials','pages','practice-text','groups','progress','practice-title','source-title'])$(id).replaceChildren();$('original').removeAttribute('href');$('title').value='';getSelection().removeAllRanges()}
async function raw(path,init){const r=await fetch(path,{cache:'no-store',redirect:'error',credentials:'same-origin',...init});const j=await r.json();if(!r.ok)fail(j.code);return j.data}
async function checkActor(){const a=await raw('/knowledge/v1/me');if(!uuid(a?.id)||owner&&a.id!==owner)fail('ACTOR_CHANGED');owner=a.id}
async function call(path,method='GET',body,key){
  const data=await raw(path,body?{method,headers:{'content-type':'application/json','x-knowledgeos-request':'1','idempotency-key':key},body:JSON.stringify({actor_id:owner,...body})}:{});
  await checkActor();if(data.actor_id!==owner)fail('ACTOR_CHANGED');return data;
}
const errors={AUTH_REQUIRED:'请重新登录后刷新。',ACTOR_CHANGED:'账号已切换，请刷新页面。',SOURCE_NOT_FOUND:'来源不可用。',RECALL_NOT_FOUND:'练习或来源不可用。',RECALL_SOURCE_NOT_READY:'此页暂未提供已解析文本。',RECALL_SOURCE_CHANGED:'来源与保存的页段不一致。',RECALL_CONVERSION_REQUIRED:'请在固定转换版本的阅读器打开。',REVISION_CONFLICT:'已有更新，已重新读取进度。',INVALID_RECALL_RANGE:'范围无效，请核对选区及遮挡重叠。',RECALL_NOT_INDEPENDENT:'已使用提示或揭示，不能记为独立回忆。'};
const restricted=new Set(['AUTH_REQUIRED','ACTOR_CHANGED','SOURCE_NOT_FOUND','RECALL_NOT_FOUND','RECALL_SOURCE_CHANGED','CSRF_REJECTED']);
async function action(fn,{background=false}={}){
  if(busy||locked)return;busy=true;try{await checkActor();await fn();if(!document.hidden&&view)$(view).hidden=false}catch(e){
    if(restricted.has(e.code)){clear();locked=true}
    else if(background)conceal();
    status(errors[e.code]||'操作失败，未确认的提交可以重试。');
  }finally{busy=false}
}
function item(text,click){const node=document.createElement('button');node.type='button';node.textContent=text;node.onclick=click;return node}
function list(reset){return call(api+(reset?'':'?after='+encodeURIComponent(cursor))).then(data=>{
  if(reset)$('materials').replaceChildren();for(const m of data.items){const li=document.createElement('li'),a=document.createElement('a');a.href='?material='+encodeURIComponent(m.id);a.textContent=m.title;li.append(a);$('materials').append(li)}
  cursor=data.next;$('more').hidden=!cursor;view='collection';status($('materials').children.length?'':'暂无练习。');
})}
async function addPage(n){
  if(n<1||total&&n>total||loaded.has(n))return;
  const payload=await call(api+'/source?'+new URLSearchParams({...source,ordinal:String(n)}));if(payload.ordinal!==n||total&&payload.total!==total)fail('RECALL_SOURCE_CHANGED');total=payload.total;
  const section=document.createElement('article'),h=document.createElement('h3'),text=document.createElement('pre');h.textContent='页段 '+n+' / '+total;text.dataset.ordinal=String(n);text.textContent=payload.text;
  if(!payload.text)text.setAttribute('aria-label','空白页');section.append(h,text);
  const next=[...$('pages').children].find(e=>Number(e.lastChild.dataset.ordinal)>n);$('pages').insertBefore(section,next||null);
  if(next)next.scrollIntoView({block:'start'});
  loaded.set(n,payload);$('source-title').textContent=payload.title;if(!$('title').value)$('title').value=payload.title;
  $('prev-page').hidden=Math.min(...loaded.keys())<=1;$('next-page').hidden=Math.max(...loaded.keys())>=total;view='author';status('');
}
function selected(){
  const s=getSelection();if(!s.rangeCount||s.isCollapsed)fail('INVALID_RECALL_RANGE');const r=s.getRangeAt(0);
  function edge(node,offset){const el=node.parentElement,ordinal=Number(el?.dataset.ordinal),part=loaded.get(ordinal);if(node.nodeType!==3||!part||!$('pages').contains(el))fail('INVALID_RECALL_RANGE');return {ordinal,offset,source_hash:part.source_hash}}
  return {first:edge(r.startContainer,r.startOffset),last:edge(r.endContainer,r.endOffset)};
}
function updateAuthor(){
  $('mask').disabled=!range;$('clear-masks').disabled=!masks.length;$('create').disabled=!masks.length;
  $('selection-meta').textContent=range?'页段 '+range.first.ordinal+'–'+range.last.ordinal+' · '+new Set(masks.map(x=>x.group)).size+' 组':'';
}
function useRange(){
  const {first,last}=selected(),interior_hashes=[];
  for(let n=first.ordinal+1;n<last.ordinal;n++){
    const part=loaded.get(n);if(!part)fail('RECALL_SOURCE_NOT_READY');interior_hashes.push(part.source_hash);
  }
  range={first,last,interior_hashes};masks=[];nextGroup=1;updateAuthor();status('练习范围已选定。');
}
function useMask(){
  const {first,last}=selected(),group=nextGroup,parts=[];
  for(let n=first.ordinal;n<=last.ordinal;n++){
    const part=loaded.get(n);if(!part||n<range.first.ordinal||n>range.last.ordinal)fail('INVALID_RECALL_RANGE');
    const start=n===first.ordinal?first.offset:0,end=n===last.ordinal?last.offset:part.text.length;
    if(start<(n===range.first.ordinal?range.first.offset:0)||end>(n===range.last.ordinal?range.last.offset:part.text.length))fail('INVALID_RECALL_RANGE');
    if(end>start)parts.push({ordinal:n,start,end,group});
  }
  if(!parts.length||parts.some(p=>masks.some(m=>m.ordinal===p.ordinal&&m.start<p.end&&p.start<m.end)))fail('INVALID_RECALL_RANGE');
  masks.push(...parts);nextGroup++;updateAuthor();status('已添加遮挡组 '+group+'。');
}
function keyFor(body){const digest=JSON.stringify(body);if(pending?.digest!==digest)pending={digest,key:crypto.randomUUID()};return pending.key}
async function save(){
  const title=$('title').value.trim();if(!title){$('title').focus();status('请输入练习名称。');return}
  const body={...source,title,...range,masks};const saved=await call(api,'POST',body,keyFor(body));
  clear();materialId=saved.material.id;history.replaceState(null,'','?material='+encodeURIComponent(materialId));draw(saved);status('练习已保存。');
}
function draw(data){
  attempt=data;view='practice';const {material:m,ordinal,first,last,length,progress:r}=data;
  $('practice-title').textContent=m.title;$('practice-meta').textContent='页段 '+ordinal+' / '+last+' · '+length+' 个 UTF-16 单元';
  $('original').href='/knowledgeos/reader?'+new URLSearchParams({asset:m.asset_id,version:m.version_id,unit:String(ordinal),...(m.conversion_id?{conversion:m.conversion_id}:{})});
  $('version-warning').hidden=!data.source_changed;$('prev').disabled=ordinal<=first;$('next').disabled=ordinal>=last;
  $('practice-text').replaceChildren();$('groups').replaceChildren();const groups=new Map();
  for(const part of data.runs){if(part.kind==='text')$('practice-text').append(document.createTextNode(part.text));else{
    const span=document.createElement('span');span.className='masked';span.textContent='［组 '+part.group+'］';$('practice-text').append(span);groups.set(part.group,(groups.get(part.group)||0)+part.length);
  }}
  for(const [g,len] of groups){const li=document.createElement('li'),hint=r.hints.find(x=>x.group===g);
    const label=document.createElement('span');label.textContent='组 '+g+(hint?' · 本页 '+len+' 个 UTF-16 单元':'');li.append(label,item('提示 '+g,()=>action(()=>act('hint',g))),item('揭示 '+g,()=>action(()=>act('reveal',g))));
    const recall=item('独立回忆 '+g,()=>action(()=>act('recall',g)));recall.disabled=!!hint||r.independent_recall.includes(g);li.append(recall);$('groups').append(li);
  }
  $('rating').value=r.self_rating??'';$('progress').textContent='提示 '+r.hints.reduce((n,h)=>n+h.count,0)+' · 已揭示 '+r.revealed.length+' 组 · 独立回忆 '+r.independent_recall.length+' 组 · 自评 '+(r.self_rating??'未评分');
}
async function act(event,value){
  if(!attempt||!value)return;const body={event,value,expected_revision:attempt.revision};
  try{draw(await call(api+'/'+materialId,'PATCH',body,keyFor(body)));pending=null;status('进度已保存。')}
  catch(e){if(e.code==='REVISION_CONFLICT'){pending=null;draw(await call(api+'/'+materialId))}throw e}
}
async function refresh(){
  if(view==='collection'){await list(true);return}
  if(view==='practice'){
    const next=await call(api+'/'+materialId);
    if(next.revision===attempt.revision&&next.source_changed===attempt.source_changed)return;
    const rating=$('rating').value,unsaved=rating!==String(attempt.progress.self_rating??''),focused=document.activeElement?.textContent;
    const hadGroupFocus=$('groups').contains(document.activeElement);draw(next);if(unsaved)$('rating').value=rating;
    if(hadGroupFocus)([...$('groups').querySelectorAll('button:not(:disabled)')].find(b=>b.textContent===focused)||$('original')).focus({preventScroll:true});
    return;
  }
  if(view==='author'&&loaded.size){const n=loaded.keys().next().value,p=await call(api+'/source?'+new URLSearchParams({...source,ordinal:String(n)}));if(p.source_hash!==loaded.get(n).source_hash)fail('RECALL_SOURCE_CHANGED')}
}
for(const id of ['range','mask'])$(id).onmousedown=e=>e.preventDefault();
$('range').onclick=()=>{try{useRange()}catch(e){status(errors[e.code])}};$('mask').onclick=()=>{try{useMask()}catch(e){status(errors[e.code])}};
$('clear-masks').onclick=()=>{masks=[];nextGroup=1;updateAuthor()};$('create').onclick=()=>action(save);
$('prev-page').onclick=()=>action(()=>addPage(Math.min(...loaded.keys())-1));$('next-page').onclick=()=>action(()=>addPage(Math.max(...loaded.keys())+1));
$('more').onclick=()=>action(()=>list(false));$('prev').onclick=()=>action(()=>act('move',attempt.ordinal-1));$('next').onclick=()=>action(()=>act('move',attempt.ordinal+1));$('rate').onclick=()=>action(()=>act('rating',Number($('rating').value)));
document.addEventListener('visibilitychange',()=>{conceal();if(!document.hidden)void action(refresh,{background:true})});
window.addEventListener('pagehide',conceal);window.addEventListener('pageshow',e=>{if(e.persisted)void action(refresh,{background:true})});
setInterval(()=>{if(!document.hidden)void action(refresh,{background:true})},10000);
void action(async()=>{if(uuid(materialId)){draw(await call(api+'/'+materialId));status('')}
  else if(uuid(source.asset_id)&&uuid(source.version_id)){await addPage(starting)}else await list(true);
});
</script></body></html>`}
