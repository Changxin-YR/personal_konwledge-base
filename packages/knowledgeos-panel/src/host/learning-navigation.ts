export const learningEntries = [
  ['专业术语', '/knowledgeos/terms', '按原文语境回看个人术语卡'],
  ['遮挡背诵', '/knowledgeos/recall', '继续背诵已保存的遮挡段落'],
  ['基础快答', '/knowledgeos/practice?track=quick', '选一道题，立即作答'],
  ['错题复习', '/knowledgeos/review', '查看首答和个人复习安排'],
] as const

export const learningStyle = `
@media(min-width:1080px){body:has(header .workspace-nav){display:grid;grid-template-columns:196px minmax(0,1fr);align-items:start}body:has(header .workspace-nav)>header{position:sticky;top:0;height:100vh;border:0;border-right:1px solid #cbd8d5}header:has(.workspace-nav)>div{padding:24px 18px;align-items:start;flex-direction:column}.workspace-nav{width:100%}header .workspace-nav{display:grid;gap:6px}header .workspace-nav a{display:block;padding:8px 12px;border-radius:7px;text-decoration:none}header .workspace-nav [aria-current=page]{background:#e4f0ed;color:#205a58}body:has(header .workspace-nav)>main{width:100%;padding-inline:28px}}
#learning-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-block:14px 22px}
#learning-shortcuts a{display:grid;align-content:start;gap:5px;min-width:0;min-height:78px;background:white;color:#20595d;border:1px solid #bad0cd;border-top:3px solid #538588;border-radius:8px;padding:12px;text-decoration:none;overflow-wrap:anywhere}
#learning-shortcuts a:hover,#learning-shortcuts a:focus-visible{background:#edf5f3;border-color:#37747b}
#learning-shortcuts strong{font-size:17px}#learning-shortcuts small{font-size:13px;color:#526966}.workspace-nav{display:flex;gap:14px;flex-wrap:wrap;align-items:center}.workspace-nav a{padding:5px 0}.workspace-nav [aria-current=page]{font-weight:700;text-decoration-thickness:2px}
@media(max-width:700px){#learning-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:330px){#learning-shortcuts{grid-template-columns:1fr}}`

export function learningShortcuts() {
  return `<nav id="learning-shortcuts" aria-label="学习入口">${learningEntries.map(([name, href, hint]) =>
    `<a href="${href}" aria-label="${name}"><strong>${name}</strong><small>${hint}</small></a>`).join('')}</nav>`
}

export function workspaceNav(current: 'library' | 'today') {
  return `<nav class="workspace-nav" aria-label="工作区"><a href="/knowledgeos/today"${current === 'today' ? ' aria-current="page"' : ''}>今日计划</a><a href="/knowledgeos/library"${current === 'library' ? ' aria-current="page"' : ''}>知识库</a><a href="/knowledgeos/notes">笔记</a><a href="/knowledgeos/projects">项目协作</a><a href="/knowledgeos/account">账号与设置</a></nav>`
}

const pageStyle = `*{box-sizing:border-box}body{margin:0;background:#f5f8f7;color:#23353a;font:15px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}header{border-bottom:1px solid #ccdad7;background:white}header>div,main{max-width:900px;margin:auto;padding:16px 22px}header>div{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}header strong{color:#22595c;font-size:19px}main{padding-block:24px}h1{font-size:26px;margin:0 0 8px}h2{font-size:19px;margin:16px 0 8px}a{color:#1c6267;text-underline-offset:3px}ul{list-style:none;padding:0}li{padding:9px 0;border-bottom:1px solid #d2dedb;overflow-wrap:anywhere}button{font:inherit;cursor:pointer;border:1px solid #71948e;background:white;padding:6px 12px;border-radius:6px}small{display:block;color:#526966}:focus-visible{outline:3px solid #216e89;outline-offset:3px}[hidden]{display:none!important}section+section{border-top:1px solid #ccdad7;margin-top:18px}select{max-width:100%;font:inherit} @media(max-width:640px){main,header>div{padding-inline:14px}}`

export function buildTodayHtml(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>今日计划 · KnowledgeOS</title><style nonce="${nonce}">${pageStyle}${learningStyle}</style></head><body><header><div><strong>KnowledgeOS</strong>${workspaceNav('today')}</div></header><main><h1>今日计划</h1><h2>学习快捷入口</h2>${learningShortcuts()}</main></body></html>`
}

export function buildTermsHtml(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>专业术语 · KnowledgeOS</title><style nonce="${nonce}">${pageStyle}${learningStyle}</style></head><body><header><div><strong>KnowledgeOS</strong>${workspaceNav('library')}</div></header><main><h1>专业术语</h1><p id="term-library-status" role="status">正在读取…</p><a hidden id="terms-login" href="/knowledgeos/account">登录</a><div id="term-workspace" hidden><section><h2>我收藏的术语</h2><ul id="personal-terms"></ul><button id="terms-more" hidden type="button">更多术语</button></section><section><h2>从原文选词</h2><label>资料版本 <select id="term-source"></select></label> <a id="term-source-open" hidden>打开阅读器</a><p id="term-source-empty" hidden>还没有可阅读的资料。<a href="/knowledgeos/library#list-heading">去知识库</a></p></section></div></main>
<script nonce="${nonce}">
const $=id=>document.getElementById(id), status=text=>$('term-library-status').textContent=text;
let owner=null, cursor=null, pages=1, generation=0, pending=false, signature='';
function clear(){generation++;pending=false;owner=null;cursor=null;pages=1;signature='';$('personal-terms').replaceChildren();$('term-source').replaceChildren();$('term-source-open').removeAttribute('href');$('term-workspace').hidden=true;$('terms-more').hidden=true;$('terms-login').hidden=true}
async function api(path){const res=await fetch('/knowledge/v1/'+path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(!res.ok){const error=new Error();error.status=res.status;throw error}return (await res.json()).data}
function sourceLink(){const target=$('term-source-open'),href=$('term-source').value;target.hidden=!href;if(href)target.href=href;else target.removeAttribute('href')}
async function refresh(){if(document.hidden||pending)return;pending=true;const g=generation;
  try{const me=await api('me'), assets=await api('assets'), terms=[];let next=null;
    for(let i=0;i<pages;i++){const result=await api('terms/collection'+(next?'?after='+encodeURIComponent(next):''));if(result.actor_id!==me.id)throw Error();terms.push(...result.terms);next=result.next;if(!next)break}
    const confirmed=await api('me');if(g!==generation||document.hidden)return;
    if(me.id!==confirmed.id||assets.actor_id!==me.id||owner&&owner!==me.id){clear();status('账号已切换。');return}
    owner=me.id;cursor=next;const available=assets.items.filter(v=>v.media_type!=='application/zip');
    const snapshot=JSON.stringify([terms,available.map(a=>[a.id,a.version_id,a.title,a.version]),next]);if(signature!==snapshot){
      const old=$('term-source').value;const options=available.map(a=>{const o=document.createElement('option');o.value='/knowledgeos/reader?'+new URLSearchParams({asset:a.id,version:a.version_id});o.textContent=a.title+' · v'+a.version;return o});$('term-source').replaceChildren(...options);if(options.some(o=>o.value===old))$('term-source').value=old;sourceLink();$('term-source-empty').hidden=options.length>0;$('term-source').disabled=!options.length;
      const rows=terms.map(t=>{const li=document.createElement('li'),link=document.createElement('a'),detail=document.createElement('small');link.href=t.href;link.dataset.termId=t.id;link.textContent=t.term;detail.textContent=t.context;li.append(link,detail);return li});$('personal-terms').replaceChildren(...rows);signature=snapshot}
    $('terms-login').hidden=true;$('term-workspace').hidden=false;$('terms-more').hidden=!next;status(terms.length?'':'还没有收藏的术语。可从资料中选词并保存。');
  }catch(error){if(g===generation){clear();$('terms-login').hidden=error.status!==401;status(error.status===401?'请先登录。':'暂时无法读取个人术语。')}}finally{if(g===generation)pending=false}}
$('term-source').onchange=sourceLink;$('terms-more').onclick=()=>{if(cursor&&!pending){pages++;void refresh()}};document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else void refresh()});addEventListener('pagehide',clear);addEventListener('pageshow',()=>void refresh());addEventListener('focus',()=>void refresh());setInterval(refresh,1800);void refresh();
</script></body></html>`
}
