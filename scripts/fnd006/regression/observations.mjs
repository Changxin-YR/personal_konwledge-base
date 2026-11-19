// Copied into an isolated mirror beside the pinned FND-005 harness by run.mjs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { prepareRun, accounts, api, entryCookie, dbPath, databaseFacts, stopHost } from './harness.mjs'

const [out, version] = process.argv.slice(2)
mkdirSync(out, { recursive:true })
const checks=[]
async function check(id, fn) {
  const facts={}; let host
  try { await fn(facts, h=>host=h); checks.push({id,status:'PASS',facts}) }
  catch(e) { checks.push({id,status:'FAIL',error:e.message,facts}); process.exitCode=1 }
  finally { await stopHost(host) }
}
await check('status-record-restart',async (f,track)=>{
  const run=prepareRun(out,3261,{fixture:false}); let host=await run.start(); track(host)
  let owner=(await entryCookie(host.entryUrl)).cookie
  const status=async name=>{const r=await api(run.port,owner,'GET','/knowledgeos/status'); assert.equal(r.status,200);writeFileSync(join(out,name+'.json'),JSON.stringify(r.json));return r.json}
  const contract=(mode,a,b)=>{const args=['scripts/fnd001/status-contract.mjs','--mode',mode,join(out,a+'.json'),join(out,b+'.json')];const r=spawnSync(process.execPath,args,{encoding:'utf8'});(f.contracts??=[]).push({command:['node',...args],exit:r.status});assert.equal(r.status,0,r.stderr)}
  const a=await status('first');await new Promise(r=>setTimeout(r,25));await status('second');contract('same-instance','first','second')
  const content='回归 006 • persistent',key=randomUUID(); const r=await api(run.port,owner,'POST','/knowledgeos/foundation/records',{content},{'idempotency-key':key});assert.equal(r.status,201)
  const id=r.json.data.id;const facts=()=>{const d=databaseFacts(dbPath(run.dataDir));return {user_version:d.userVersion,application_id:d.applicationId,ledger:d.ledger}};const before=facts()
  f.before={pid:host.child.pid,instance:a.host_instance_id,id,content,...before};assert.equal(before.user_version,Number(version));assert.deepEqual(before.ledger.map(x=>x.version),Array.from({length:Number(version)},(_,i)=>i+1))
  await stopHost(host);assert(host.child.exitCode!==null||host.child.signalCode!==null);host=await run.start();track(host);owner=(await entryCookie(host.entryUrl)).cookie;const b=await status('restart');contract('restart','second','restart')
  const read=await api(run.port,owner,'GET','/knowledgeos/foundation/records/'+id);const after=facts();f.after={pid:host.child.pid,instance:b.host_instance_id,http:read.status,id:read.json?.data?.id,content:read.json?.data?.content,...after};assert.notEqual(host.child.pid,f.before.pid);assert.equal(read.status,200);assert.equal(f.after.id,id);assert.equal(f.after.content,content);assert.deepEqual(after,before)
})
for(const [id,prices] of [['unpriced',{}],['over-budget',{inputUsdPerMillion:1000,outputUsdPerMillion:1000}]])await check(id,async(f,track)=>{
  const run=prepareRun(out,3262,{ai:{provider:'fnd005-fixture',model:Number(version)===6?'deepseek-controlled-tool-model':'controlled-tool-model',budgetUsd:.001,maxCalls:1,...prices}})
  const c=await accounts(run);track(c.host); const call=(method,path,body)=>api(run.port,c.alice.cookie,method,'/knowledge/v1/'+path,body)
  const obj=await call('POST','objects',{title:'Budget fixture',body:'no model service'});assert.equal(obj.status,201)
  const snapshot=async()=>{const s=await call('GET','ai/status');assert.equal(s.status,200);return s.json.data};f.before=await snapshot();f.responses=[]
  for(let i=0;i<2;i++) {const r=await call('POST','ai/prepare',{request_id:randomUUID(),instruction:'读取对象',object_id:obj.json.data.id,expected_revision:1,idempotency_key:randomUUID()});const p=r.json?.data;const item={http:r.status,code:r.json?.code,usage:p?.usage};f.responses.push(item);f.after=await snapshot();assert.equal(r.status,200,r.json?.code);assert.deepEqual(p.usage,{inputTokens:100,outputTokens:40,totalTokens:140});const e=await call('POST','ai/execute',{prepared_id:p.prepared_id});item.execute=e.status;assert.equal(e.status,200);assert.equal(e.json.data.result.object.body,'no model service')}
  assert.equal(f.after.attempts,2)
  // Assert a positive warning and explicit unknown cost, never mere absence of a rejection.
  assert.equal(f.after.reported_input_tokens,200);assert.equal(f.after.reported_output_tokens,80)
  if(id==='over-budget'){assert.equal(f.after.budget_warning,true);assert.equal(f.after.known_estimated_usd,.28);assert.equal(f.after.unknown_cost_calls,0)}
  else {assert.equal(f.after.unknown_cost_calls,2);assert.equal(f.after.known_estimated_usd,0)}
})
writeFileSync(join(out,'summary.json'),JSON.stringify({status:process.exitCode?'FAIL':'PASS',checks},null,2)+'\n')
