/** Fixed-version reader. The host supplies only the authenticated business API. */
export function buildReaderHtml(): string {
  return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>版本阅读 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7faf9;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}header,main{padding:14px max(16px,calc((100% - 1050px)/2))}header,.tools,.modes,form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{background:white;border-bottom:1px solid #cbd9d6;gap:20px}header strong{color:#18565a}a{color:#176166}h1{font-size:24px;margin:8px 0}h2{font-size:17px}button,input{font:inherit;border:1px solid #8ba4a0;border-radius:4px;background:white;padding:4px 10px;color:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}button[aria-pressed=true],button[aria-current=true]{background:#235e5b;color:white}input{width:6em}.layout{display:grid;grid-template-columns:9em minmax(0,1fr);gap:18px;margin-top:18px}#rail{height:230px;overflow:auto;border-block:1px solid #cbd9d6}#window{position:relative}#window button{position:absolute;left:0;width:100%;height:36px;text-align:left;border:0;border-radius:0}article{min-width:0}#version,#status,pre,#anchor{overflow-wrap:anywhere}#version{color:#536866}#original{position:relative;width:100%;max-width:var(--page-width);line-height:0}#original img{width:100%;height:auto}.highlight{position:absolute;background:#ffc02b66;box-shadow:inset 0 0 0 1px #ad7900;pointer-events:none}pre{font:inherit;line-height:1.8;white-space:pre-wrap;margin:0}mark{background:#ffe491}#status{border-left:3px solid #94b6ac;padding-left:8px}[hidden]{display:none!important}:focus-visible{outline:3px solid #176d92;outline-offset:1px}@media(max-width:620px){.layout{grid-template-columns:minmax(0,1fr)}#rail{height:82px}}
</style></head><body><header><strong>KnowledgeOS</strong><a href="/knowledgeos/library">资料库</a><a href="/knowledgeos/account">账号与登录</a></header><main>
<h1 id="title">版本阅读</h1><p id="version"></p><div class="tools"><button id="refresh">刷新</button><form id="jump"><button type="button" id="prev" aria-label="上一位置">←</button><input type="number" min="1" step="1" required id="number" aria-label="跳转位置"><button>跳转</button><button type="button" id="next" aria-label="下一位置">→</button></form><span id="count"></span></div><p id="status" role="status"></p>
<div class="layout"><nav id="rail" aria-label="页与文本块" hidden><div id="window"></div></nav><article><h2 id="anchor"></h2><div class="modes" id="modes" hidden><button id="paper">原页</button><button id="structured">结构文本</button><button id="cite" disabled>生成引用链接</button><a id="link" hidden>打开引用</a></div><div id="original" hidden></div><pre id="text" hidden></pre></article></div></main><script>
'use strict';
const $=id=>document.getElementById(id), q=new URLSearchParams(location.search), asset=q.get('asset'), version=q.get('version'), cid=q.get('citation');
const requestedUnit=q.get('unit')??'1', requestedConversion=q.get('conversion');
const uuid=s=>typeof s==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s), digest=s=>typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const integer=Number.isSafeInteger, ready=d=>d.state==='ready'||d.state==='review';
const status=s=>{$('status').textContent=s}, invalid=()=>new Error('invalid'), problem=http=>Object.assign(new Error(),{http});
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
let gen=0, owner=null, ordinal=1, total=0, conversion=null, page=null, selection=null, pending=null, posting=false, mode=null, resolved=null, versionLabel='';
async function api(path,options){
  const r=await fetch('/knowledge/v1/'+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok)throw problem(r.status);return (await r.json()).data;
}
async function principal(g){
  const m=await api('me');if(g!==gen)return false;
  if(!m||typeof m.id!=='string'||!m.id)throw invalid();
  if(owner!==null && owner!==m.id){lock('账号已切换，请刷新以重新检查资料权限。');return false}
  owner=m.id;return true;
}
function clearPage(){
  page=null;selection=null;posting=false;getSelection().removeAllRanges();
  for(const id of ['text','original','anchor'])$(id).replaceChildren();
  for(const id of ['text','original','modes','link'])$(id).hidden=true;
  $('link').removeAttribute('href');$('cite').disabled=true;
}
function lock(message){
  ++gen;owner=null;total=0;conversion=null;resolved=null;pending=null;ordinal=1;versionLabel='';mode=null;clearPage();
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
async function metadata(){
  const data=await api('assets');if(!Array.isArray(data?.items))throw invalid();
  const rows=data.items.filter(r=>r.id===asset), row=rows.find(r=>r.version_id===version);
  return row && integer(row.version)?(rows.some(r=>r.version>row.version)?'旧版本':'固定版本')+' v'+row.version:'固定版本（无法确认是否最新）';
}
async function load(n,{fresh=false,openCitation=false}={}){
  const g=++gen;clearPage();ordinal=n;navigation();status('正在读取…');
  try{
    if(!uuid(asset)||!uuid(version)||(cid!==null&&!uuid(cid))||!/^\d{1,9}$/.test(requestedUnit)||Number(requestedUnit)<1||(requestedConversion!==null&&!uuid(requestedConversion)))throw invalid();
    if(!await principal(g))return;
    const label=fresh?await metadata():versionLabel;
    if(g!==gen)return;
    const c=openCitation && cid?locator(await api('citations/'+cid+'/resolve'),cid):null;
    if(g!==gen)return;
    if(c && ((q.has('unit')&&Number(requestedUnit)!==c.ordinal)||(requestedConversion && requestedConversion!==c.conversion_id)))throw problem(409);
    const at=c?c.ordinal:n, cv=c?c.conversion_id:(conversion??requestedConversion);
    const d=validate(await api('assets/'+asset+'/versions/'+version+'/reader?unit='+at+(cv?'&conversion='+cv:'')),at,cv);
    if(g!==gen)return;
    if(!digest(d.anchor)||await sha(d.text)!==d.anchor)throw problem(409);
    if(c && (c.conversion_id??null)!==(d.conversion_id??null))throw invalid();
    if(c && ready(d) && (!validRange(d.text,c.start,c.end)||await sha(d.text)!==c.source_hash||await sha(d.text.slice(c.start,c.end))!==c.quote_hash))throw problem(409);
    if(!await principal(g))return;
    resolved=c;versionLabel=label;ordinal=at;total=d.total;conversion=d.conversion_id??null;page=d;navigation();
    $('version').textContent=label+' · '+version;$('title').textContent=d.title||'版本阅读';$('anchor').textContent=d.chapter||((d.kind==='text'?'文本块 ':'第 ')+at+(d.kind==='text'?'':' 页'));
    if(c && ready(d))selection={start:c.start,end:c.end};
    draw();if(c)document.querySelector('#original .highlight,#text mark')?.scrollIntoView({block:'nearest'});
  }catch(e){
    if(g!==gen)return;
    if(total && !fresh && (e.http===503||e.http===502||e.http===500)){
      try{if(await principal(g))status('本处加载失败，请刷新重试或选择其他位置。')}catch(err){failure(err,g)}
    }else failure(e,g);
  }
}
function navigate(n){if(!integer(n)||n<1||n>total)return;void load(n)}
// A partial glyph/run has no known pixel boundary. Never interpolate a rectangle.
function exactBoxes(d,s){
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
  const states={failed:'本处解析失败。',empty:'此版本没有可阅读的文本块。',unconverted:'此版本尚无已完成的转换。',review:'本页解析结果待复核。'};
  status(states[d.state] || (!available?'本处尚未就绪。':showOriginal&&s&&!boxes.length?'原页缺少精确选区坐标，请查看结构文本中的高亮。':resolved?'已定位到固定版本引用。':'已打开固定版本。'));
}
function capture(){
  if(!page||!ready(page)||posting||$('text').hidden)return;
  const sel=getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  const r=sel.getRangeAt(0),text=$('text');if(!text.contains(r.startContainer)||!text.contains(r.endContainer)){selection=null;pending=null;$('cite').disabled=true;return}
  // Measure from the container, not indexOf(quote): repeated passages and split mark nodes are legal.
  const prefix=r.cloneRange();prefix.selectNodeContents(text);prefix.setEnd(r.startContainer,r.startOffset);
  const start=prefix.toString().length,end=start+r.toString().length;
  if(selection?.start!==start||selection?.end!==end){$('link').hidden=true;$('link').removeAttribute('href')}
  selection=validRange(page.text,start,end)?{start,end}:null;$('cite').disabled=!selection;
}
async function createCitation(){
  if(!page||!selection||posting)return;
  const g=gen, d=page, {start,end}=selection;posting=true;$('cite').disabled=true;
  try{
    const source_hash=await sha(d.text),quote=await sha(d.text.slice(start,end));if(g!==gen)return;
    const body={asset_id:asset,version_id:version,ordinal:d.ordinal,start,end,source_hash,...(d.conversion_id?{conversion_id:d.conversion_id}:{})};
    const signature=JSON.stringify([owner,body]);
    const key=pending?.signature===signature?pending.key:crypto.randomUUID();pending={signature,key};
    if(!await principal(g))return;
    const receipt=await api('citations',{method:'POST',headers:{'Content-Type':'application/json','X-KnowledgeOS-Request':'1','Idempotency-Key':key},body:JSON.stringify(body)});
    if(!await principal(g))return;
    const c=locator(receipt);if(!uuid(c.id)||c.ordinal!==body.ordinal||c.start!==start||c.end!==end||c.source_hash!==source_hash||c.quote_hash!==quote||(c.conversion_id??null)!==(body.conversion_id??null))throw invalid();
    const u=new URL('/knowledgeos/reader',location.origin);u.search=new URLSearchParams({asset,version,citation:c.id});
    $('link').href=u.href;$('link').hidden=false;draw();status('引用链接已生成。');
  }catch(e){
    if(g!==gen)return;if([401,403,404,409].includes(e.http)){failure(e,g);return}
    // A lost response is not proof of a failed write. Preserve the request key for this exact range.
    status('未收到有效回执，可以重试本次引用。');
  }finally{if(g===gen){posting=false;$('cite').disabled=!selection}}
}
$('paper').onclick=()=>{mode='paper';draw()};$('structured').onclick=()=>{mode='text';draw()};
$('cite').onpointerdown=e=>e.preventDefault();$('cite').onclick=createCitation;document.addEventListener('selectionchange',capture);
$('jump').onsubmit=e=>{e.preventDefault();navigate(Number($('number').value))};$('prev').onclick=()=>navigate(ordinal-1);$('next').onclick=()=>navigate(ordinal+1);
$('rail').onscroll=renderWindow;new ResizeObserver(renderWindow).observe($('rail'));
function refresh(){void load(total?ordinal:Number(requestedUnit),{fresh:true,openCitation:!!cid && (!page || !!resolved)})}
$('refresh').onclick=refresh;
// Recheck source ACL as well as account on return; never restore private pixels from bfcache.
window.addEventListener('pagehide',()=>lock('阅读页已关闭。'));
window.addEventListener('pageshow',e=>{if(e.persisted)refresh()});
window.addEventListener('focus',()=>{if(owner && !document.hidden)refresh()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
void load(Number(requestedUnit),{fresh:true,openCitation:true});
</script></body></html>`
}
