/** Explicit opt-in. Product profile stays untouched; one temporary DB, two UI prepares. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_ROOT, entryCookie, UPSTREAM_COMMIT } from '../fnd003/harness.mjs'
import { api, dbPath, sql } from '../fnd004/harness.mjs'

const model='deepseek-v4.1-flash-1017/hs14', provider='api', port=3167, base=`http://127.0.0.1:${port}`
assert.equal(process.argv[2], '--live-hs14'); assert.match(process.argv[3]??'',/^[0-9a-f]{40}$/)
const home=join(process.env.LOCALAPPDATA,'KnowledgeOS/FND005/dsh'), profile='knowledgeos'
const yaml=createRequire(import.meta.url)('../../.cache/build/dsh-39163dd/node_modules/.pnpm/yaml@2.9.0/node_modules/yaml')
const rows=yaml.parse(readFileSync(join(home,'profiles',profile,'cordis.patch.yml'),'utf8'))
const route=rows.find(r=>r.id==='llm-pi-ai')?.config?.providers?.api
assert.equal(new URL(route.baseURL).origin,'https://tokease.cn');assert(route.apiKeyEnv && !route.apiKey)
const {chromium}=await import(pathToFileURL(resolve('.cache/panel-builder/node_modules/playwright/index.mjs')).href)
const root=mkdtempSync(join(process.env.LOCALAPPDATA,'KnowledgeOS/FND005/test-')),dataDir=join(root,'data');mkdirSync(dataDir)
const parent=resolve('docs/evidence/FND-005');const out=mkdtempSync(join(parent,'live-hs14-'))
const digest=s=>createHash('sha256').update(s).digest('hex')
const ai={provider,model,maxCalls:2,maxTokens:512,timeoutMs:60000,budgetUsd:0.10,inputUsdPerMillion:5,outputUsdPerMillion:12}
const evidence={category:'REAL_DEEPSEEK_UI_HTTP_SQLITE',is_gpt:false,provider,model,started_at:new Date().toISOString(),product_commit:process.argv[3],plugin_sha256:digest(readFileSync('packages/knowledgeos-panel/lib/index.js')),upstream:UPSTREAM_COMMIT,limits:ai,prepare_requests:0,successful_model_selections:0,operations:[]}
let host,browser,phase='price_preflight'
try {
  const meta=async path=>{const res=await fetch('https://tokease.cn/api/'+path,{signal:AbortSignal.timeout(12000)});assert(res.ok);return res.json()}
  const pricing=await meta('pricing'), status=await meta('status');const channels=pricing.data.filter(m=>m.model_name===model.split('/')[0] && m.enable_groups.includes('default')).flatMap(m=>m.channel_list).filter(c=>c.route_slug==='hs14');assert.equal(channels.length,1)
  const c=channels[0], unit=status.data.quota_per_unit, group=pricing.group_ratio.default;assert(unit>0 && group>0)
  const tariffs=[c,...(c.time_pricing?[c.time_pricing.regular_pricing,...c.time_pricing.schedules.map(s=>s.pricing)]:[])]
  for(const t of tariffs){const input=1e6*t.model_ratio*group/unit;assert(t.quota_type===0 && input>0 && input<=ai.inputUsdPerMillion && t.completion_ratio>0 && input*t.completion_ratio<=ai.outputUsdPerMillion)}
  evidence.price_basis={source:'tokease.cn/api/pricing and /api/status',route_slug:c.route_slug,quota_per_unit:unit,default_group_ratio:group,model_ratio:c.model_ratio,completion_ratio:c.completion_ratio,conservative_reservation_not_actual_invoice:true}
  phase='host_start';const overlay=join(root,'overlay.yml');const {maxTokens,...config}=ai
  writeFileSync(overlay,yaml.stringify([{id:'knowledgeos-host',config:{dataDir,ai:config}},{id:'llm-pi-ai',config:{providers:{api:{api:route.api,baseURL:route.baseURL,apiKeyEnv:route.apiKeyEnv,models:[{id:model}],retryPolicy:{mode:'normal',maxRetries:0}}}}}]))
  host=spawn(process.execPath,['--import','tsx/esm','apps/cli/src/bin.ts','--profile',profile,'--patch',overlay,'--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:DSH_ROOT,env:{...process.env,DSH_HOME:home,DSH_CLIENT_COMMIT_HASH:UPSTREAM_COMMIT},windowsHide:true,stdio:['ignore','pipe','pipe']})
  const entry=await new Promise((ok,no)=>{let buf='';const timer=setTimeout(()=>no(Error('startup timeout')),90000);const onData=b=>{buf=(buf+b).slice(-12000);const m=/dsh web:\s*(http:\/\/[^\s]+)\s/.exec(buf);if(m){clearTimeout(timer);ok(m[1])}};host.stdout.on('data',onData);host.stderr.on('data',onData);host.once('exit',()=>{clearTimeout(timer);no(Error('early exit'))})});assert.equal(new URL(entry).origin,base)
  phase='fresh_database_bootstrap';assert(sql(dbPath(dataDir),'SELECT COUNT(*) AS n FROM users')[0].n===0)
  const owner=(await entryCookie(entry)).cookie;assert.equal((await api(port,owner,'POST','/knowledge/v1/auth/bootstrap',{login_name:'testadmin',display_name:'Test admin',password:randomUUID()})).status,201)
  const name='hs14test',password=randomUUID();assert.equal((await api(port,'','POST','/knowledge/v1/auth/register',{login_name:name,display_name:'HS14 synthetic',password})).status,201)
  phase='business_ui_login';browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1180,height:1000}})
  await page.goto(base+'/knowledgeos/account');await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor({state:'visible'})
  const post=(path,data)=>page.request.post(base+path,{data,headers:{'x-knowledgeos-request':'1'}})
  const baseline='HS14 synthetic baseline',updated='HS14 synthetic committed update';const obj=await post('/knowledge/v1/objects',{title:'HS14 synthetic object',body:baseline});assert.equal(obj.status(),201);const id=(await obj.json()).data.id
  phase='ai_binding';await page.goto(base+'/knowledgeos/ai');await page.waitForFunction(()=>document.querySelector('#status').textContent==='就绪');assert((await page.locator('#model').innerText()).includes(model));assert.equal(await page.locator('#target').inputValue(),id)
  for(const [tool,instruction,body,revision] of [['knowledgeos_read_object','Read this object.',baseline,1],['knowledgeos_update_object',`Set only the body to exactly: ${updated}`,updated,2]]){
    phase=tool+'_prepare';await page.locator('#key').fill(randomUUID());await page.locator('#instruction').fill(instruction)
    const response=page.waitForResponse(base+'/knowledge/v1/ai/prepare',{timeout:70000});evidence.prepare_requests++;await page.locator('#prepare').click();const prepared=await response,p=await prepared.json();evidence.last_prepare_http=prepared.status();if(prepared.status()!==200){evidence.failure_code=/^[A-Z_]{1,64}$/.test(p.code)?p.code:'PREPARE_FAILED';throw Error('prepare failed')}
    assert.equal(p.data.provider,provider);assert.equal(p.data.model,model);evidence.successful_model_selections++;assert.equal(p.data.tool,tool);assert.equal(p.data.arguments.object_id,id);if(revision===2){assert.equal(p.data.arguments.expected_revision,1);assert.equal(p.data.arguments.body,updated);assert.equal(p.data.arguments.title,undefined)}
    phase=tool+'_execute';await page.waitForFunction(()=>!document.querySelector('#execute').disabled);assert((await page.locator('#tool').innerText()).includes(tool));const executed=page.waitForResponse(base+'/knowledge/v1/ai/execute');await page.locator('#execute').click();const e=await executed;assert.equal(e.status(),200);assert.equal((await e.json()).data.result.code,revision===1?'READ':'UPDATED');await page.waitForFunction(s=>document.querySelector('#result').textContent.includes(s),body)
    await page.locator('#read').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('重新读取完成'));assert((await page.locator('#object').innerText()).includes(body));const row=sql(dbPath(dataDir),'SELECT body,revision FROM knowledge_objects WHERE id=?',[id])[0];assert.equal(row.body,body);assert.equal(row.revision,revision);const receipts=sql(dbPath(dataDir),'SELECT COUNT(*) AS n FROM ai_tool_mutations WHERE object_id=?',[id])[0].n;assert.equal(receipts,revision-1)
    await page.screenshot({path:join(out,`revision-${revision}.png`)});evidence.operations.push({tool,object_id:id,revision,body_sha256:digest(body),receipts,ui_reread_and_sql_agree:true})
  }
  evidence.status='PASS'
} catch(e){evidence.status='FAIL';evidence.phase=phase;evidence.error_type=e.name; console.error('Stage:',phase,'type:',e.name,'line:',String(e.stack).split('\n').find(s=>s.includes('hs14-live-check.mjs:'))?.match(/mjs:(\d+)/)?.[1]);process.exitCode=1}
finally{try{await browser?.close()}finally{if(host && host.exitCode===null && !host.signalCode){const exited=once(host,'exit');host.kill();await exited}evidence.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({out,...evidence}))}}
