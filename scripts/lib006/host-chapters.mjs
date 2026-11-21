// Development smoke: a real Host and Chrome over a small synthetic PDF, not P02/A06.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {entryCookie,api,dbPath,sql} from '../fnd004/harness.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {knownPdf,textFor} from '../lib002/a07-known-pdf.mjs'

const [candidate,entry,parent='.cache/lib006-chapters']=process.argv.slice(2), prefix='/knowledge/v1'
const root=fileURLToPath(new URL('../../',import.meta.url)), self='scripts/lib006/host-chapters.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex'), runner=sha(readFileSync(join(root,self)))
assert.equal(runner,sha(execFileSync('git',['show',`${candidate}:${self}`],{cwd:root})))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'run-'))
const facts={candidate_sha:candidate,entry_sha256:entry,runner_sha256:runner,status:'NOT_RUN',P02:'NOT_RUN',A06:'NOT_RUN',screens:[],boots:[]}
const password=randomUUID(), marker={'x-knowledgeos-request':'1'}, bytes=knownPdf('chapters'), chapters=[[2,3],[5,6]]
let host,browser,ctx,tab,phase='boot'
const ver=d=>`/assets/${d.id}/versions/${d.version_id}`
const parse=d=>ver(d)+'/parse'
const get=path=>ctx.request.get(host.base+prefix+path,{maxRedirects:0})
const post=(path,data)=>ctx.request.post(host.base+prefix+path,{headers:marker,data,maxRedirects:0})
async function checked(res,status){assert.equal(res.status(),status,`${res.url()}: ${await res.text()}`);return (await res.json()).data}
async function boot(flags=[]){const s=await host.start(flags);assert(!facts.boots.includes(s.pid));facts.boots.push(s.pid);return s.entry}
async function setupUser(name){const res=await api(host.port,'','POST',prefix+'/auth/register',{login_name:name,display_name:name,password});assert.equal(res.status,201)}
async function login(name){
  const c=await browser.newContext({viewport:{width:1280,height:960},serviceWorkers:'block'}),p=await c.newPage()
  c.setDefaultTimeout(25_000);await p.goto(host.base+'/knowledgeos/account');await p.locator('#login_name').fill(name)
  await p.locator('#login_password').fill(password);await p.locator('#login').click();await p.locator('#profile').waitFor();return [c,p]
}
async function library(doc){
  await tab.goto(host.base+'/knowledgeos/library');await tab.locator('#file:enabled').waitFor()
  if(doc){const box=tab.locator('#parse-version');await box.locator(`option[value="${doc.version_id}"]`).waitFor({state:'attached'});await box.selectOption(doc.version_id)}
}
const response=(path,method)=>tab.waitForResponse(r=>r.url()===host.base+prefix+path&&r.request().method()===method)
async function upload(name){
  await library();await tab.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer:bytes})
  const [r]=await Promise.all([response('/imports','POST'),tab.locator('#submit').click()]);const doc=await checked(r,201)
  assert.equal(doc.sha256,sha(bytes));assert.equal(doc.byte_length,bytes.length);return doc
}
async function click(doc,tail,text,status){
  const [r]=await Promise.all([response(parse(doc)+tail,'POST'),tab.getByRole('button',{name:text,exact:true}).click()]);return checked(r,status)
}
const snapshot=doc=>sql(dbPath(host.data),'SELECT page,state,generation,text FROM pdf_pages WHERE version_id=? ORDER BY page',[doc.version_id])
const notable=rows=>rows.map(r=>[r.page,r.state,r.generation])
async function screenshot(file,element=tab){const png=await element.screenshot({path:join(out,file)});facts.screens.push({file,sha256:sha(png)})}

try{
  host=await isolate(candidate,entry);facts.binding=host.facts
  const start=await boot(['hold3']),bootstrap=await entryCookie(start)
  assert.equal((await api(host.port,bootstrap.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'setup',display_name:'setup',password})).status,201)
  for(const user of ['writer','outsider'])await setupUser(user)
  const {chromium}=await import(pathToFileURL(host.playwright).href)
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});facts.chrome=browser.version()
  ;[ctx,tab]=await login('writer')
  phase='chapter selection and permissions'
  const split=await upload('split-fixture.pdf');await library(split)
  const raw=tab.locator('#parse-ranges')
  await tab.locator('#parse-mode').selectOption('chapters');await raw.fill('2-3, 3-5');await tab.locator('#parse-action').click()
  await tab.getByText('页段须按原书顺序排列，且不能重叠。').waitFor()
  assert.equal((await checked(await get(parse(split)),200)).state,'idle')
  const [other]=await login('outsider');try{
    const denied=await other.request.post(host.base+prefix+parse(split)+'/chapters',{headers:marker,data:chapters});assert.equal(denied.status(),404)
    const noRead=await other.request.get(host.base+prefix+ver(split)+'/reader?unit=2');assert.equal(noRead.status(),404)
  }finally{await other.close()}
  await screenshot('chapter-selection.png',tab.locator('#parse-panel'))
  await raw.fill('2-3, 5-6')
  assert.deepEqual((await click(split,'/chapters','开始解析',202)).chapters,chapters)
  await until(()=>host.events().find(e=>e.event==='held'&&e.page===3),'selected extraction held after page 2')
  assert.deepEqual(host.events().filter(e=>e.event==='request').map(e=>e.page),[2,3])
  const held=await checked(await get(parse(split)),200),ready=held.pages[1]
  assert.deepEqual([ready.page,ready.selected,ready.state],[2,1,'ready']);assert.equal(held.pages[0].selected,0)
  assert.equal((await checked(await get(ver(split)+'/reader?unit=1'),200)).text,'')
  await tab.locator('#parse-refresh').click();const first=tab.locator('#parse-chapters').getByRole('link',{name:/分段 1/});await first.waitFor()
  assert.match(await first.getAttribute('href'),/unit=2$/)
  await screenshot('partial-chapters.png',tab.locator('#parse-panel'))
  await first.click();await tab.locator('#original img').waitFor();assert.equal(await tab.locator('#number').inputValue(),'2')
  const result=await checked(await post('/search',{query:textFor('chapters',2)}),200)
  assert.deepEqual(result.items.map(x=>[x.version_id,x.ordinal]),[[split.version_id,2]])

  phase='cancel and restart'
  await library(split);await click(split,'/cancel','取消解析',200)
  host.release();await until(()=>host.events().some(e=>e.event==='released'&&e.page===3),'late real result released')
  const stopped=snapshot(split);assert.equal(stopped[2].generation,0)
  await host.stop();await boot()
  await ctx.close();[ctx,tab]=await login('writer');await library(split)
  assert.deepEqual(snapshot(split),stopped)
  assert.deepEqual((await click(split,'/start','继续解析',202)).chapters,chapters)
  const final=await until(async()=>{const s=await checked(await get(parse(split)),200);return s.state==='partial'&&s},'chapter publication after restart')
  const subset=snapshot(split)
  assert.deepEqual(notable(subset),[[1,'pending',0],[2,'ready',1],[3,'ready',1],[4,'pending',0],[5,'review',1],[6,'ready',1]])
  assert.deepEqual(final.pages.map(p=>p.selected),[0,1,1,0,1,1]);assert.deepEqual(host.events().filter(e=>e.event==='request').map(e=>e.page),[3,5,6])
  await tab.locator('#parse-refresh').click();await tab.locator('#parse-summary').getByText(/未选 2/).waitFor();await screenshot('resumed-chapters.png',tab.locator('#parse-panel'))
  phase='whole comparison'
  const whole=await upload('whole-fixture.pdf');await library(whole);await click(whole,'/start','开始解析',202)
  await until(async()=>{const s=await checked(await get(parse(whole)),200);return s.state==='partial'&&s},'whole publication')
  assert.deepEqual(subset.filter(p=>p.generation===1),snapshot(whole).filter(p=>[2,3,5,6].includes(p.page)))
  for(const doc of [split,whole]){
    const r=await get(ver(doc)+'/original');assert.equal(r.status(),200);assert.equal(sha(await r.body()),sha(bytes))
  }
  facts.observed={fixture_sha256:sha(bytes),fixture_size:bytes.length,physical_pages:6,chapters,split:split.version_id,whole:whole.version_id,
    selected_rows:notable(subset),page_two_read_and_search:true,same_original_and_selected_output:true,late_publish_refused:true}
  facts.status='PASS'
}catch(e){facts.status='FAIL';facts.failure={phase,message:(e.stack??String(e)).slice(0,2300)}}
finally{
  try{await browser?.close()}finally{await host?.stop()}
  facts.exit=facts.status==='PASS'?0:1;writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n')
  console.log(facts.status,out,facts.failure?.phase??'');process.exitCode=facts.exit
}
