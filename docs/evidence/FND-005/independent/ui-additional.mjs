/** Independent real-browser races. No real GPT. Preserve round1's original failure. */
import assert from 'node:assert/strict'
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { prepareRun,accounts,api,sql,dbPath,stopHost } from '../../../../scripts/fnd005/harness.mjs'
const out=resolve('docs/evidence/FND-005/independent/ui-additional');mkdirSync(out,{recursive:true})
const manifest=JSON.parse(readFileSync('docs/evidence/FND-005/independent/candidate-original.json','utf8'))
assert.equal(manifest.candidate_id,'FND-005-d0ec209b8161e14e')
const hash=x=>createHash('sha256').update(x).digest('hex')
assert.equal(hash(readFileSync('packages/knowledgeos-panel/lib/index.js')),manifest.candidate_files['packages/knowledgeos-panel/lib/index.js'])
const {chromium}=await import(pathToFileURL(resolve('.cache/panel-builder/node_modules/playwright/index.mjs')).href)
const run=prepareRun(out,3144),base='http://127.0.0.1:'+run.port
const report={candidate_id:manifest.candidate_id,category:'INDEPENDENT_REAL_CHROME_HTTP_SQLITE_WITH_CONTROLLED_TRANSPORT_DELAY',real_gpt:false,status:'PASS',started_at:new Date().toISOString(),checks:[]}
let host,browser,context,page,c,a,b
const check=async(id,expected,fn)=>{const r={id,expected,started_at:new Date().toISOString()};try{r.facts=await fn();r.status='PASS'}catch(e){r.status='FAIL';r.error=e.message;report.status='FAIL'}r.finished_at=new Date().toISOString();report.checks.push(r);console.log(id+' '+r.status)}
const ready=async()=>{await page.goto(base+'/knowledgeos/ai');await page.waitForFunction(()=>document.querySelector('#status').textContent==='就绪')}
const loginUi=async who=>{await page.goto(base+'/knowledgeos/account');await page.locator('#login_name').fill(who);await page.locator('#login_password').fill((who==='alice'?'甲':'乙')+' synthetic password 2026!');await page.locator('#login').click();await page.locator('#profile').waitFor({state:'visible'});await ready()}
const delay=async path=>{let release,seen,fulfilled;const released=new Promise(r=>release=r),reached=new Promise(r=>seen=r),done=new Promise(r=>fulfilled=r);await page.route('**'+path,async route=>{const response=await route.fetch();seen();await released;await route.fulfill({response});fulfilled()},{times:1});return {release,reached,done,path}}
const settle=async gate=>{const received=page.waitForResponse(r=>new URL(r.url()).pathname===gate.path);gate.release();const response=await received;await response.finished();await gate.done;await page.waitForTimeout(200)}
const emptyDisplays=async()=>{for(const id of ['object','tool','result'])assert.equal(await page.locator('#'+id).textContent(),'');assert(await page.locator('#execute').isDisabled())}
try{
 c=await accounts(run);host=c.host
 report.host={port:run.port,pid:host.child.pid,isolated_home:true,isolated_sqlite:true}
 report.loaded_bundle_sha256=hash(readFileSync(join(run.home,'profiles',run.profile,'node_modules/knowledgeos-panel/lib/index.js')))
 assert.equal(report.loaded_bundle_sha256,manifest.candidate_files['packages/knowledgeos-panel/lib/index.js'])
 const create=async label=>{const r=await api(run.port,c.alice.cookie,'POST','/knowledge/v1/objects',{title:'independent UI '+label,body:'synthetic private '+label});assert.equal(r.status,201);return r.json.data}
 a=await create('target A');b=await create('target B')
 assert.equal((await api(run.port,c.alice.cookie,'PATCH','/knowledge/v1/objects/'+b.id,{expected_revision:1,body:'synthetic B revision two'})).status,200)
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1180,height:1000}});page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await loginUi('alice')
 await check('U01.late-read-after-account-switch','A response admitted as Alice must not display after the real login cookie becomes Bob',async()=>{
  await page.selectOption('#objects',a.id);const gate=await delay('/knowledge/v1/objects/'+a.id);await page.locator('#read').click();await gate.reached
  const switched=await context.request.post(base+'/knowledge/v1/auth/login',{headers:{'x-knowledgeos-request':'1'},data:{login_name:'bob',password:'乙 synthetic password 2026!'}});assert.equal(switched.status(),200)
  await settle(gate);await page.waitForFunction(()=>document.querySelector('#who').textContent.includes('bob'));await emptyDisplays();assert.equal(await page.locator('#objects option').count(),0)
  await page.screenshot({path:join(out,'account-switch-late-read.png'),fullPage:true});return {actual_login_switch_http:200,old_read_suppressed:true,bob_objects:0}
 })
 await loginUi('alice')
 await check('U02.late-read-after-target-switch','After switching to B, releasing old A must never render A or overwrite B ID/revision; explicitly reread B and compare SQL',async()=>{
  const oracle=sql(dbPath(run.dataDir),'SELECT id,title,body,revision,created_at,updated_at FROM knowledge_objects WHERE id=?',[b.id])[0]
  await page.selectOption('#objects',a.id);const gate=await delay('/knowledge/v1/objects/'+a.id);await page.locator('#read').click();await gate.reached
  await page.selectOption('#objects',b.id);await emptyDisplays();assert.equal(await page.locator('#target').inputValue(),b.id);assert.equal(Number(await page.locator('#revision').inputValue()),oracle.revision)
  const switchedStatus=await page.locator('#status').textContent()
  await page.evaluate(({id,title,body})=>{window.__oldTargetRendered=false;window.__oldTargetObserver=new MutationObserver(()=>{const text=document.querySelector('#object').textContent;if([id,title,body].some(s=>text.includes(s)))window.__oldTargetRendered=true});window.__oldTargetObserver.observe(document.querySelector('#object'),{childList:true,subtree:true,characterData:true})},{id:a.id,title:a.title,body:a.body})
  await settle(gate)
  const seenOld=await page.evaluate(()=>{window.__oldTargetObserver.disconnect();return window.__oldTargetRendered})
  assert.equal(seenOld,false,'A was rendered after B became the selected target');await emptyDisplays()
  assert.equal(await page.locator('#objects').inputValue(),b.id);assert.equal(await page.locator('#target').inputValue(),b.id);assert.equal(Number(await page.locator('#revision').inputValue()),oracle.revision);assert.equal(await page.locator('#status').textContent(),switchedStatus)
  await page.screenshot({path:join(out,'target-switch-old-read-suppressed.png'),fullPage:true})
  await page.locator('#read').click();await page.waitForFunction(({id,revision})=>{try{const o=JSON.parse(document.querySelector('#object').textContent);return o.id===id&&o.revision===revision&&document.querySelector('#status').textContent.includes('重新读取完成')}catch{return false}},{id:b.id,revision:oracle.revision})
  const rendered=JSON.parse(await page.locator('#object').textContent());for(const [k,v] of Object.entries(oracle))assert.equal(rendered[k],v,'rendered B differs from SQL field '+k)
  assert.equal(await page.locator('#target').inputValue(),b.id);assert.equal(Number(await page.locator('#revision').inputValue()),oracle.revision)
  assert.deepEqual(sql(dbPath(run.dataDir),'SELECT id,title,body,revision,created_at,updated_at FROM knowledge_objects WHERE id=?',[b.id])[0],oracle)
  await page.screenshot({path:join(out,'target-b-explicit-reread-sql.png'),fullPage:true})
  return {old_target_id:a.id,new_target_id:b.id,old_revision:1,new_sql_revision:oracle.revision,old_response_rendered:false,display_after_late_response:'empty pending explicit read',target_revision_preserved:true,explicit_b_reread_sql_agrees:true,sql_projection_sha256:hash(JSON.stringify(oracle))}
 })
 await check('U03.each-draft-field-invalidates-prepared','Changing target, revision, key, or instruction invalidates the prepared operation and clears protected displays',async()=>{
  const facts=[]
  for(const [field,value] of [['target',a.id],['revision','1'],['key','independent-new-ui-key'],['instruction','a changed synthetic draft']]){
   await ready();await page.selectOption('#objects',b.id);await page.locator('#instruction').fill('读取这个对象');await page.locator('#prepare').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已准备'));assert(await page.locator('#execute').isEnabled())
   await page.locator('#'+field).fill(value);await emptyDisplays();assert(await page.locator('#cancel').isDisabled());assert(await page.locator('#prepare').isEnabled());assert.equal(await page.locator('#'+field).inputValue(),value);facts.push({field,execute_disabled:true,old_displays_cleared:true})
  }
  return facts
 })
 await check('U04.late-prepare-after-draft-edit','An actual prepare response delayed across a draft edit cannot restore the old prepared action or erase the new draft',async()=>{
  await ready();await page.selectOption('#objects',b.id);await page.locator('#instruction').fill('读取这个对象');const gate=await delay('/knowledge/v1/ai/prepare');await page.locator('#prepare').click();await gate.reached
  const draft='preserve this newly edited synthetic draft';await page.locator('#instruction').fill(draft);const invalidatedStatus=await page.locator('#status').textContent();await emptyDisplays();await settle(gate);await emptyDisplays();assert.equal(await page.locator('#instruction').inputValue(),draft);assert.equal(await page.locator('#status').textContent(),invalidatedStatus);assert(await page.locator('#prepare').isEnabled())
  return {actual_prepare_response_delayed:true,old_prepared_suppressed:true,new_draft_preserved:true}
 })
 report.page_errors=pageErrors;assert.deepEqual(pageErrors,[])
}catch(e){report.status='FAIL';report.setup_error=e.message}
finally{await browser?.close();await stopHost(host);report.host_stopped=host?host.child.exitCode!==null||host.child.signalCode!==null:false;report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');if(report.status!=='PASS')process.exitCode=1}
