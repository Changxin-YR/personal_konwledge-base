/** Fixed-version reader. The host supplies only the authenticated business API. */
export function buildReaderHtml(): string {
  return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>版本阅读 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7faf9;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}header,main{padding:14px max(16px,calc((100% - 1050px)/2))}header,.tools,.modes,form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{background:white;border-bottom:1px solid #cbd9d6;gap:20px}header strong{color:#18565a}a{color:#176166}h1{font-size:24px;margin:8px 0}h2{font-size:17px}button,input{font:inherit;border:1px solid #8ba4a0;border-radius:4px;background:white;padding:4px 10px;color:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button[aria-pressed=true],button[aria-current=true]{background:#235e5b;color:white}input{width:6em}.layout{display:grid;grid-template-columns:9em minmax(0,1fr);gap:18px;margin-top:18px}#rail{height:230px;overflow:auto;border-block:1px solid #cbd9d6}#window{position:relative}#window button{position:absolute;left:0;width:100%;height:36px;text-align:left;border:0;border-radius:0}article{min-width:0}#version,#status,pre,#anchor{overflow-wrap:anywhere}#version{color:#536866}#original{position:relative;width:100%;max-width:var(--page-width);line-height:0}#original img{width:100%;height:auto}.highlight{position:absolute;background:#ffc02b66;box-shadow:inset 0 0 0 1px #ad7900;pointer-events:none}pre{font:inherit;line-height:1.8;white-space:pre-wrap;margin:0}mark{background:#ffe491}#status{border-left:3px solid #94b6ac;padding-left:8px}[hidden]{display:none!important}:focus-visible{outline:3px solid #176d92;outline-offset:1px}@media(max-width:620px){.layout{grid-template-columns:minmax(0,1fr)}#rail{height:82px}}
#continuity{margin-top:12px;border-block:1px solid #cbd9d6;padding:8px 0}#continuity details{margin:4px 0}#continuity summary{cursor:pointer;color:#18565a}#continuity ul{list-style:none;margin:6px 0;padding:0;max-height:20em;overflow:auto}#continuity li{display:flex;gap:6px;margin:4px 0}#continuity li button:first-child{overflow-wrap:anywhere;text-align:left}#bookmark-title{width:min(100%,20em)}#reading-status{margin:4px 0;min-height:1.6em;color:#536866}
#annotations{border-block:1px solid #cbd9d6;margin-block:14px;padding-block:8px;overflow-wrap:anywhere}#annotation-form{display:grid;gap:8px}#annotation-body{max-width:100%;width:100%;min-height:6em;font:inherit;padding:6px;border:1px solid #8ba4a0;border-radius:4px}#annotation-items{list-style:none;padding:0;margin:0}#annotation-items li{border-top:1px solid #cbd9d6;padding:8px 0}#annotation-items p{white-space:pre-wrap;margin:4px 0}.annotation-buttons{display:flex;flex-wrap:wrap;gap:8px}
</style></head><body><header><strong>KnowledgeOS</strong><a href="/knowledgeos/library">资料库</a><a href="/knowledgeos/account">账号与登录</a></header><main>
<h1 id="title">版本阅读</h1><p id="version"></p><div class="tools"><button id="refresh">刷新</button><form id="jump"><button type="button" id="prev" aria-label="上一位置">←</button><input type="number" min="1" step="1" required id="number" aria-label="跳转位置"><button>跳转</button><button type="button" id="next" aria-label="下一位置">→</button></form><span id="count"></span><a id="task-material-link" hidden>固定材料链接</a></div><p id="status" role="status"></p>
<section id="continuity" aria-label="阅读导航" hidden><details id="toc-details" open><summary>目录</summary><ul id="toc"></ul></details><details id="bookmarks-details" open><summary>我的书签</summary><ul id="bookmarks"></ul><form id="bookmark-form"><input id="bookmark-title" maxlength="120" required placeholder="书签名称" aria-label="书签名称"><button id="bookmark-add">添加书签</button></form></details><p id="reading-status" role="status"></p></section>
<div class="layout"><nav id="rail" aria-label="页与文本块" hidden><div id="window"></div></nav><article><h2 id="anchor"></h2><div class="modes" id="modes" hidden><button id="paper">原页</button><button id="structured">结构文本</button><button id="cite" disabled>生成引用链接</button><button id="annotate" disabled>选区批注</button><button id="annotations-toggle" aria-controls="annotations" aria-expanded="false">本处批注</button><a id="link" hidden>打开引用</a><a id="note-link" hidden>记笔记</a><a id="recall-link" hidden>制作遮挡练习</a></div><div id="original" hidden></div><pre id="text" hidden></pre><section id="annotations" aria-label="本处批注" hidden><p id="annotation-status" role="status"></p><ul id="annotation-items"></ul><form id="annotation-form" hidden><label for="annotation-body">批注正文</label><textarea id="annotation-body" maxlength="4000" required></textarea><label id="annotation-scope">可见范围 <select id="annotation-visibility"><option value="private">仅本人</option><option value="project">当前项目</option></select></label><div class="annotation-buttons"><button id="annotation-submit">保存批注</button><button type="button" id="annotation-rebase" hidden>读取最新版本并保留草稿</button><button type="button" id="annotation-cancel">取消</button></div></form></section></article></div></main><script>
'use strict';
const $=id=>document.getElementById(id), q=new URLSearchParams(location.search), asset=q.get('asset'), version=q.get('version'), cid=q.get('citation');
const requestedUnit=q.get('unit')??'1', requestedConversion=q.get('conversion');
const requestedMatch=q.get('match');
const uuid=s=>typeof s==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s), digest=s=>typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const integer=Number.isSafeInteger, ready=d=>d.state==='ready'||d.state==='review';
const status=s=>{$('status').textContent=s}, invalid=()=>new Error('invalid'), problem=http=>Object.assign(new Error(),{http});
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
let gen=0, owner=null, ordinal=1, total=0, conversion=null, page=null, selection=null, pending=null, posting=false, mode=null, resolved=null, versionLabel='', followCitation=!!cid, followMatch=requestedMatch!==null;
let pendingMatchSave=followMatch;
const readerPath='assets/'+asset+'/versions/'+version+'/reader';
let continuity=null, outlineLoaded=false, busy=false;
let annotationPanel=false, annotationDraft=null, annotationBusy=false, annotationSequence=0, suspendedDraft=null;
let expirationTimer=null;
const readingStatus=s=>{$('reading-status').textContent=s};
async function api(path,options){
  const r=await fetch('/knowledge/v1/'+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok){const e=problem(r.status);if(r.status===422||r.status===409)e.code=(await r.json().catch(()=>null))?.code;throw e}return (await r.json()).data;
}
async function access(g){
  if(g!==gen||document.hidden)return false;
  try{
    const sent=performance.now();
    const m=await api('assets/'+asset+'/versions/'+version+'/reader-access',{signal:AbortSignal.timeout(2000)});
    if(g!==gen||document.hidden)return false;
    if(!m||typeof m.actor_id!=='string'||!m.actor_id||m.asset_id!==asset||m.version_id!==version||!integer(m.version)||m.version<1||typeof m.is_latest!=='boolean')throw invalid();
    if(owner!==null && owner!==m.actor_id){lock('账号已切换，请刷新以重新检查资料权限。');return false}
    clearTimeout(expirationTimer);expirationTimer=null;
    if(m.read_expires_at!=null){
      const limit=sent+Date.parse(m.read_expires_at)-Date.parse(m.server_time);if(!Number.isFinite(limit))throw invalid();
      const check=()=>{if(g!==gen)return;const remaining=limit-performance.now();if(remaining<=0)lock('读取授权已到期，请重新核对权限。');else expirationTimer=setTimeout(check,Math.min(Math.ceil(remaining),2147483647))};
      check();if(g!==gen)return false;
    }
    owner=m.actor_id;versionLabel=(m.is_latest?'固定版本':'旧版本')+' v'+m.version;return true;
  }catch(e){failure(e,g);return false}
}
function clearPage(){
  page=null;selection=null;posting=false;getSelection().removeAllRanges();
  for(const id of ['text','original','anchor'])$(id).replaceChildren();
  for(const id of ['text','original','modes','link'])$(id).hidden=true;
  $('link').removeAttribute('href');$('note-link').hidden=true;$('note-link').removeAttribute('href');$('cite').disabled=true;
  $('recall-link').hidden=true;$('recall-link').removeAttribute('href');
  $('task-material-link').hidden=true;$('task-material-link').removeAttribute('href');
  clearAnnotations();
}
function lock(message,keepDraft=false){
  clearTimeout(expirationTimer);expirationTimer=null;
  if(!keepDraft)suspendedDraft=null;
  ++gen;owner=null;total=0;conversion=null;resolved=null;pending=null;ordinal=1;versionLabel='';mode=null;clearPage();
  followCitation=!!cid;
  followMatch=requestedMatch!==null;
  continuity=null;outlineLoaded=false;busy=false;$('continuity').hidden=true;$('toc').replaceChildren();$('bookmarks').replaceChildren();$('bookmark-title').value='';readingStatus('');
  $('title').textContent='版本阅读';$('version').textContent='';navigation();status(message);
}
function failure(e,g){
  if(g!==gen)return;
  if(e.http===401)lock('请先登录，然后刷新阅读页。');
  else if(e.http===403||e.http===404)lock('资料不可访问，请核对账号与当前权限。');
  else if(e.http===409)lock('引用或来源已变化，与固定版本不匹配。');
  else lock('读取失败，无法确认来源或账号。请刷新重试。');
}
// Only visible ordinal buttons (plus overscan) exist. Only the displayed unit holds source bytes.
function renderWindow(){
  const rail=$('rail'), list=$('window');list.style.height=(total*36)+'px';
  const start=Math.max(1,Math.floor(rail.scrollTop/36)-2), end=Math.min(total,start+Math.ceil(rail.clientHeight/36)+5), nodes=[];
  for(let n=start;n<=end;n++){
    const b=document.createElement('button');b.type='button';b.style.top=((n-1)*36)+'px';b.textContent='位置 '+n;b.setAttribute('aria-current',String(n===ordinal));b.onclick=()=>navigate(n);nodes.push(b);
  }
  list.replaceChildren(...nodes);
}
function navigation(){
  $('prev').disabled=!total||ordinal<=1;$('next').disabled=!total||ordinal>=total;
  $('number').value=total?ordinal:'';$('number').max=String(total);for(const el of $('jump').querySelectorAll('input,button:not([type=button])'))el.disabled=!total;
  $('count').textContent=total?'第 '+ordinal+' / '+total+' 处':'';$('rail').hidden=!total;
  const rail=$('rail');renderWindow();if(total && ((ordinal-1)*36<rail.scrollTop || ordinal*36>rail.scrollTop+rail.clientHeight)){rail.scrollTop=(ordinal-1)*36;renderWindow()}
}
function locator(c,id){
  if(!c || (id && c.id!==undefined && c.id!==id) || c.asset_id!==asset || c.version_id!==version || !integer(c.ordinal)||c.ordinal<1 || !integer(c.start)||c.start<0||!integer(c.end)||c.end<=c.start||!digest(c.source_hash)||!digest(c.quote_hash)||(c.conversion_id!=null&&!uuid(c.conversion_id)))throw invalid();
  return c;
}
function validRange(s,start,end){
  const split=i=>i>0 && i<s.length && /[\uD800-\uDBFF]/.test(s[i-1]) && /[\uDC00-\uDFFF]/.test(s[i]);
  return integer(start)&&integer(end)&&start>=0&&start<end&&end<=s.length&&!split(start)&&!split(end);
}
function validate(d,n,cv){
  if(!d||d.asset_id!==asset||d.version_id!==version||d.ordinal!==n||!integer(d.total)||d.total<0||(d.total?d.total<n:n!==1)||!['text','pdf','office'].includes(d.kind)||typeof d.state!=='string'||typeof d.text!=='string')throw invalid();
  if(cv && d.conversion_id!==cv || (d.conversion_id!=null && (d.kind!=='office'||!uuid(d.conversion_id))) || (d.kind==='office' && ready(d) && !uuid(d.conversion_id)))throw invalid();
  if(d.image!=null && (typeof d.image!=='string'||!/^data:image\/png;base64,[A-Za-z\d+/]+=*$/.test(d.image)||!(d.width>0&&Number.isFinite(d.width)&&d.height>0&&Number.isFinite(d.height))))throw invalid();
  return d;
}
const usable=p=>p&&integer(p.ordinal)&&p.ordinal>0&&digest(p.source_hash)&&(p.conversion_id==null||uuid(p.conversion_id));
const point=d=>({ordinal:d.ordinal,source_hash:d.position_hash,...(d.conversion_id?{conversion_id:d.conversion_id}:{})});
async function readState(g){
  const state=await api(readerPath+'-state');
  if(g!==gen)return;
  if(state?.actor_id!==owner||!integer(state.revision)||state.revision<0||(state.position!==null&&!usable(state.position))||!Array.isArray(state.bookmarks)||state.bookmarks.some(m=>!usable(m)||!uuid(m.id)||typeof m.title!=='string'))throw invalid();
  continuity=state;
}
function emptyRow(label){const li=document.createElement('li');li.textContent=label;return li}
function control(label,click){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=click;return b}
function renderBookmarks(){
  const nodes=(continuity?.bookmarks??[]).map(m=>{
    const li=document.createElement('li'),del=control('删除',()=>changeBookmark(m));del.setAttribute('aria-label','删除书签：'+m.title);
    li.append(control(m.title,()=>navigate(m.ordinal,m)),del);return li;
  });
  $('bookmarks').replaceChildren(...(nodes.length?nodes:[emptyRow('暂无书签')]));
  $('bookmark-add').disabled=!continuity||!page||!digest(page.position_hash)||busy;
}
async function showOutline(g){
  if(outlineLoaded)return;
  try{
    const o=await api(readerPath+'-outline');
    if(g!==gen||!await access(g))return;
    if(o?.actor_id!==owner||!Array.isArray(o.items)||o.items.some(x=>!integer(x.ordinal)||x.ordinal<1||typeof x.title!=='string'))throw invalid();
    const nodes=o.items.map(x=>{
      const row=document.createElement('li');row.style.paddingInlineStart=Math.min(8,x.depth??0)*10+'px';
      const jump=control(x.title,()=>navigate(x.ordinal));jump.disabled=x.ordinal>total;
      row.append(jump);return row;
    });
    if(o.items.some(x=>x.ordinal>total))nodes.unshift(emptyRow('部分目录位置尚未解析，暂不可跳转。'));
    $('toc').replaceChildren(...(nodes.length?nodes:[emptyRow('没有可用的原始目录')]));outlineLoaded=true;
  }catch(e){if(g===gen&&await access(g))$('toc').replaceChildren(emptyRow('目录暂不可用'))}
}
function writeOptions(method,b){return {method,headers:{'Content-Type':'application/json','X-KnowledgeOS-Request':'1','X-KnowledgeOS-Reader-Actor':owner},...(b?{body:JSON.stringify(b)}:{})}}
async function writeFailure(e,g,label){
  if(g!==gen)return;
  if(e.code==='READER_ACTOR_CHANGED'||e.http===401||e.http===403||e.http===404){if(!await access(g))return}
  if(g!==gen)return;
  readingStatus(e.code==='READING_REVISION_CONFLICT'?'未保存：另一标签页已更新位置，请刷新后重试。':label);
}
async function remember(g,d,searchMatch=false){
  if(!continuity||!digest(d.position_hash))return;
  const revision=continuity.revision,p=point(d);
  const saved=continuity.position;
  if(searchMatch&&saved?.ordinal===p.ordinal&&saved.source_hash===p.source_hash&&saved.conversion_id===p.conversion_id){pendingMatchSave=false;return}
  try{
    if(!await access(g))return;
    // A write already dispatched must not be replayed automatically after a tab switch.
    if(searchMatch)pendingMatchSave=false;
    const r=await api(readerPath+'-state',writeOptions('PUT',{...p,expected_revision:revision}));
    if(!await access(g))return;
    if(r?.revision!==revision+1||!usable(r.position)||r.position.ordinal!==p.ordinal||r.position.source_hash!==p.source_hash||r.position.conversion_id!==p.conversion_id)throw invalid();
    continuity.revision=r.revision;readingStatus('阅读位置已保存。');
  }catch(e){await writeFailure(e,g,'未确认保存阅读位置。')}
}
async function changeBookmark(m){
  if(busy||!continuity||(!m&&(!page||!digest(page.position_hash))))return;
  const g=gen,title=$('bookmark-title').value.trim();if(!m&&!title)return;
  busy=true;renderBookmarks();readingStatus('');
  try{
    if(!await access(g))return;
    const r=m?await api(readerPath+'-bookmarks/'+m.id,writeOptions('DELETE')):await api(readerPath+'-bookmarks',writeOptions('POST',{...point(page),title}));
    if(!await access(g))return;
    if(m){if(r?.id!==m.id)throw invalid();continuity.bookmarks=continuity.bookmarks.filter(x=>x.id!==m.id)}
    else{if(!usable(r)||!uuid(r.id)||r.title!==title)throw invalid();continuity.bookmarks.push(r);$('bookmark-title').value=''}
    readingStatus(m?'书签已删除。':'书签已添加。');
  }catch(e){await writeFailure(e,g,m?'未确认删除书签。':'未确认添加书签。')}
  finally{if(g===gen){busy=false;renderBookmarks()}}
}
async function load(n,{openCitation=false,openMatch=false,restore=false,save=false,bookmark=null}={}){
  if(document.hidden)return;
  const g=++gen;clearPage();resolved=null;followCitation=!!cid&&openCitation;followMatch=openMatch;ordinal=n;navigation();status('正在读取…');
  try{
    if(!uuid(asset)||!uuid(version)||(cid!==null&&!uuid(cid))||!/^\d{1,9}$/.test(requestedUnit)||Number(requestedUnit)<1||(requestedConversion!==null&&!uuid(requestedConversion)))throw invalid();
    const needle=openMatch&&requestedMatch?.match(/^(\d{1,9}):(\d{1,9}):([a-f0-9]{64})$/);
    if(openMatch&&(!needle||cid||!q.has('unit')||n!==Number(requestedUnit)))throw invalid();
    if(!await access(g))return;
    if(!continuity){try{await readState(g)}catch{if(!await access(g))return;readingStatus('个人阅读状态暂不可用。')}}
    const c=openCitation && cid?locator(await api('citations/'+cid+'/resolve'),cid):null;
    if(g!==gen)return;
    if(c && ((q.has('unit')&&Number(requestedUnit)!==c.ordinal)||(requestedConversion && requestedConversion!==c.conversion_id)))throw problem(409);
    const saved=restore?continuity?.position:null;
    let at=c?.ordinal??saved?.ordinal??n, cv=c?.conversion_id??bookmark?.conversion_id??conversion??requestedConversion;
    const get=async()=>validate(await api(readerPath+'?unit='+at+(cv?'&conversion='+cv:'')),at,cv);
    let d;
    try{d=await get()}catch(e){if(!saved||e.http!==422)throw e}
    if(saved&&(!d||d.position_hash!==saved.source_hash||d.conversion_id!==saved.conversion_id)){at=1;cv=null;d=await get()}
    if(bookmark&&d.position_hash!==bookmark.source_hash)throw problem(409);
    if(g!==gen)return;
    if(!digest(d.anchor)||await sha(d.text)!==d.anchor)throw problem(409);
    if(c && (c.conversion_id??null)!==(d.conversion_id??null))throw invalid();
    if(c && ready(d) && (!validRange(d.text,c.start,c.end)||await sha(d.text)!==c.source_hash||await sha(d.text.slice(c.start,c.end))!==c.quote_hash))throw problem(409);
    if(needle&&(!ready(d)||d.anchor!==needle[3]||!validRange(d.text,Number(needle[1]),Number(needle[2]))))throw problem(409);
    if(!await access(g))return;
    resolved=c;ordinal=at;total=d.total;conversion=d.conversion_id??null;page=d;navigation();
    $('version').textContent=versionLabel+' · '+version;$('title').textContent=d.title||'版本阅读';$('anchor').textContent=d.chapter||((d.kind==='text'?'文本块 ':'第 ')+at+(d.kind==='text'?'':' 页'));
    if(c && ready(d))selection={start:c.start,end:c.end};
    if(needle){selection={start:Number(needle[1]),end:Number(needle[2])};mode='text'}
    draw();if(c||needle)document.querySelector('#original .highlight,#text mark')?.scrollIntoView({block:'nearest'});
    $('continuity').hidden=false;renderBookmarks();
    if(save||needle&&pendingMatchSave){busy=true;await remember(g,d,Boolean(needle))}
    void showOutline(g);
  }catch(e){
    if(g!==gen)return;
    if(total && (e.http===503||e.http===502||e.http===500)){
      try{if(await access(g))status('本处加载失败，请刷新重试或选择其他位置。')}catch(err){failure(err,g)}
    }else failure(e,g);
  }finally{if(g===gen){busy=false;renderBookmarks()}}
}
function navigate(n,bookmark=null){if(busy||!integer(n)||n<1||(!bookmark&&n>total))return;readingStatus('');void load(n,{save:!bookmark,bookmark})}
// A partial glyph/run has no known pixel boundary. Never interpolate a rectangle.
function exactBoxes(d,s){
  if(resolved && s?.start===resolved.start && s?.end===resolved.end && resolved.locator?.geometry){
    const g=resolved.locator.geometry;
    if(g.page!==d.ordinal||g.width!==d.width||g.height!==d.height||!digest(g.source_sha256)||g.source_sha256!==d.original_sha256)return [];
    d={...d,boxes:g.boxes};
  }
  if(!s||!Array.isArray(d.boxes))return [];
  const boxes=d.boxes.filter(b=>b && b.end>s.start && b.start<s.end).sort((a,b)=>a.start-b.start);
  let at=s.start;
  for(const b of boxes){
    if(!validRange(d.text,b.start,b.end)||b.start<at||b.end>s.end||d.text.slice(at,b.start).trim()||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>d.width||b.y+b.height>d.height)return [];
    at=b.end;
  }
  return d.text.slice(at,s.end).trim()?[]:boxes;
}
function draw(){
  const d=page;if(!d)return;
  const showOriginal=!!d.image && mode!=='text', surface=$('original'), text=$('text');
  const available=ready(d), s=available?selection:null, boxes=exactBoxes(d,s);
  const material=$('task-material-link'),canPin=d.ordinal<=d.total&&(d.kind!=='office'||Boolean(d.conversion_id));
  material.hidden=!canPin;
  if(canPin)material.href='/knowledgeos/reader?'+new URLSearchParams({asset,version,unit:String(d.ordinal),...(d.conversion_id?{conversion:d.conversion_id}:{})});
  else material.removeAttribute('href');
  $('modes').hidden=!d.image&&!available;$('paper').disabled=!d.image;$('structured').disabled=!available;
  $('paper').setAttribute('aria-pressed',String(showOriginal));$('structured').setAttribute('aria-pressed',String(!showOriginal&&available));
  surface.hidden=!showOriginal;text.hidden=showOriginal||!available;surface.replaceChildren();text.replaceChildren();
  if(showOriginal){
    const img=document.createElement('img');img.alt='第 '+ordinal+' 页原页';img.onerror=()=>{if(page===d && surface.contains(img))status('原页图像加载失败，请刷新重试。')};img.src=d.image;
    surface.style.setProperty('--page-width',d.width+'px');surface.append(img);
    for(const b of boxes){const h=document.createElement('span');h.className='highlight';Object.assign(h.style,{left:100*b.x/d.width+'%',top:100*b.y/d.height+'%',width:100*b.width/d.width+'%',height:100*b.height/d.height+'%'});surface.append(h)}
  }else if(available){
    if(s){const mark=document.createElement('mark');mark.textContent=d.text.slice(s.start,s.end);text.append(d.text.slice(0,s.start),mark,d.text.slice(s.end))}else text.textContent=d.text;
  }
  $('cite').disabled=!available||!s||posting;
  if(available){$('recall-link').href='/knowledgeos/recall?'+new URLSearchParams({asset,version,unit:String(d.ordinal),...(d.conversion_id?{conversion:d.conversion_id}:{})});$('recall-link').hidden=false}
  $('annotate').disabled=!available||!s||posting||annotationBusy;$('annotations-toggle').disabled=!available;
  const states={failed:'本处解析失败。',empty:'此版本没有可阅读的文本块。',unconverted:'此版本尚无已完成的转换。',review:'本页解析结果待复核。'};
  const layout=d.kind==='pdf'&&available&&!showOriginal?' 提取文本不等同于原页版式。':'';
  status((states[d.state] || (!available?'本处尚未就绪。':showOriginal&&s&&!boxes.length?'原页缺少精确选区坐标，请查看结构文本中的高亮。':resolved?'已定位到固定版本引用。':'已打开固定版本。'))+layout);
}
function capture(){
  if(!page||!ready(page)||posting||$('text').hidden)return;
  const sel=getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  const r=sel.getRangeAt(0),text=$('text');if(!text.contains(r.startContainer)||!text.contains(r.endContainer)){selection=null;pending=null;$('cite').disabled=true;$('annotate').disabled=true;return}
  // Measure from the container, not indexOf(quote): repeated passages and split mark nodes are legal.
  const prefix=r.cloneRange();prefix.selectNodeContents(text);prefix.setEnd(r.startContainer,r.startOffset);
  const start=prefix.toString().length,end=start+r.toString().length;
  if(selection?.start!==start||selection?.end!==end){for(const id of ['link','note-link']){$(id).hidden=true;$(id).removeAttribute('href')}}
  selection=validRange(page.text,start,end)?{start,end}:null;$('cite').disabled=!selection;$('annotate').disabled=!selection||annotationBusy;
}
async function createCitation(range=selection,announce=true){
  if(!page||!range||posting)return;
  const g=gen, d=page, {start,end}=range;posting=true;$('cite').disabled=true;
  try{
    const source_hash=await sha(d.text),quote=await sha(d.text.slice(start,end));if(g!==gen)return;
    const body={asset_id:asset,version_id:version,ordinal:d.ordinal,start,end,source_hash,...(d.conversion_id?{conversion_id:d.conversion_id}:{})};
    const signature=JSON.stringify([owner,body]);
    const key=pending?.signature===signature?pending.key:crypto.randomUUID();pending={signature,key};
    if(!await access(g))return;
    const receipt=await api('citations',{method:'POST',headers:{'Content-Type':'application/json','X-KnowledgeOS-Request':'1','Idempotency-Key':key},body:JSON.stringify(body)});
    if(!await access(g))return;
    const c=locator(receipt);if(!uuid(c.id)||c.ordinal!==body.ordinal||c.start!==start||c.end!==end||c.source_hash!==source_hash||c.quote_hash!==quote||(c.conversion_id??null)!==(body.conversion_id??null))throw invalid();
    if(announce){const u=new URL('/knowledgeos/reader',location.origin);u.search=new URLSearchParams({asset,version,citation:c.id});
      $('link').href=u.href;$('link').hidden=false;
      $('note-link').href='/knowledgeos/notes?'+new URLSearchParams({citation:c.id});$('note-link').hidden=false;draw();status('引用链接已生成。')}
    return c;
  }catch(e){
    if(g!==gen)return;if([401,403,404,409].includes(e.http)){failure(e,g);return}
    if(e.code==='WORD_STRUCTURE_UNVERIFIED'){status('选区无法可靠定位到 Word 源段落，未生成引用。');return}
    // A lost response is not proof of a failed write. Preserve the request key for this exact range.
    status('未收到有效回执，可以重试本次引用。');
  }finally{if(g===gen){posting=false;$('cite').disabled=!selection}}
}
const annotationMessage=s=>{$('annotation-status').textContent=s};
function resetAnnotationDraft(){annotationDraft=null;$('annotation-form').hidden=true;$('annotation-body').value='';$('annotation-visibility').value='private';$('annotation-rebase').hidden=true;$('annotation-submit').disabled=false}
function clearAnnotations(){
  annotationSequence++;annotationBusy=false;annotationPanel=false;resetAnnotationDraft();$('annotations').hidden=true;$('annotations-toggle').setAttribute('aria-expanded','false');$('annotation-items').replaceChildren();annotationMessage('');
}
const annotationUrl=(d,id)=>readerPath+'-annotations'+(id?'/'+id:'')+'?unit='+d.ordinal+(d.conversion_id?'&conversion='+d.conversion_id:'');
async function refreshAnnotations(g){
  const d=page,seq=++annotationSequence;if(!annotationPanel||!d)return;
  try{
    const data=await api(annotationUrl(d),{signal:AbortSignal.timeout(3000)});
    if(g!==gen||seq!==annotationSequence||!await access(g)||seq!==annotationSequence)return;
    if(data?.actor_id!==owner||typeof data.can_comment!=='boolean'||typeof data.can_share!=='boolean'||!Array.isArray(data.items))throw invalid();
    if(annotationDraft&&(!data.can_comment||(annotationDraft.id&&!data.items.some(x=>x.id===annotationDraft.id&&x.can_edit))))resetAnnotationDraft();
    $('annotation-visibility').options[1].disabled=!data.can_share;if(!data.can_share)$('annotation-visibility').value='private';
    const items=data.items.filter(x=>uuid(x.id)&&uuid(x.citation_id)&&x.ordinal===d.ordinal&&(x.conversion_id??null)===(d.conversion_id??null)&&x.source_hash===d.anchor&&validRange(d.text,x.start,x.end)&&typeof x.body==='string'&&integer(x.revision)&&['private','project'].includes(x.visibility));
    $('annotation-items').replaceChildren(...(items.length?items.map(renderAnnotation):[emptyRow('本处暂无批注')]));
    return {...data,items};
  }catch(e){
    if(g!==gen||seq!==annotationSequence)return;
    if(e.http===401||e.http===403||e.http===404){if(!await access(g))return}
    if(g===gen&&seq===annotationSequence){clearAnnotations();$('annotations').hidden=false;annotationMessage('无法读取本处批注。')}
  }
}
function renderAnnotation(m){
  const row=document.createElement('li'),body=document.createElement('p'),bar=document.createElement('div');bar.className='annotation-buttons';
  body.textContent=m.body;row.dataset.annotationId=m.id;
  bar.append(m.visibility==='private'?'仅本人':'当前项目',control('定位',()=>{
    if(!page||!validRange(page.text,m.start,m.end))return;
    const g=gen;void (async()=>{if(await access(g)){selection={start:m.start,end:m.end};resolved=null;draw();document.querySelector('#original .highlight,#text mark')?.scrollIntoView({block:'nearest'})}})();
  }));
  if(m.can_edit)bar.append(control('编辑',()=>{
    if(annotationBusy)return;resetAnnotationDraft();annotationDraft={id:m.id,revision:m.revision};$('annotation-scope').hidden=true;$('annotation-form').hidden=false;$('annotation-body').value=m.body;$('annotation-body').focus();annotationMessage('');
  }),control('删除',()=>{if(!annotationBusy&&confirm('删除这条批注？'))void writeAnnotation('DELETE',m)}));
  row.append(body,bar);return row;
}
async function openAnnotations(range){
  if(!page||annotationBusy)return;
  const g=gen;annotationPanel=true;$('annotations').hidden=false;$('annotations-toggle').setAttribute('aria-expanded','true');
  const data=await refreshAnnotations(g);if(!range||!data||g!==gen)return;
  if(!data.can_comment){annotationMessage('当前权限不可添加批注。');return}
  resetAnnotationDraft();annotationDraft={range};$('annotation-scope').hidden=false;$('annotation-form').hidden=false;$('annotation-body').focus();annotationMessage('');
}
async function writeAnnotation(method,draft){
  if(annotationBusy||!page||!draft)return;
  const g=gen,d=page,body=$('annotation-body').value;
  if(method!=='DELETE'&&!body.trim())return;
  annotationBusy=true;$('annotation-submit').disabled=true;annotationMessage('');
  try{
    if(!await access(g))return;
    let request;
    if(method==='POST'){
      const c=await createCitation(draft.range,false);if(!c||g!==gen){if(g===gen)annotationMessage('未确认批注选区，草稿未保存。');return}
      request={body,citation_id:c.id,visibility:$('annotation-visibility').value};
    }else request={expected_revision:draft.revision,...(method==='PATCH'?{body}:{})};
    const r=await api(annotationUrl(d,draft.id),writeOptions(method,request));
    if(!await access(g))return;
    if(!uuid(r?.id)||(draft.id&&r.id!==draft.id)||method!=='DELETE'&&r.body!==body)throw invalid();
    resetAnnotationDraft();await refreshAnnotations(g);if(g===gen&&annotationPanel)annotationMessage(method==='DELETE'?'批注已删除。':'批注已保存。');
  }catch(e){
    if(g!==gen)return;
    if(e.http===401||e.http===403||e.http===404||e.code==='READER_ACTOR_CHANGED'){if(!await access(g))return;await refreshAnnotations(g)}
    if(g!==gen)return;
    if(e.code==='ANNOTATION_REVISION_CONFLICT'){
      if(method==='PATCH'&&annotationDraft===draft){draft.conflict=true;$('annotation-rebase').hidden=false}
      else await refreshAnnotations(g);
      if(g===gen)annotationMessage(method==='PATCH'?'批注已被其他标签页修改，草稿已保留。':'批注已变化，请核对后重试。');
    }else annotationMessage('未确认批注保存或删除。');
  }finally{if(g===gen){annotationBusy=false;$('annotation-submit').disabled=Boolean(annotationDraft?.conflict)}}
}
let modeSequence=0,polling=false,resumeAt=null;
async function switchMode(target){
  const g=gen,seq=++modeSequence;
  if(page&&await access(g)&&seq===modeSequence){mode=target;draw()}
}
async function recheck(){
  if(!owner||document.hidden||polling)return;
  const g=gen;polling=true;
  try{if(await access(g)&&page)$('version').textContent=versionLabel+' · '+version}finally{polling=false}
}
$('paper').onclick=()=>switchMode('paper');$('structured').onclick=()=>switchMode('text');
$('cite').onpointerdown=e=>e.preventDefault();$('cite').onclick=()=>createCitation();document.addEventListener('selectionchange',capture);
$('annotate').onpointerdown=e=>e.preventDefault();$('annotate').onclick=()=>{if(selection)void openAnnotations({...selection})};
$('annotations-toggle').onclick=()=>{if(annotationPanel){if(!annotationBusy)clearAnnotations()}else void openAnnotations(null)};
$('annotation-form').onsubmit=e=>{e.preventDefault();if(annotationDraft&&!annotationDraft.conflict)void writeAnnotation(annotationDraft.id?'PATCH':'POST',annotationDraft)};
$('annotation-cancel').onclick=()=>{if(!annotationBusy)resetAnnotationDraft()};
$('annotation-rebase').onclick=async()=>{
  const g=gen,draft=annotationDraft;if(!draft?.id||annotationBusy)return;
  const data=await refreshAnnotations(g),m=data?.items.find(x=>x.id===draft.id&&x.can_edit);
  if(g===gen&&draft===annotationDraft&&m){draft.revision=m.revision;draft.conflict=false;$('annotation-submit').disabled=false;$('annotation-rebase').hidden=true;annotationMessage('已读取当前批注，草稿未提交。')}
};
$('bookmark-form').onsubmit=e=>{e.preventDefault();void changeBookmark(null)};
$('jump').onsubmit=e=>{e.preventDefault();navigate(Number($('number').value))};$('prev').onclick=()=>navigate(ordinal-1);$('next').onclick=()=>navigate(ordinal+1);
$('rail').onscroll=renderWindow;new ResizeObserver(renderWindow).observe($('rail'));
function refresh(){if(busy)return;continuity=null;outlineLoaded=false;readingStatus('');void load(total?ordinal:Number(requestedUnit),{openCitation:followCitation,openMatch:followMatch,restore:!total&&!cid&&!q.has('unit')&&!requestedConversion})}
$('refresh').onclick=refresh;
// Clear the DOM on hide. Only a same-document tab switch can retain an in-memory draft.
function suspend(keepDraft=false){
  // An in-flight PATCH can be rechecked by ID/revision. Never replay a hidden POST.
  if(keepDraft&&annotationDraft&&(!annotationBusy||annotationDraft.id)&&owner&&page){
    suspendedDraft={actor:owner,ordinal:page.ordinal,conversion,anchor:page.anchor,draft:annotationDraft,
      body:$('annotation-body').value,visibility:$('annotation-visibility').value,checkingSave:annotationBusy};
  }
  resumeAt??={n:total||suspendedDraft?ordinal:Number(requestedUnit),cv:conversion,cite:followCitation,match:followMatch};
  lock('返回后将重新检查阅读权限。',keepDraft);
}
async function resume(){
  if(document.hidden||!resumeAt)return;
  const prior=resumeAt,saved=suspendedDraft,g=gen+1;resumeAt=null;conversion=prior.cv;
  await load(prior.n,{openCitation:prior.cite,openMatch:prior.match});
  if(g!==gen||!saved||suspendedDraft!==saved)return;
  const discard=()=>{if(suspendedDraft===saved)suspendedDraft=null};
  if(!page||owner!==saved.actor||page.ordinal!==saved.ordinal||conversion!==saved.conversion||page.anchor!==saved.anchor||annotationPanel){discard();return}
  annotationPanel=true;$('annotations').hidden=false;$('annotations-toggle').setAttribute('aria-expanded','true');
  const data=await refreshAnnotations(g);
  if(g!==gen||suspendedDraft!==saved)return;
  discard();
  if(!data?.can_comment||annotationDraft||!annotationPanel)return;
  const draft=saved.draft;
  if(draft.id){
    const current=data.items.find(x=>x.id===draft.id&&x.can_edit);if(!current)return;
    if(saved.checkingSave&&current.revision!==draft.revision){
      if(current.body===saved.body){annotationMessage('当前批注已包含提交内容。');return}
      draft.conflict=true;
    }
  }else if(!validRange(page.text,draft.range.start,draft.range.end)||saved.visibility==='project'&&!data.can_share)return;
  annotationDraft=draft;$('annotation-body').value=saved.body;$('annotation-visibility').value=saved.visibility;
  $('annotation-scope').hidden=Boolean(draft.id);$('annotation-form').hidden=false;
  $('annotation-rebase').hidden=!draft.conflict;$('annotation-submit').disabled=Boolean(draft.conflict);
  annotationMessage(draft.conflict?'批注已被其他标签页修改，草稿已保留。':'已恢复本标签页的未提交草稿。');
}
window.addEventListener('pagehide',()=>suspend());
window.addEventListener('pageshow',e=>{if(e.persisted)resume()});
window.addEventListener('focus',recheck);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend(true);else if(resumeAt)resume();else refresh()});
setInterval(recheck,2000);
void load(Number(requestedUnit),{openCitation:true,openMatch:followMatch,restore:!cid&&!q.has('unit')&&!requestedConversion});
</script></body></html>`
}
