// Minimal real Host verification; does not certify T01/T02 or the integrated A09 case.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie,login,sql} from '../fnd004/harness.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {knownPdf} from '../lib002/a07-known-pdf.mjs'

const [candidate,entry,parent='.cache/search001-smoke']=process.argv.slice(2)
mkdirSync(parent,{recursive:true});const out=mkdtempSync(join(parent,'run-'))
const prefix='/knowledge/v1', password=randomUUID(), report={candidate,entry,status:'NOT_RUN',cases:{},screens:[]}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let host, browser, phase='start'
const request=(cookie,method,path,body,headers={})=>fetch(host.base+prefix+path,{method,headers:{cookie,
  ...(method==='POST'?{'x-knowledgeos-request':'1'}:{}),...headers},body,redirect:'error',signal:AbortSignal.timeout(20_000)})
async function data(r,status){assert.equal(r.status,status);return (await r.json()).data}
const search=(cookie,q)=>request(cookie,'POST','/search',JSON.stringify({query:q}),{'content-type':'application/json'}).then(r=>data(r,200))
const upload=(cookie,filename,type,bytes)=>request(cookie,'POST','/imports',bytes,{'content-type':type,
  'idempotency-key':randomUUID(),'x-knowledgeos-filename':filename}).then(r=>data(r,201))
async function screenshot(page,file){const bytes=await page.screenshot({path:join(out,file)});report.screens.push({file,sha256:hash(bytes)})}

try{
  host=await isolate(candidate,entry);report.binding=host.facts
  const {entry:address}=await host.start(['hold3','fail4']), bootstrap=(await entryCookie(address)).cookie
  for(const [op,cookie,name] of [['bootstrap',bootstrap,'setup'],['register','','writer'],['register','','visitor']]){
    const response=await api(host.port,cookie,'POST',prefix+'/auth/'+op,{login_name:name,display_name:name,password})
    assert.equal(response.status,201)
  }
  const owner=await login(host.port,'writer',password),other=await login(host.port,'visitor',password)
  assert(owner.cookie&&other.cookie)
  phase='real parsed PDF';const book=await upload(owner.cookie,'reference.pdf','application/pdf',knownPdf('search'))
  const path='/assets/'+book.id+'/versions/'+book.version_id+'/parse'
  assert.equal((await request(owner.cookie,'POST',path+'/start')).status,202)
  await until(()=>host.events().some(e=>e.event==='held'&&e.page===3),'held real extracted result')
  const held=await search(owner.cookie,'A07 search')
  assert.deepEqual(held.items.map(x=>x.ordinal),[1,2])
  assert.equal((await search(other.cookie,'A07 search')).count,0)
  host.release()
  const completed=await until(async()=>{const p=await data(await request(owner.cookie,'GET',path),200);return p.state==='partial'&&p},'partial publication')
  assert.equal(completed.pages.find(x=>x.page===4).state,'failed')
  assert.deepEqual((await search(owner.cookie,'A07 search')).items.map(x=>x.ordinal),[1,2,3,6])
  report.cases.pdf_publication={status:'PASS',held:[1,2],after:[1,2,3,6],source_sha256:book.sha256}

  phase='browser text search';const body='\u4f53\u9a8c\u6bb5\u843d\uff1a\u8bbf\u95ee\u63a7\u5236\u5217\u8868\uff08ACL\uff09\u3002'
  const doc=await upload(owner.cookie,'search.md','text/markdown',Buffer.from('# Fixture\n\n'+body))
  const {chromium}=await import(pathToFileURL(host.playwright).href)
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']})
  const page=await browser.newPage({viewport:{width:1280,height:920}});report.chrome=browser.version()
  page.setDefaultTimeout(15_000)
  await page.goto(host.base+'/knowledgeos/account');await page.locator('#login_name').fill('writer')
  await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
  await page.goto(host.base+'/knowledgeos/library');await page.locator('#search-submit:enabled').waitFor()
  await page.locator('#search-query').fill('\u5b58\u53d6\u63a7\u5236\u6e05\u5355')
  const response=page.waitForResponse(r=>r.url().endsWith('/search')&&r.request().method()==='POST')
  await page.locator('#search-submit').click()
  const r=await response;assert.equal(r.status(),200)
  const result=(await r.json()).data,expected='\u8bbf\u95ee\u63a7\u5236\u5217\u8868'
  assert.deepEqual(result.items.map(x=>[x.version_id,x.ordinal,x.quote]),[[doc.version_id,2,expected]])
  assert.equal((await search(other.cookie,expected)).count,0)
  assert.equal((await request(other.cookie,'GET','/search/'+result.query_id+'/access')).status,404)
  const hit=page.locator('#search-results a');await hit.waitFor();await screenshot(page,'search-results.png')
  const href=await hit.getAttribute('href');await hit.click()
  const mark=page.locator('#text mark');await mark.waitFor();assert.equal(await mark.textContent(),expected)
  await screenshot(page,'fixed-reader-highlight.png')
  const saved=await until(()=>sql(dbPath(host.data),'SELECT source_hash,ordinal FROM reading_positions WHERE version_id=?',[doc.version_id])[0],'search position save')
  assert.deepEqual([saved.ordinal,saved.source_hash],[2,result.items[0].source_hash]);assert.equal(sql(dbPath(host.data),'PRAGMA user_version')[0].user_version,18)
  const forged=new URL(href,host.base);forged.searchParams.set('match','0:2:'+ '0'.repeat(64))
  await page.goto(forged.href);await page.getByText('引用或来源已变化，与固定版本不匹配。').waitFor()
  assert.equal(await page.locator('#text mark').count(),0)
  report.cases.markdown_locator={status:'PASS',source_sha256:doc.sha256,start:result.items[0].start,end:result.items[0].end,
    query_log_present:sql(dbPath(host.data),'SELECT query_id FROM search_queries WHERE query_id=?',[result.query_id]).length===1}
  report.status='PASS'
}catch(e){report.status='FAIL';report.failure={phase,name:e.name,message:e.message.split('\n')[0].slice(0,180)}}
finally{
  try{await browser?.close()}finally{await host?.stop()}
  report.exit=report.status==='PASS'?0:1
  writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n')
  console.log(report.status,out);process.exitCode=report.exit
}
