// Real-document volume probe. A PASS here is not a complete-scene or independent PASS.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,statSync,writeFileSync} from 'node:fs'
import {basename,join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {setTimeout as sleep} from 'node:timers/promises'
import {entryCookie,api,dbPath,sql} from '../fnd004/harness.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'

const [candidate,entry,input,totalArg,holdArg,rangeArg,parent='.cache/lib006-volume']=process.argv.slice(2)
const total=Number(totalArg), holdPage=Number(holdArg), source=resolve(input), prefix='/knowledge/v1'
assert(Number.isSafeInteger(total)&&total>=500&&total<=10_000)
assert(Number.isSafeInteger(holdPage)&&holdPage>2&&holdPage<total)
assert.match(rangeArg,/^\d+-\d+(,\d+-\d+)+$/)
const ranges=rangeArg.split(',').map(s=>s.split('-').map(Number))
assert(ranges.every(([a,b],i)=>a>=1&&a<=b&&b<=total&&(!i||ranges[i-1][1]<a)))
assert(ranges.at(-1)[1]===total&&ranges[0][0]>1,'include the original tail and a shifted initial position')
const root=fileURLToPath(new URL('../../',import.meta.url)), self='scripts/lib006/host-volume.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex'), runner=sha(readFileSync(join(root,self)))
assert.equal(runner,sha(execFileSync('git',['show',`${candidate}:${self}`],{cwd:root})))
const size=statSync(source).size;assert(size>=25_000_000&&size<=64*1024*1024)
const sourceHash=sha(readFileSync(source))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'run-'))
const facts={candidate_sha:candidate,entry_sha256:entry,runner_sha256:runner,status:'NOT_RUN',P02:'NOT_RUN',A06:'NOT_RUN',
  sample:{name:basename(source),sha256:sourceHash,bytes:size,pages:total},hold_page:holdPage,ranges,boots:[],screens:[],timing_ms:{},search:{}}
const password=randomUUID(), marker={'x-knowledgeos-request':'1'}, elapsed=t=>Math.round(performance.now()-t)
let host,browser,ctx,tab,pid,phase='boot'
const ver=d=>`/assets/${d.id}/versions/${d.version_id}`, parse=d=>ver(d)+'/parse'
const get=path=>ctx.request.get(host.base+prefix+path,{maxRedirects:0})
const post=(path,data)=>ctx.request.post(host.base+prefix+path,{headers:marker,data,maxRedirects:0})
async function checked(r,code){assert.equal(r.status(),code,`${new URL(r.url()).pathname}: HTTP ${r.status()}`);return (await r.json()).data}
async function boot(hold){const t=performance.now(),s=await host.start([],{holdPage:hold});pid=s.pid;facts.boots.push({pid,startup_ms:elapsed(t)});return s.entry}
function memory(){if(process.platform==='win32')facts.boots.at(-1).host_peak_working_set_bytes=Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${pid} -ErrorAction Stop).PeakWorkingSet64`],{windowsHide:true}).toString().trim())}
async function login(user){
  await ctx?.close();ctx=await browser.newContext({viewport:{width:1280,height:960},serviceWorkers:'block'});tab=await ctx.newPage();ctx.setDefaultTimeout(30_000)
  await tab.goto(host.base+'/knowledgeos/account');await tab.locator('#login_name').fill(user);await tab.locator('#login_password').fill(password)
  await tab.locator('#login').click();await tab.locator('#profile').waitFor()
}
async function library(doc){
  await tab.goto(host.base+'/knowledgeos/library');await tab.locator('#file:enabled').waitFor()
  if(doc){const box=tab.locator('#parse-version');await box.locator(`option[value="${doc.version_id}"]`).waitFor({state:'attached'});await box.selectOption(doc.version_id)}
}
const response=path=>tab.waitForResponse(r=>r.url()===host.base+prefix+path&&r.request().method()==='POST')
async function upload(label){
  await library();await tab.locator('#file').setInputFiles(source)
  const t=performance.now(),[r]=await Promise.all([response('/imports'),tab.locator('#submit').click()]);assert.equal(r.status(),201)
  await tab.locator('#status').getByText(/导入成功/).waitFor()
  await tab.locator('#receipt').getByText(sourceHash,{exact:true}).waitFor()
  const {items}=await checked(await get('/assets'),200);assert.equal(items.length,1)
  const [d]=items;facts.timing_ms[label+'_upload']=elapsed(t);assert.equal(d.sha256,sourceHash);assert.equal(d.byte_length,size);return d
}
async function click(doc,tail,text,status){
  const [r]=await Promise.all([response(parse(doc)+tail),tab.getByRole('button',{name:text,exact:true}).click()]);return checked(r,status)
}
const snapshot=d=>sql(dbPath(host.data),'SELECT page,state,generation,text,chapter,error FROM pdf_pages WHERE version_id=? ORDER BY page',[d.version_id])
const terminal=d=>until(async()=>{const s=await checked(await get(parse(d)),200);return ['partial','complete','failed'].includes(s.state)&&s},'all targeted pages',240_000)
const stateSummary=rows=>Object.fromEntries(['ready','review','failed','pending'].map(s=>[s,rows.filter(r=>r.state===s).length]))
async function screenshot(file,element=tab){const png=await element.screenshot({path:join(out,file)});facts.screens.push({file,sha256:sha(png)})}
async function original(d){const r=await get(ver(d)+'/original');assert.equal(r.status(),200);assert.equal(sha(await r.body()),sourceHash)}
async function openPage(d,p){
  const t=performance.now(),res=await checked(await get(ver(d)+`/reader?unit=${p}`),200)
  assert.equal(res.ordinal,p);assert.equal(res.version_id,d.version_id)
  return {res,http_ms:elapsed(t)}
}
async function search(subject,d,row,query){
  const t=performance.now(),r=await post('/search',{query}),json=await r.json(),hit=json.data?.items?.some(x=>x.version_id===d.version_id&&x.ordinal===row.page)
  facts.search[subject]={http:r.status(),error:json.error?.code??null,physical_page:row.page,matched:hit===true,elapsed_ms:elapsed(t)}
}

try{
  host=await isolate(candidate,entry);facts.binding=host.facts
  const start=await boot(holdPage),bootstrap=await entryCookie(start)
  assert.equal((await api(host.port,bootstrap.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'setup',display_name:'setup',password})).status,201)
  for(const user of ['whole','split'])assert.equal((await api(host.port,'','POST',prefix+'/auth/register',{login_name:user,display_name:user,password})).status,201)
  const {chromium}=await import(pathToFileURL(host.playwright).href)
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});facts.chrome=browser.version()
  phase='whole upload';await login('whole');const whole=await upload('whole');await library(whole)
  phase='partially readable';const initial=performance.now();await click(whole,'/start','开始解析',202)
  await until(()=>snapshot(whole).some(p=>p.state==='ready'),'first committed readable page',120_000)
  facts.timing_ms.first_ready_from_start=elapsed(initial)
  await until(()=>host.events().some(e=>e.event==='held'&&e.page===holdPage),'hold real next reply',120_000)
  const paused=snapshot(whole);assert.equal(paused.length,total)
  assert(paused.slice(0,holdPage-1).every(p=>p.generation===1));assert(paused.slice(holdPage-1).every(p=>p.state==='pending'&&p.generation===0))
  const probe=paused.slice(0,holdPage-1).reverse().find(p=>p.state==='ready'&&/[A-Za-z]{8,}/.test(p.text))
  assert(probe,'must have searchable real text before cancellation')
  const query=[...probe.text.matchAll(/[A-Za-z]{8,}/g)].map(m=>m[0]).sort((a,b)=>b.length-a.length)[0]
  await tab.locator('#parse-refresh').click();await tab.locator('#parse-summary').getByText(/未处理 [1-9]/).waitFor()
  await screenshot('whole-in-progress.png',tab.locator('#parse-panel'))
  assert.equal((await openPage(whole,probe.page)).res.text,probe.text)
  const read=tab.getByRole('link',{name:`阅读第 ${paused.find(p=>p.state==='ready').page} 页`,exact:true})
  await read.click();await tab.locator('#original img').waitFor();facts.timing_ms.first_browser_preview_from_start=elapsed(initial)
  await search('whole_partial',whole,probe,query);assert(facts.search.whole_partial.matched)
  phase='cancel and restart';await library(whole);await click(whole,'/cancel','取消解析',200);host.release()
  await until(()=>host.events().some(e=>e.event==='released'&&e.page===holdPage),'release the late reply');await sleep(150)
  assert.deepEqual(snapshot(whole),paused);memory();await host.stop();await boot();await login('whole');await library(whole)
  assert.deepEqual(snapshot(whole),paused)
  const resumed=performance.now();await click(whole,'/start','继续解析',202);const wholeStatus=await terminal(whole),wholeRows=snapshot(whole)
  facts.timing_ms.whole_resume_to_terminal=elapsed(resumed);facts.timing_ms.whole_start_to_terminal_including_pause=elapsed(initial)
  facts.whole={state:wholeStatus.state,counts:stateSummary(wholeRows),text_code_units:wholeRows.reduce((n,p)=>n+p.text.length,0),
    failed_pages:wholeRows.filter(p=>p.state==='failed').map(p=>p.page),review_pages:wholeRows.filter(p=>p.state==='review').map(p=>p.page)}
  assert(wholeRows.every(r=>r.generation===1));assert.deepEqual(wholeRows.slice(0,holdPage-1),paused.slice(0,holdPage-1))
  assert.deepEqual(host.events().filter(e=>e.event==='request').map(e=>e.page),wholeRows.slice(holdPage-1).map(r=>r.page))
  await original(whole);await search('whole_terminal',whole,probe,query);memory()

  phase='chapter import';await login('split');assert.equal((await get(ver(whole)+'/reader?unit=2')).status(),404)
  const split=await upload('split');await library(split)
  await tab.locator('#parse-mode').selectOption('chapters');await tab.locator('#parse-ranges').fill(rangeArg)
  const splitStart=performance.now();assert.deepEqual((await click(split,'/chapters','开始解析',202)).chapters,ranges)
  const splitStatus=await terminal(split);facts.timing_ms.split_start_to_terminal=elapsed(splitStart)
  const splitRows=snapshot(split),target=p=>ranges.some(([a,b])=>p>=a&&p<=b)
  facts.split={state:splitStatus.state,counts:stateSummary(splitRows),outside:splitRows.filter(r=>!target(r.page)).length,
    failed_pages:splitRows.filter(p=>p.state==='failed').map(p=>p.page),review_pages:splitRows.filter(p=>p.state==='review').map(p=>p.page)}
  const selected=splitRows.filter(r=>target(r.page))
  assert.deepEqual(selected,wholeRows.filter(r=>target(r.page)))
  assert(splitRows.filter(r=>!target(r.page)).every(r=>r.generation===0&&r.state==='pending'&&!r.text))
  assert.equal(splitStatus.total,total)
  await tab.locator('#parse-refresh').click();await tab.locator('#parse-summary').getByText(new RegExp('未选 '+facts.split.outside+'$')).waitFor()
  await screenshot('chapters-terminal.png',tab.locator('#parse-panel'))
  const first=selected.find(p=>p.state==='ready'||p.state==='review'),link=tab.locator('#parse-chapters').getByRole('link').first()
  assert.match(await link.getAttribute('href'),new RegExp('unit='+first.page+'$'));await link.click()
  await tab.locator('#original img').waitFor();assert.equal(await tab.locator('#number').inputValue(),String(first.page))
  facts.compare=[]
  for(const p of new Set(ranges.flat().concat([Math.floor((ranges[0][0]+ranges[0][1])/2)]))){
    const b=await openPage(split,p);assert.equal(b.res.text,wholeRows[p-1].text)
    facts.compare.push({page:p,text_sha256:sha(b.res.text),state:wholeRows[p-1].state,http_ms:b.http_ms})
  }
  await original(split);memory()
  assert.equal(facts.whole.failed_pages.length,0,'unexpected real extraction failures')
  assert(facts.search.whole_terminal.matched,'completed textbook is not discoverable by the same verified query')
  facts.status='PASS'
}catch(e){facts.status='FAIL';facts.failure={phase,message:(e.stack??String(e)).slice(0,2000)}}
finally{
  try{await browser?.close()}finally{await host?.stop()}
  facts.exit=facts.status==='PASS'?0:1;writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n')
  console.log(facts.status,out,facts.failure?.phase??'');process.exitCode=facts.exit
}
