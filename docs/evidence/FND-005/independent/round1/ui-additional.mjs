/** Real browser races against real HTTP/SQLite; model adapter remains a fixture. */
import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareRun,accounts,api,sql,dbPath,stopHost } from '../../../../scripts/fnd005/harness.mjs'
const out=resolve('docs/evidence/FND-005/independent/ui-additional');mkdirSync(out,{recursive:true})
const {chromium}=await import(pathToFileURL(resolve('.cache/panel-builder/node_modules/playwright/index.mjs')).href)
const run=prepareRun(out,3144),base='http://127.0.0.1:'+run.port
const report={candidate_id:'FND-005-572a5b58a7b46671',category:'INDEPENDENT_REAL_CHROME_HTTP_SQLITE_WITH_CONTROLLED_TRANSPORT_DELAY',real_gpt:false,status:'PASS',started_at:new Date().toISOString(),checks:[]}
let host,browser,context,page,c,a,b
const check=async(id,expected,fn)=>{const r={id,expected,started_at:new Date().toISOString()};try{r.facts=await fn();r.status='PASS'}catch(e){r.status='FAIL';r.error=e.message;report.status='FAIL'}r.finished_at=new Date().toISOString();report.checks.push(r);console.log(id+' '+r.status)}
const loginUi=async who=>{await page.goto(base+'/knowledgeos/account');await page.locator('#login_name').fill(who);await page.locator('#login_password').fill((who==='alice'?'甲':'乙')+' synthetic password 2026!');await page.locator('#login').click();await page.locator('#profile').waitFor({state:'visible'});await page.goto(base+'/knowledgeos/ai');await page.waitForFunction(()=>document.querySelector('#status').textContent==='就绪')}
const delayRead=async id=>{let release,seen;const released=new Promise(r=>release=r),reached=new Promise(r=>seen=r);await page.route('**/knowledge/v1/objects/'+id,async route=>{const response=await route.fetch();seen();await released;await route.fulfill({response})},{times:1});return {release,reached}}
try{
 c=await accounts(run);host=c.host
 const create=async(label)=>{const r=await api(run.port,c.alice.cookie,'POST','/knowledge/v1/objects',{title:'independent UI '+label,body:'synthetic private '+label});assert.equal(r.status,201);return r.json.data}
 a=await create('target A');b=await create('target B')
 const changed=await api(run.port,c.alice.cookie,'PATCH','/knowledge/v1/objects/'+b.id,{expected_revision:1,body:'synthetic B revision two'});assert.equal(changed.status,200)
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1180,height:1000}});page=await context.newPage();await loginUi('alice')
 await check('U01.late-read-after-account-switch','A response admitted as Alice must not display after the real login cookie becomes Bob',async()=>{
  await page.selectOption('#objects',a.id);const gate=await delayRead(a.id);await page.locator('#read').click();await gate.reached
  const switched=await context.request.post(base+'/knowledge/v1/auth/login',{headers:{'x-knowledgeos-request':'1'},data:{login_name:'bob',password:'乙 synthetic password 2026!'}});assert.equal(switched.status(),200)
  gate.release();await page.waitForFunction(()=>document.querySelector('#who').textContent.includes('bob'))
  assert.equal(await page.locator('#object').textContent(),'');assert.equal(await page.locator('#result').textContent(),'');assert.equal(await page.locator('#objects option').count(),0)
  await page.screenshot({path:join(out,'account-switch-late-read.png'),fullPage:true});return {actual_login_switch_http:200,old_read_suppressed:true,bob_objects:0}
 })
 await loginUi('alice')
 await check('U02.late-read-after-target-switch','An old target response must not overwrite the newly selected target/revision',async()=>{
  await page.selectOption('#objects',a.id);const gate=await delayRead(a.id);await page.locator('#read').click();await gate.reached
  await page.selectOption('#objects',b.id);gate.release();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('重新读取完成'))
  const view={target:await page.locator('#target').inputValue(),revision:Number(await page.locator('#revision').inputValue()),object:JSON.parse(await page.locator('#object').textContent()),selected:await page.locator('#objects').inputValue()}
  const oracle=sql(dbPath(run.dataDir),'SELECT id,revision FROM knowledge_objects WHERE id=?',[b.id])[0]
  report.target_switch_observation={target_id:view.target,selected_id:view.selected,rendered_object_id:view.object.id,rendered_revision:view.revision,target_sql_revision:oracle.revision,same_target:view.target===view.object.id}
  await page.screenshot({path:join(out,'target-switch-delayed-read.png'),fullPage:true})
  assert.equal(view.object.id,view.target,'rendered object belongs to prior selection');assert.equal(view.revision,oracle.revision,'visible revision belongs to prior selection')
  return report.target_switch_observation
 })
}catch(e){report.status='FAIL';report.setup_error=e.message}
finally{await browser?.close();await stopHost(host);report.host_stopped=host?host.child.exitCode!==null||host.child.signalCode!==null:false;report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');if(report.status!=='PASS')process.exitCode=1}
