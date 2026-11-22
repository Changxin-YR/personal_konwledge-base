export function buildInvitationHtml(){return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邀请码 · KnowledgeOS</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f7faf9;color:#243936;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:white;border-bottom:1px solid #cbd9d6}header nav,main{max-width:1000px;margin:auto;padding:12px 20px}nav,.row,form{display:flex;gap:10px;align-items:center;flex-wrap:wrap}nav strong,a{color:#185d60}h1{font-size:24px;margin:6px 0}h2{font-size:17px;margin:4px 0 10px}section{border-top:1px solid #cbd9d6;padding:14px 0}input,select,button{font:inherit;color:inherit;background:white;border:1px solid #9bb1ac;border-radius:5px;padding:5px 8px;max-width:100%}button{cursor:pointer}button.primary{background:#245d5a;color:white}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #176d92;outline-offset:2px}#token{width:29em}#days,#uses,#renew-days{width:5em}#issued-code{overflow-wrap:anywhere;font-family:Consolas,monospace}#status{min-height:1.6em;color:#506864}label{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}ul{padding:0;list-style:none}li{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid #d2ddda;padding:9px 0}#managed{min-width:0}#managed ul{overflow-wrap:anywhere}#confirm-panel{margin:8px 0;color:#814c25}@media(max-width:600px){header nav,main{padding-inline:12px}form{align-items:flex-end}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/invitations" aria-current="page">邀请码</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>邀请码</h1><p id="status" role="status">正在读取…</p><div id="workspace" hidden>
<section><h2>兑换邀请码</h2><form id="redeem"><label>邀请码 <input id="token" required maxlength="43" autocomplete="off" spellcheck="false"></label><button class="primary">兑换</button></form><p id="redeemed" hidden></p></section>
<section><h2>创建邀请码</h2><form id="issue"><label>范围 <select id="scope"><option value="object">指定资料</option><option value="project">项目成员</option></select></label><label id="asset-label">资料 <select id="assets" required></select></label><label id="project-label" hidden>项目 <select id="projects" disabled required></select></label><label id="permission-label">权限 <select id="permission"><option value="read">只读</option><option value="edit">阅读与编辑</option></select></label><label>有效天数 <input id="days" type="number" min="1" max="90" value="7" required></label><label>最多人数 <input id="uses" type="number" min="1" max="100" value="1" required></label><button>预览</button></form><div id="preview" class="row" hidden><span id="issue-preview"></span><button id="create" class="primary">确认创建</button><button id="cancel-issue">取消</button></div><p id="created" hidden><strong>邀请码：</strong><output id="issued-code"></output> <button id="copy" type="button">复制邀请码</button></p></section>
<section><h2>已创建的邀请</h2><ul id="invitations"></ul><div id="managed" hidden><h2 id="managed-title"></h2><p id="managed-meta"></p><ul id="affected"></ul><div class="row" id="manage-tools"><label>续期天数 <input id="renew-days" type="number" min="1" max="90" value="7"></label><button id="preview-renew">预览整组续期</button><button id="preview-revoke">预览撤销</button></div><div class="row" id="confirm-panel" hidden><span id="change-preview"></span><button id="confirm-change" class="primary">确认操作</button><button id="cancel-change">取消</button></div></div></section></div></main>
<script>
const $=k=>document.getElementById(k),api='/knowledge/v1/invitations',query=new URL(location.href).searchParams;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const labels={read:'只读',edit:'阅读与编辑',member:'项目成员'},status=s=>$('status').textContent=s;
let owner=null,busy=false,reloadPending=false,epoch=0,issue=null,requestKey=null,current=null,change=null;
const format=s=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(s));
function remaining(end,now){let minutes=Math.ceil(Math.max(0,Date.parse(end)-Date.parse(now))/60000);return minutes>=1440?Math.floor(minutes/1440)+' 天 '+Math.floor(minutes%1440/60)+' 小时':Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟'}
const term=(end,now)=>format(end)+' · 剩余 '+remaining(end,now);
function error(code){const e=new Error(code);e.code=code;throw e}
async function raw(url,body,key){
  const opts=body?{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1',...(key?{'idempotency-key':key}:{})},body:JSON.stringify({actor_id:owner,...body})}:{};
  const r=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'error',...opts});const data=await r.json();if(!r.ok)error(data.code||'FAILED');return data.data;
}
function hideCode(){$('issued-code').textContent='';$('created').hidden=true;$('token').value=''}
function conceal(){++epoch;$('workspace').hidden=true;hideCode();$('redeemed').hidden=true;$('redeemed').replaceChildren();$('preview').hidden=true;$('managed').hidden=true;$('confirm-panel').hidden=true;issue=current=change=null}
async function session(g){const a=await raw('/knowledge/v1/me');if(g!==epoch)error('STALE');if(!uuid(a?.id)||owner&&a.id!==owner){conceal();error('ACTOR_CHANGED')}owner=a.id}
async function call(g,path='',body,key){const d=await raw(api+path,body,key);await session(g);if(d.actor_id!==owner)error('ACTOR_CHANGED');return d}
const messages={INVITATION_UNAVAILABLE:'邀请不可用或未获授权。',INVITATION_FULL:'该邀请码已无剩余名额。',INVITATION_CHANGED:'邀请已变化，请重新预览。',AUTH_REQUIRED:'请登录后刷新。',SESSION_EXPIRED:'请登录后刷新。',ACTOR_CHANGED:'账号已切换，请刷新。',IDEMPOTENCY_CONFLICT:'请求内容已变化，请重新预览。'};
async function run(fn){if(busy)return;busy=true;const g=epoch;try{await session(g);await fn(g);if(g===epoch&&!document.hidden)$('workspace').hidden=false}
  catch(e){if(g===epoch&&e.code!=='STALE'){if(['SESSION_EXPIRED','AUTH_REQUIRED','ACTOR_CHANGED'].includes(e.code))conceal();status(messages[e.code]||'操作失败，请重试。')}}finally{busy=false;if(reloadPending){reloadPending=false;if(!document.hidden)void run(load)}}}
function scope(){const project=$('scope').value==='project';$('asset-label').hidden=project;$('assets').disabled=project;$('project-label').hidden=!project;$('projects').disabled=!project;$('permission-label').hidden=project}
function draft(){const object=$('scope').value==='object';return {scope:object?'object':'project',target_id:$(object?'assets':'projects').value,permission:object?$('permission').value:'member',days:$('days').valueAsNumber,max_redemptions:$('uses').valueAsNumber}}
function setChoices(select,items,preferred){select.replaceChildren(new Option('请选择',''),...items.map(x=>new Option(x.title,x.id)));if(items.some(x=>x.id===preferred))select.value=preferred}
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
async function list(g){const d=await call(g);$('invitations').replaceChildren(...d.items.map(x=>{
  const li=node('li',''),b=node('button','管理邀请');b.type='button';b.onclick=()=>run(k=>manage(k,x.id));
  li.append(node('strong',x.title),node('span',labels[x.target.permission]+' · '+x.redeemed_count+'/'+x.max_redemptions+' · '+(x.active?format(x.expires_at):x.revoked_at?'已撤销':'已到期')),b);return li;
}));if(!d.items.length)$('invitations').append(node('li','暂无邀请。'))}
async function load(g){const result=await Promise.all([raw('/knowledge/v1/assets'),raw('/knowledge/v1/projects')]);await session(g);
  const seen=new Map();for(const item of result[0].items)if(!seen.has(item.id))seen.set(item.id,item);
  setChoices($('assets'),[...seen.values()],query.get('asset'));setChoices($('projects'),result[1].items,query.get('project'));if(query.has('project'))$('scope').value='project';scope();await list(g);status('');}
async function manage(g,id){current=change=null;$('confirm-panel').hidden=true;$('managed').hidden=true;
  const d=await call(g,'/'+id);
  $('managed-title').textContent=d.title;$('managed-meta').textContent=term(d.expires_at,d.server_time);
  $('affected').replaceChildren(...d.affected.map(a=>node('li','已兑换授权 '+a.id.slice(0,8)+' · '+format(a.expires_at))));$('manage-tools').hidden=!d.active;
  current=d;$('managed').hidden=false;}
$('scope').onchange=scope;$('issue').oninput=()=>{$('preview').hidden=true;issue=null};
$('issue').onsubmit=e=>{e.preventDefault();void run(async g=>{hideCode();const d=draft(),p=await call(g,'/preview',d);issue=d;requestKey=crypto.randomUUID();$('issue-preview').textContent=p.title+' · '+labels[p.target.permission]+' · '+term(p.expires_at,p.server_time)+' · '+p.max_redemptions+' 人';$('preview').hidden=false;})};
$('create').onclick=()=>{if(!issue)return;void run(async g=>{const p=await call(g,'',issue,requestKey);issue=null;$('preview').hidden=true;if(p.token){$('issued-code').textContent=p.token;$('created').hidden=false}status(p.token?'已创建 · '+term(p.expires_at,p.server_time):'邀请已创建。已确认的原码不会再次显示。');await list(g)})};
$('cancel-issue').onclick=()=>{issue=null;$('preview').hidden=true};$('copy').onclick=()=>{const code=$('issued-code').textContent;if(code)void navigator.clipboard.writeText(code).then(()=>status('邀请码已复制。'),()=>status('无法访问剪贴板。'))};
$('redeem').onsubmit=e=>{e.preventDefault();const token=$('token').value.trim();void run(async g=>{const d=await call(g,'/redeem',{token});$('token').value='';$('redeemed').textContent=d.title+' · '+labels[d.target.permission]+' · '+term(d.expires_at,d.server_time);$('redeemed').hidden=false;status(d.replayed?'已确认此前兑换。':'兑换成功。');})};
function prepare(event){if(!current?.active)return;const days=$('renew-days').valueAsNumber;if(event==='renew'&&!$('renew-days').reportValidity())return;
  change={event,id:current.id,revision:current.revision,days,key:crypto.randomUUID()};const n=current.affected.length;
  $('change-preview').textContent=event==='revoke'?'撤销会同时终止 '+n+' 份有效派生授权。':n+' 份有效派生授权的截止从 '+format(current.expires_at)+' 延长至 '+format(new Date(Date.parse(current.expires_at)+days*86400000).toISOString())+'。';$('confirm-panel').hidden=false;}
$('preview-renew').onclick=()=>prepare('renew');$('preview-revoke').onclick=()=>prepare('revoke');$('cancel-change').onclick=()=>{change=null;$('confirm-panel').hidden=true};
$('confirm-change').onclick=()=>{const x=change;if(!x)return;void run(async g=>{try{const d=await call(g,'/'+x.id+'/'+x.event,{expected_revision:x.revision,...(x.event==='renew'?{days:x.days}:{})},x.key);status('已更新 '+d.affected_count+' 份派生授权。')}
  catch(e){if(g===epoch&&!e.code){status('未收到确认。可使用当前预览重新确认。');return}throw e}
  change=null;$('confirm-panel').hidden=true;await manage(g,x.id);await list(g)})};
function reloadWhenVisible(){if(document.hidden)return;if(busy)reloadPending=true;else void run(load)}
document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();else reloadWhenVisible()});window.addEventListener('pagehide',conceal);window.addEventListener('pageshow',e=>{if(e.persisted)reloadWhenVisible()});
void run(load);
</script></body></html>`}
