/** From a frozen integrated checkout: node scripts/lib002/host-acceptance.mjs <full SHA> <entry SHA256> [evidence parent] */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync,mkdtempSync,writeFileSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { entryCookie } from '../fnd003/harness.mjs'
import { api,dbPath } from '../fnd004/harness.mjs'
import { root } from '../fnd005/candidate-live-binding.mjs'
import { sha,uuid } from '../fnd005/candidate-live-guards.mjs'
import { isolate,until } from './a07-isolated-host.mjs'
import { knownPdf,textFor,titleFor } from './a07-known-pdf.mjs'

const [commit,hash,parent=join(root,'.cache/lib002-evidence')]=process.argv.slice(2)
assert(process.argv.length<=5 && /^[0-9a-f]{40}$/.test(commit) && /^[0-9a-f]{64}$/.test(hash),'Expected full frozen commit and entry SHA-256')
mkdirSync(parent,{recursive:true});const out=mkdtempSync(join(resolve(parent),'a07-'))
const report={status:'NOT_RUN',candidate:commit,entry:hash,node:process.version,scope:{T01:'NOT_RUN',T02:'NOT_RUN',A07:'NOT_RUN',P02:'NOT_RUN',A06:'NOT_RUN'},events:[]}
const save=()=>writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n')
const log=(name,data={})=>{report.events.push({name,at:new Date().toISOString(),...data});save()}
let h,browser,alice,bob,anon,page,phase='binding',started=false
const prefix='/knowledge/v1',library='/knowledgeos/library',marker={'x-knowledgeos-request':'1'}
const version=r=>`${prefix}/assets/${r.id}/versions/${r.version_id}`,parse=r=>version(r)+'/parse',operation=r=>prefix+'/operations/'+r.version_id,processPath=r=>prefix+'/assets/'+r.id+'/process'
async function http(ctx,path,status,{method='GET',headers=marker,data}={}){
  const res=await ctx.request.fetch(h.base+path,{method,headers,data,maxRedirects:0});return checked(res,path,method,status)
}
async function checked(res,path,method,status){
  if(status===204){log('http',{path,method,status:res.status()});assert.equal(res.status(),204);assert.equal((await res.body()).byteLength,0);return}
  const body=await res.json();log('http',{path,method,status:res.status(),state:body.data?.state,code:body.code})
  assert.equal(res.status(),status,`${method} ${path}`)
  if(status>=400){assert.equal(body.data,undefined);assert.equal(typeof body.code,'string');return body.code}
  if(status===202){assert(['queued','running'].includes(body.data.state));assert.equal(res.headers().location,body.data.status_url)}
  return body.data
}
async function boot(flags=[]){const {entry,pid}=await h.start(flags);log('boot',{pid,flags});return {entry,pid}}
async function stop(hard=false){const exit=await h.stop(hard);log('host-exit',{...exit,boundary:h.events()});return exit}
async function signIn(ctx,name,password){
  const p=await ctx.newPage();await p.goto(h.base+'/knowledgeos/account');await p.locator('#login_name').fill(name);await p.locator('#login_password').fill(password)
  await p.locator('#login').click();await p.locator('#profile').waitFor({state:'visible'});assert.equal((await http(ctx,prefix+'/me',200)).login_name,name);return p
}
async function upload(tag){
  const bytes=knownPdf(tag),title=`a07-${tag}.pdf`
  const r=await http(alice,prefix+'/imports',201,{method:'POST',headers:{...marker,'content-type':'application/pdf','x-knowledgeos-filename':title,'idempotency-key':randomUUID()},data:bytes})
  assert.match(r.id,uuid);assert.match(r.version_id,uuid);assert.equal(r.sha256,sha(bytes));assert.equal(r.byte_length,bytes.length)
  log('input',{tag,version_id:r.version_id,sha256:r.sha256,byte_length:bytes.length,pages:6});return r
}
function snapshot(r){
  const db=new DatabaseSync(dbPath(h.data),{readOnly:true});try{
    db.exec('BEGIN');const run=db.prepare('SELECT state,total,error,deadline,token FROM pdf_parse_runs WHERE version_id=?').get(r.version_id)
    const pages=db.prepare('SELECT page,state,chapter,text,error,generation FROM pdf_pages WHERE version_id=? ORDER BY page').all(r.version_id).map(p=>({...p}))
    return run&&{state:run.state,total:run.total,error:run.error,deadline:run.deadline,lease:run.token?sha(run.token):null,pages}
  }finally{db.close()}
}
const requests=()=>h.events().filter(e=>e.event==='request').map(e=>e.page)
const barrier=(event)=>until(()=>h.events().find(e=>e.event===event),'extractor '+event)
async function waitSql(r,state,gen4=0){return until(()=>{const s=snapshot(r);return s?.state===state && (!gen4 || s.pages[3]?.generation===gen4) && s},`SQL ${state} generation ${gen4}`,60000)}
function verifyRows(s,tag,states,gens){
  assert.equal(s.total,6);assert.deepEqual(s.pages.map(p=>p.page),[1,2,3,4,5,6]);assert.deepEqual(s.pages.map(p=>p.state),states);assert.deepEqual(s.pages.map(p=>p.generation),gens)
  for(const p of s.pages){const usable=['ready','review'].includes(p.state);assert.equal(p.text,usable?textFor(tag,p.page):'');assert.equal(p.chapter,usable?titleFor(p.page):'');assert.equal(p.error,p.state==='failed'?'PAGE_EXTRACTION_FAILED':null)}
}
async function crossRead(label,r,s){
  const a=await http(alice,parse(r),200),b=await http(alice,operation(r),200)
  for(const d of [a,b]){assert.equal(d.operation_id,r.version_id);assert.equal(d.state,s.state);assert.equal(d.total,s.total);assert.equal(d.error,s.error);assert.deepEqual(d.pages,s.pages.map(({text,generation,...rest})=>rest))}
  const rows=[];for(const from of [1,6]){const d=await http(alice,version(r)+`/pages?from=${from}&limit=5`,200);assert.equal(d.version_id,r.version_id);assert.equal(d.pages.length,from===1?5:1);rows.push(...d.pages)}
  assert.deepEqual(rows,s.pages.map(({generation,...p})=>({...p,text:['ready','review'].includes(p.state)?p.text:null})))
  log(label,{version_id:r.version_id,sql:s,http_pages:rows})
}
async function select(r){assert.equal((await page.goto(h.base+library)).status(),200);await page.locator('#parse-version').selectOption(r.version_id)}
async function button(r,suffix,label,status){
  const path=parse(r)+'/'+suffix
  const [res]=await Promise.all([page.waitForResponse(r=>r.url()===h.base+path && r.request().method()==='POST'),page.getByRole('button',{name:label,exact:true}).click()]);return checked(res,path,'POST',status)
}
const words={ready:'可用',pending:'未处理',failed:'失败',review:'待复核'}
async function screen(label,r,s){
  assert.equal(page.url(),h.base+library);assert.equal(await page.locator('#parse-version').inputValue(),r.version_id)
  await page.getByRole('button',{name:'刷新进度'}).click()
  const panel=page.locator('#parse-panel'),items=panel.locator('#parse-pages li')
  await until(async()=>{
    const ui=await items.allInnerTexts();return ui.length===6 && s.pages.every((p,i)=>ui[i].includes(`第 ${p.page} 页`) && ui[i].includes(words[p.state]) && (!p.chapter||ui[i].includes(p.chapter)) && (!p.error||ui[i].includes(p.error)))
  },'visible page states '+label)
  const png=await panel.screenshot({path:join(out,label+'.png')});log('browser:'+label,{sha256:sha(png),file:label+'.png',summary:await panel.locator('#parse-summary').innerText(),rows:await items.allInnerTexts()})
}
const partialStates=['ready','ready','pending','pending','pending','pending'],partialGens=[1,1,0,0,0,0]
const failedStates=['ready','ready','ready','failed','review','ready'],fixedStates=failedStates.with(3,'ready'),one=[1,1,1,1,1,1]

async function permissions(r){
  for(const [ctx,status,code] of [[bob,404,'ASSET_NOT_FOUND'],[anon,401,'AUTH_REQUIRED']]){
    for(const path of [parse(r),operation(r),version(r)+'/pages?from=1&limit=5'])assert.equal(await http(ctx,path,status),code)
    for(const suffix of ['/start','/cancel','/retry/4'])assert.equal(await http(ctx,parse(r)+suffix,status,{method:'POST'}),code)
    assert.equal(await http(ctx,processPath(r),status,{method:'POST',data:{version_id:r.version_id,page:4}}),code)
  }
  assert.equal(await http(alice,parse(r)+'/cancel',403,{method:'POST',headers:{}}),'CSRF_REJECTED')
}
async function lateResult(tag,revoke=false){
  const r=await upload(tag);await select(r);await button(r,'start','开始解析',202);await barrier('held')
  const before=snapshot(r);assert.equal(before.state,'running');verifyRows(before,tag,partialStates,partialGens)
  if(revoke){
    await http(alice,prefix+'/auth/logout',204,{method:'POST',data:{}})
    assert.equal(await http(alice,parse(r),401),'AUTH_REQUIRED')
  }else{
    // Replay the same version while work is in flight. No new lease or page work.
    await http(alice,processPath(r),202,{method:'POST',data:{version_id:r.version_id}})
    const replay=snapshot(r);assert.equal(replay.lease,before.lease);assert.deepEqual(replay.pages,before.pages)
    assert.equal((await button(r,'cancel','取消解析',200)).state,'cancelled')
  }
  h.release();await barrier('released');await until(()=>{
    const events=h.events(),i=events.findIndex(e=>e.event==='released');return i>=0 && events.slice(i+1).some(e=>e.event==='worker-exit')
  },'worker exited after delivering held result')
  const after=await waitSql(r,revoke?'failed':'cancelled');assert.equal(after.lease,null);assert.equal(after.deadline,null);assert.equal(after.error,revoke?'AUTHORIZATION_LOST':'CANCELLED');assert.deepEqual(after.pages,before.pages)
  assert.deepEqual(requests(),[1,2,3]);log('late-result:'+tag,{before,after,boundary:h.events()})
  if(!revoke){await crossRead('cancelled-readback',r,after);await screen('cancelled',r,after)}
}

try{
  save();h=await isolate(commit,hash);Object.assign(report,h.facts);const {chromium}=await import(pathToFileURL(h.playwright).href)
  phase='first boot';const first=await boot(['hold3']);const owner=(await entryCookie(first.entry)).cookie;assert(owner)
  const pass=randomUUID();assert.equal((await api(h.port,owner,'POST',prefix+'/auth/bootstrap',{login_name:'testadmin',display_name:'Synthetic admin',password:randomUUID()})).status,201)
  for(const name of ['alice','bob'])assert.equal((await api(h.port,'','POST',prefix+'/auth/register',{login_name:name,display_name:name,password:pass})).status,201)
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});log('chrome',{version:browser.version()})
  const context=async()=>{const c=await browser.newContext({baseURL:h.base,viewport:{width:1150,height:900},serviceWorkers:'block'});c.setDefaultTimeout(10000);return c}
  alice=await context();bob=await context();anon=await context();page=await signIn(alice,'alice',pass);await signIn(bob,'bob',pass)
  phase='T01: real partial commits and abrupt death';started=true
  const r=await upload('recovery');await select(r);await button(r,'start','开始解析',202)
  const held=await barrier('held');assert.equal(held.pid,first.pid);const running=snapshot(r);assert.equal(running.state,'running');assert(running.lease)
  verifyRows(running,'recovery',partialStates,partialGens);await crossRead('pre-kill',r,running);await screen('partial-before-kill',r,running)
  assert.deepEqual(requests(),[1,2,3]);const exit=await stop(true);assert.equal(exit.pid,first.pid)
  const dead=snapshot(r);assert.equal(dead.state,'running');assert.equal(dead.lease,running.lease);assert.deepEqual(dead.pages,running.pages);assert(Number.isSafeInteger(dead.deadline));log('after-kill',{sql:dead})

  phase='T01: lease takeover and single-page failure';const second=await boot(['fail4']);assert.notEqual(second.pid,first.pid)
  const failed=await waitSql(r,'partial',1);verifyRows(failed,'recovery',failedStates,one);assert.equal(failed.lease,null);assert.deepEqual(failed.pages.slice(0,2),running.pages.slice(0,2))
  assert.deepEqual(requests(),[3,4,5,6]);const takeover=h.events().find(e=>e.event==='request');assert.equal(takeover.pid,second.pid);assert(takeover.at>=dead.deadline,'takeover before expiry')
  assert.equal(h.events().filter(e=>e.event==='inject-error'&&e.page===4).length,1)
  await select(r);await crossRead('after-takeover',r,failed);await screen('failed-and-review',r,failed)
  phase='T01: retry while fault persists';await button(r,'retry/4','重试第 4 页',202)
  const again=await waitSql(r,'partial',2);verifyRows(again,'recovery',failedStates,one.with(3,2));assert.deepEqual(requests(),[3,4,5,6,4]);assert.equal(h.events().filter(e=>e.event==='inject-error'&&e.page===4).length,2)
  await crossRead('failed-again',r,again);await permissions(r);assert.deepEqual(snapshot(r),again);await stop()

  phase='T01: durable failure and clean targeted retry';await boot();assert.deepEqual(snapshot(r),again);await crossRead('failure-survived-restart',r,again)
  await http(alice,processPath(r),202,{method:'POST',data:{version_id:r.version_id,page:4}})
  const fixed=await waitSql(r,'partial',3);verifyRows(fixed,'recovery',fixedStates,one.with(3,3));assert.deepEqual(requests(),[4]);assert.equal(h.events().some(e=>e.event==='inject-error'),false)
  const omitTarget=s=>s.pages.filter(p=>p.page!==4);assert.deepEqual(omitTarget(fixed),omitTarget(again))
  await select(r);await crossRead('retry-recovered-text',r,fixed);await screen('repaired-with-review',r,fixed)
  report.scope.A07=report.scope.T01='PASS';save()
  phase='T02: replay on finished version';assert.equal(await http(alice,parse(r)+'/retry/4',409,{method:'POST'}),'PAGE_NOT_RETRYABLE')
  assert.equal((await http(alice,processPath(r),200,{method:'POST',data:{version_id:r.version_id}})).state,'partial');assert.deepEqual(snapshot(r),fixed);assert.deepEqual(requests(),[4]);await stop()
  phase='T02: cancellation fences a real late reply';await boot(['hold3']);await lateResult('cancel');await stop()
  phase='T02: logout fences a real late reply';await boot(['hold3']);await lateResult('revoked',true);assert.deepEqual(snapshot(r),fixed);await stop()
  report.scope.T02='PASS';report.status='PASS'
}catch(e){
  process.exitCode=1;report.status=started?'FAIL':'BLOCKED';if(phase.startsWith('T01'))report.scope.A07=report.scope.T01='FAIL';if(phase.startsWith('T02'))report.scope.T02='FAIL'
  // The Host entry URL and session-bearing headers must never appear in evidence.
  report.failure={phase,type:e.name,line:String(e.stack).match(/(?:host-acceptance|a07-isolated-host)\.mjs:\d+/)?.[0],reason:e instanceof assert.AssertionError?'assertion mismatch':String(e.message).startsWith('timeout: ')?String(e.message):'see phase and last observation'}
  if(h){try{report.lastBoundary=h.events()}catch{/* boot may not have started */}}
}finally{
  try{await browser?.close()}finally{try{await h?.stop()}finally{save();console.log(report.status,report.failure??'',join(out,'summary.json'))}}
}
