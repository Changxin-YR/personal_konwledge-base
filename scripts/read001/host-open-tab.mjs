// Real isolated DSH/Chrome scenarios first. Only controlledSwitch intercepts traffic.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash, randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {setTimeout as sleep} from 'node:timers/promises'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {knownPdf, textFor} from '../lib002/a07-known-pdf.mjs'
import {isolate, until} from '../lib002/a07-isolated-host.mjs'
import {api, dbPath, entryCookie, login, sql} from '../fnd004/harness.mjs'

const [candidate, entry, parent=tmpdir()] = process.argv.slice(2)
const root = fileURLToPath(new URL('../../', import.meta.url)), self = 'scripts/read001/host-open-tab.mjs'
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], {cwd:root})
const sha = b => createHash('sha256').update(b).digest('hex')
assert.match(candidate, /^[a-f0-9]{40}$/); assert.match(entry, /^[a-f0-9]{64}$/)
assert.equal(git('rev-parse','HEAD').toString().trim(), candidate)
const runner = sha(readFileSync(join(root,self))); assert.equal(runner, sha(git('show',candidate+':'+self)))
mkdirSync(resolve(parent), {recursive:true})
const out = mkdtempSync(join(resolve(parent),'read001-open-tab-'))
const report = {candidate_sha:candidate, entry_sha256:entry, runner_sha256:runner, status:'NOT_RUN', cases:[]}
const prefix = '/knowledge/v1', tag = 'opentab', phrase = textFor(tag,2)
let host, browser, ctx, owner, member, readerId, pid, phase = 'boot'
async function send(who,path,status,body,headers={}) {
  const r = await fetch(host.base+prefix+path, {method:body===undefined?'GET':'POST', redirect:'error',
    signal:AbortSignal.timeout(15000), headers:{cookie:who,'x-knowledgeos-request':'1',...headers},body})
  assert.equal(r.status,status,path); if(status===204)return
  const json = await r.json(); if(status>=400){assert(!('data' in json)); return} return json.data
}
const post = (path,status,obj) => send(owner,path,status,JSON.stringify(obj),{'content-type':'application/json'})
async function fixture() {
  const doc = await send(owner,'/imports',201,knownPdf(tag),{'content-type':'application/pdf',
    'idempotency-key':randomUUID(),'x-knowledgeos-filename':'open-tab.pdf'})
  const {id} = await post('/objects',201,{scope:'project',project_id:pid,object_type:'asset',title:'Shared PDF',body:'Synthetic'})
  const db = dbPath(host.data), conn = new DatabaseSync(db)
  try {
    conn.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE'); conn.prepare('INSERT INTO assets VALUES(?)').run(id)
    assert.equal(conn.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(id,doc.version_id,doc.id).changes,1)
    conn.exec('COMMIT')
  } finally {conn.close()}
  const version = doc.version_id, base = '/assets/'+id+'/versions/'+version, access = base+'/reader-access'
  await post('/assets/'+id+'/process',202,{version_id:version})
  await until(()=>sql(db,'SELECT state FROM pdf_pages WHERE version_id=? AND page=2',[version])[0]?.state==='ready','parsed PDF',45000)
  await send(member,base+'/reader?unit=2',404)
  const grant = await post('/grants',201,{object_id:id,subject_type:'user',subject_id:readerId,action:'read'})
  return {id,version,grant:grant.id,base,access,url:host.base+'/knowledgeos/reader?'+new URLSearchParams({asset:id,version,unit:2})}
}
async function view(p,mode) {
  await p.waitForFunction(({mode,phrase})=>{
    const $ = s=>document.querySelector(s), img=$('#original img')
    return mode==='paper' ? img?.naturalWidth>0 && img.getClientRects().length>0 : $('#text').innerText===phrase && $('#text').getClientRects().length>0
  },{mode,phrase})
}
async function openPage(f,mode) {
  const p = await ctx.newPage(); await p.goto(f.url); await view(p,'paper')
  if(mode==='text'){await p.locator('#structured').click(); await view(p,'text')}
  assert(await p.locator('#window button').count()>1)
  return p
}
// Serialize this predicate into Chrome. Hidden stale nodes do not count as cleared.
function locked() {
  const $ = id=>document.getElementById(id)
  return !$('text').textContent && !$('original').childElementCount && !$('window').childElementCount &&
    !$('count').textContent && !$('anchor').textContent && !$('version').textContent &&
    !$('rail').getClientRects().length && [...$('jump').querySelectorAll('button,input')].every(e=>e.disabled || !e.getClientRects().length)
}
async function arm(p,forbidden) {
  const token = randomUUID()
  await p.evaluate(({token,forbidden})=>{
    const flags = window.__openTabAudit = {token,background:document.hidden || !document.hasFocus(),exposed:false}
    addEventListener('blur',()=>{flags.background=true}); document.addEventListener('visibilitychange',()=>{if(document.hidden)flags.background=true})
    const visible = e=>e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden'
    const check = ()=>{
      const text=document.querySelector('#text'), img=document.querySelector('#original img')
      if((forbidden!=='paper' && visible(text) && text.textContent) || (forbidden!=='text' && visible(img)))flags.exposed=true
    }
    new MutationObserver(check).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true}); check()
  },{token,forbidden})
  return token
}
async function noExposure(p,token) {
  assert.deepEqual(await p.evaluate(()=>window.__openTabAudit),{token,background:false,exposed:false},'same foreground document; no forbidden content')
}
async function snap(p,name,c) {
  const file=name+'.png', bytes=await p.screenshot({path:join(out,file)}); (c.screens??=[]).push({file,sha256:sha(bytes)})
}

async function realRevoke(f,mode,c) {
  const p = await openPage(f,mode), endpoint = host.base+prefix+f.access, replies=[]
  p.on('response',r=>{if(r.url()===endpoint && r.request().method()==='GET')replies.push({at:Date.now(),status:r.status()})})
  try {
    const token = await arm(p,mode==='paper'?'text':'paper'); await snap(p,mode+'-before',c)
    const start = Date.now(); await post('/grants/revoke',204,{grant_id:f.grant}); c.revoked=204
    await send(member,f.base+'/reader?unit=2',404); c.content_after=404; c.access_responses=replies
    await p.waitForFunction(locked,null,{timeout:4000}); c.clear_ms=Date.now()-start
    await noExposure(p,token); assert(replies.some(r=>r.at>=start && r.status===404),'real foreground ACL denial')
    await send(member,f.access,404)
    const guard = await arm(p,'both')
    // Exercise existing handlers even if the locked UI now hides the buttons.
    for(const id of ['paper','structured'])await p.locator('#'+id).evaluate(el=>el.click())
    await sleep(2250); await noExposure(p,guard); assert(await p.evaluate(locked)); await snap(p,mode+'-locked',c)
  } catch(e){await snap(p,mode+'-failure',c); throw e} finally {await p.close()}
}
async function accessContract(f) {
  assert.deepEqual(await send(member,f.access,200),{actor_id:readerId,asset_id:f.id,version_id:f.version,version:1,is_latest:true})
  await send('',f.access,401)
}
// Hold an actual Host allow response or abort at Chrome's network boundary.
async function controlledSwitch(f,kind,c) {
  const mode = kind==='failure'?'text':'paper', target=mode==='paper'?'text':'paper'
  const p = await openPage(f,mode), url=host.base+prefix+f.access
  let armed=false, release, hits=0, handlerError
  const gate=new Promise(ok=>{release=ok}), active=new Set()
  async function intercept(route) {
    if(!armed)return route.continue()
    hits++; assert.equal(route.request().method(),'GET')
    if(kind==='failure')return route.abort('failed')
    const real=await route.fetch({timeout:5000}); assert.equal(real.status(),200)
    assert.equal((await real.json()).data.actor_id,readerId); c.upstream_status=200
    await gate; await route.fulfill({response:real})
  }
  const handler=route=>{
    const task=intercept(route).catch(e=>{handlerError=e}).finally(()=>active.delete(task)); active.add(task); return task
  }
  try {
    await p.route(url,handler)
    const poll=()=>p.waitForResponse(r=>r.url()===url && r.request().method()==='GET' && r.status()===200,{timeout:4000})
    await poll(); const first=performance.now(); await poll(); const gap=performance.now()-first
    c.poll_gap_ms=Math.round(gap); assert(gap>=1400 && gap<=3000,'expected 2s foreground interval')
    const token=await arm(p,target); armed=true; const at=performance.now()
    await p.locator(target==='text'?'#structured':'#paper').click({timeout:800})
    await until(()=>hits>0,'switch-triggered ACL request',800); c.switch_request_ms=Math.round(performance.now()-at)
    assert(c.switch_request_ms<1000,'switch must not wait for next periodic check')
    if(kind==='allow') {
      await until(()=>c.upstream_status===200,'upstream allow',1000); await sleep(200); await noExposure(p,token)
      release(); await view(p,target)
    } else {
      await p.waitForFunction(locked,null,{timeout:10000}); c.lock_ms=Math.round(performance.now()-at)
      if(kind==='timeout')assert.equal(c.upstream_status,200)
      release(); await Promise.all([...active]); await sleep(300); await noExposure(p,token); assert(await p.evaluate(locked))
    }
    if(handlerError)throw handlerError
  } finally {release(); await p.unroute(url,handler); await Promise.all([...active]); await p.close()}
}

function diagnostic(e) {
  return {type:e.name,message:String(e.message).split('\n')[0].slice(0,250),line:String(e.stack).match(/host-open-tab\.mjs:\d+/)?.[0]}
}
async function runCase(name,source,fn) {
  const c={name,source,status:'NOT_RUN'}; report.cases.push(c)
  try {await fn(c); c.status='PASS'} catch(e){c.status='FAIL'; c.failure=diagnostic(e); process.exitCode=1}
}
try {
  host=await isolate(candidate,entry); const boot=await host.start(); report.host_pid=boot.pid
  const password=randomUUID(), admin=(await entryCookie(boot.entry)).cookie
  for(const [ep,cookie,name] of [['bootstrap',admin,'setup'],['register','','owner'],['register','','reader']]) {
    assert.equal((await api(host.port,cookie,'POST',prefix+'/auth/'+ep,{login_name:name,display_name:name,password})).status,201)
  }
  const session=await login(host.port,'owner',password); assert.equal(session.response.status,200); owner=session.cookie
  const {chromium}=await import(pathToFileURL(host.playwright)); browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']})
  report.chrome=browser.version(); ctx=await browser.newContext({serviceWorkers:'block'}); ctx.setDefaultTimeout(12000)
  const account=await ctx.newPage(); await account.goto(host.base+'/knowledgeos/account')
  await account.locator('#login_name').fill('reader'); await account.locator('#login_password').fill(password); await account.locator('#login').click(); await account.locator('#profile').waitFor()
  member=(await ctx.cookies(host.base+prefix+'/me')).map(c=>c.name+'='+c.value).join('; '); await account.close(); readerId=(await send(member,'/me',200)).id
  pid=(await post('/projects',201,{name:'Open tab ACL fixture'})).id
  await post('/projects/'+pid+'/memberships',204,{user_id:readerId,role:'member'})
  for(const mode of ['paper','text']) {
    phase='project PDF '+mode; const f=await fixture(); await runCase('revoke-'+mode,'real-host-chrome',c=>realRevoke(f,mode,c))
  }
  phase='switch fixture'; const f=await fixture()
  await runCase('reader-access contract','real-host',()=>accessContract(f))
  for(const kind of ['allow','timeout','failure'])await runCase('switch-'+kind,'controlled-chrome-network / real-host',c=>controlledSwitch(f,kind,c))
  report.status=report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL'
} catch(e){report.status='FAIL'; report.failure={phase,...diagnostic(e)}; process.exitCode=1}
finally {
  try {try {await browser?.close()} finally {await host?.stop()}}
  catch(e){report.status='FAIL'; report.cleanup=diagnostic(e); process.exitCode=1}
  writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n'); console.log(report.status,out)
}
