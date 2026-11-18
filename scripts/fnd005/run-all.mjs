#!/usr/bin/env node
/** Real HTTP/native DSH/SQLite; model responses are CONTROLLED_FIXTURE, never GPT. */
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { prepareRun, accounts, api, login, sql, dbPath, databaseFacts, stopHost, entryCookie } from './harness.mjs'
const args=process.argv.slice(2), get=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1]}
const out=resolve(get('out','docs/evidence/FND-005/runs/integration')), run=prepareRun(out,Number(get('port',3131)))
const report={category:'CONTROLLED_MODEL_FIXTURE_WITH_REAL_HTTP_DSH_NATIVE_SQLITE',real_gpt:false,started_at:new Date().toISOString(),status:'PASS',checks:[]}
const check=async(id,fn)=>{const start=new Date().toISOString();try{const facts=await fn();report.checks.push({id,status:'PASS',started_at:start,finished_at:new Date().toISOString(),facts});console.log(id+' PASS')}catch(e){report.status='FAIL';report.checks.push({id,status:'FAIL',started_at:start,error:e.message});console.log(id+' FAIL '+e.message);throw e}}
let host,c,alice,bob,owner,object,original,project,projectObject,readGrant,editGrant
const call=(cookie,method,path,body)=>api(run.port,cookie,method,path,body)
const post=(cookie,path,body)=>call(cookie,'POST',path,body)
const getObject=(cookie,id)=>call(cookie,'GET','/knowledge/v1/objects/'+id)
const create=async(cookie,title,extra={})=>{const r=await post(cookie,'/knowledge/v1/objects',{title,body:'synthetic baseline',...extra});assert.equal(r.status,201);return r.json.data}
const prepare=async(cookie,id,rev,instruction='读取这个对象',key=randomUUID(),requestId=randomUUID())=>post(cookie,'/knowledge/v1/ai/prepare',{request_id:requestId,object_id:id,expected_revision:rev,idempotency_key:key,instruction})
const prepared=async(...a)=>{const p=await prepare(...a);assert.equal(p.status,200,JSON.stringify(p.json));return p.json.data}
const execute=(cookie,p)=>post(cookie,'/knowledge/v1/ai/execute',{prepared_id:p.prepared_id})
const mutate=async(cookie,id,rev,body,key)=>execute(cookie,await prepared(cookie,id,rev,'修改正文为：'+body,key))
const row=id=>sql(dbPath(run.dataDir),'SELECT id,title,body,revision,updated_at FROM knowledge_objects WHERE id=?',[id])[0]
const receiptCount=key=>Number(sql(dbPath(run.dataDir),'SELECT count(*) n FROM ai_tool_mutations WHERE idempotency_key=?',[key])[0].n)
const denied=(r,status=404,code='NOT_FOUND')=>{assert.equal(r.status,status,JSON.stringify(r.json));assert.equal(r.json.code,code);assert(!('data' in r.json));return {http:r.status,code:r.json.code}}
const payload=o=>({id:o.id,title:o.title,body:o.body,revision:o.revision,updated_at:o.updated_at??o.updatedAt})
const grant=async(action)=>{const r=await post(alice,'/knowledge/v1/grants',{object_id:projectObject.id,subject_type:'user',subject_id:c.bob.user.id,action});assert.equal(r.status,201,JSON.stringify(r.json));return r.json.data}
try{
 c=await accounts(run);host=c.host;alice=c.alice.cookie;bob=c.bob.cookie;owner=c.ownerCookie
 await check('T03.native-unbound-execution-denied',()=>{const probe=JSON.parse(readFileSync(join(run.root,'unbound-probe.json'),'utf8'));assert.equal(probe.status,'PASS');return probe})
 await check('T09.identity-owner-separation',async()=>{
  assert.equal((await call('','GET','/knowledge/v1/me')).status,401)
  assert([401,403].includes((await call(alice,'GET','/knowledgeos/status')).status))
  denied(await call(owner,'GET','/knowledge/v1/ai/status'),401,'AUTH_REQUIRED')
  const status=await call(owner,'GET','/knowledgeos/status');assert.equal(status.status,200)
  assert.equal((await call(alice,'GET','/knowledge/v1/me')).status,200)
  return {real_login:true,business_user_is_not_owner:true,owner_is_not_business_user:true,status_http:status.status}
 })
 object=await create(alice,'FND005 synthetic object')
 await check('T01.fixture-read-native-tool',async()=>{
  const p=await prepared(alice,object.id,1),r=await execute(alice,p);assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(p.tool,'knowledgeos_read_object');assert.deepEqual(payload(r.json.data.result.object),payload((await getObject(alice,object.id)).json.data))
  return {provider:p.provider,model:p.model,tool:p.tool,object_id:object.id,revision:r.json.data.result.object.revision,http:r.status}
 })
 await check('T02.fixture-write-reread-sql',async()=>{
  const r=await mutate(alice,object.id,1,'synthetic first update','original-key');assert.equal(r.status,200,JSON.stringify(r.json));original=r.json.data.result.object
  assert.equal(original.revision,2);assert.equal(row(object.id).body,original.body);assert.deepEqual(payload((await getObject(alice,object.id)).json.data),payload(original));assert.equal(receiptCount('original-key'),1)
  return {object_id:object.id,tool:r.json.data.tool,revision_before:1,revision_after:2,body_sha256:createHash('sha256').update(original.body).digest('hex'),http_sql_get_agree:true,receipts:1}
 })
 await check('T05.exact-replay-conflicts-concurrency',async()=>{
  const r=await mutate(alice,object.id,1,'synthetic first update','original-key');assert.equal(r.status,200);assert.equal(r.json.data.result.code,'REPLAYED');assert.deepEqual(r.json.data.result.object,original)
  assert.equal((await mutate(alice,object.id,2,'synthetic second update','second-key')).status,200)
  const replay=await mutate(alice,object.id,1,'synthetic first update','original-key');assert.deepEqual(replay.json.data.result.object,original);assert.equal(row(object.id).revision,3)
  denied(await mutate(alice,object.id,1,'different patch','original-key'),409,'IDEMPOTENCY_CONFLICT')
  const other=await create(alice,'other target');denied(await mutate(alice,other.id,1,'synthetic first update','original-key'),409,'IDEMPOTENCY_CONFLICT')
  const a=await prepared(alice,other.id,1,'修改正文为：concurrent','concurrent-key'),b=await prepared(alice,other.id,1,'修改正文为：concurrent','concurrent-key')
  const results=await Promise.all([execute(alice,a),execute(alice,b)]);assert(results.every(r=>r.status===200));assert.deepEqual(results[0].json.data.result.object,results[1].json.data.result.object);assert.equal(row(other.id).revision,2);assert.equal(receiptCount('concurrent-key'),1)
  return {exact_original_result_after_later_edit:true,original_receipts:receiptCount('original-key'),different_parameters:409,different_object:409,parallel_http:results.map(r=>r.status),parallel_revision:2,parallel_receipts:1}
 })
 await check('T06.stale-revision',async()=>{const before=row(object.id);denied(await mutate(alice,object.id,1,'stale overwrite','stale-key'),409,'REVISION_CONFLICT');assert.deepEqual(row(object.id),before);assert.equal(receiptCount('stale-key'),0);return {http:409,unchanged:true,receipt_count:0}})
 await check('T03.private-and-forged-identity',async()=>{
  const target=await create(bob,'乙的 synthetic private');const p=await prepared(alice,target.id,1),r=await execute(alice,p);denied(r);assert(!r.text.includes(target.title));denied(await mutate(alice,target.id,1,'unauthorized','private-key'));assert.equal(row(target.id).revision,1)
  denied(await prepare(alice,object.id,3,'fixture:forge'),422,'INPUT_INVALID');const forged=await post(alice,'/knowledge/v1/ai/prepare',{request_id:randomUUID(),instruction:'read',object_id:object.id,expected_revision:3,idempotency_key:'f',user_id:c.bob.user.id});denied(forged,422,'INPUT_INVALID')
  return {cross_user_read:404,cross_user_write:404,forged_model_identity:422,forged_request_identity:422,unchanged:true}
 })
 const pr=await post(alice,'/knowledge/v1/projects',{name:'FND005 synthetic project'});assert.equal(pr.status,201);project=pr.json.data
 assert.equal((await post(alice,`/knowledge/v1/projects/${project.id}/memberships`,{user_id:c.bob.user.id,role:'member'})).status,204)
 projectObject=await create(alice,'synthetic project object',{scope:'project',project_id:project.id})
 readGrant=await grant('read');editGrant=await grant('edit')
 await check('T04.revoke-after-prepare-and-replay',async()=>{
  const first=await mutate(bob,projectObject.id,1,'authorized member update','member-key');assert.equal(first.status,200)
  const p=await prepared(bob,projectObject.id,2),w=await prepared(bob,projectObject.id,2,'修改正文为：blocked','revoked-key')
  assert.equal((await post(alice,'/knowledge/v1/grants/revoke',{grant_id:readGrant.id})).status,204)
  denied(await execute(bob,p));denied(await execute(bob,w));denied(await mutate(bob,projectObject.id,1,'authorized member update','member-key'))
  assert.equal(row(projectObject.id).revision,2);assert.equal(receiptCount('revoked-key'),0)
  readGrant=await grant('read');assert.equal((await getObject(bob,projectObject.id)).status,200)
  return {prepared_read:404,prepared_write:404,protected_replay:404,revision:2,revoked_grant_history:Number(sql(dbPath(run.dataDir),'SELECT count(*) n FROM resource_grants WHERE resource_id=? AND revoked_at IS NOT NULL',[projectObject.id])[0].n),regrant_restored:true}
 })
 await check('T04.membership-expiry-after-prepare',async()=>{
  const p=await prepared(bob,projectObject.id,2,'修改正文为：blocked expiry','expiry-key')
  assert.equal((await post(alice,`/knowledge/v1/projects/${project.id}/memberships`,{user_id:c.bob.user.id,role:'member',expires_at:'2000-01-01T00:00:00.000Z'})).status,204)
  denied(await execute(bob,p));assert.equal(row(projectObject.id).revision,2);assert.equal(receiptCount('expiry-key'),0)
  assert.equal((await post(alice,`/knowledge/v1/projects/${project.id}/memberships`,{user_id:c.bob.user.id,role:'member'})).status,204)
  return {http:404,valid_action_grants_do_not_bypass_expired_membership:true,unchanged:true}
 })
 await check('T04.logout-after-prepare',async()=>{const p=await prepared(bob,projectObject.id,2);assert.equal((await post(bob,'/knowledge/v1/auth/logout',{})).status,204);denied(await execute(bob,p),401,'AUTH_REQUIRED');return {http:401,no_tool_result:true}})
 await check('T07.typed-model-failures',async()=>{
  const observed=[];for(const [instruction,status,code] of [['fixture:missing',503,'CREDENTIALS_MISSING'],['fixture:invalid',502,'CREDENTIALS_INVALID'],['fixture:quota',429,'QUOTA_EXHAUSTED'],['fixture:permission',403,'PROVIDER_PERMISSION_DENIED'],['fixture:failure',502,'MODEL_FAILED'],['fixture:timeout',504,'MODEL_TIMEOUT'],['fixture:multiple',502,'MODEL_OUTPUT_INVALID']]){const r=await prepare(alice,object.id,3,instruction);denied(r,status,code);observed.push({fixture:instruction,http:status,code})}return observed
 })
 await check('T07.cancellation',async()=>{
  const id=randomUUID(),pending=prepare(alice,object.id,3,'fixture:cancel','cancel-key',id);await new Promise(r=>setTimeout(r,150));assert.equal((await post(alice,'/knowledge/v1/ai/cancel',{request_id:id})).status,200);denied(await pending,409,'CANCELLED')
  const p=await prepared(alice,object.id,3,'修改正文为：cancelled','cancelled-prepared');await post(alice,'/knowledge/v1/ai/cancel',{request_id:p.request_id});denied(await execute(alice,p),409,'CANCELLED');assert.equal(receiptCount('cancelled-prepared'),0)
  return {stream_cancel:409,prepared_cancel:409,unchanged:true}
 })
 await check('T09.persistence-restart',async()=>{
  const previousPid=host.child.pid;await stopHost(host);assert(host.child.exitCode!==null||host.child.signalCode!==null);host=await run.start();assert.notEqual(host.child.pid,previousPid)
  alice=(await login(run.port,'alice','甲 synthetic password 2026!')).cookie
  const r=await mutate(alice,object.id,1,'synthetic first update','original-key');assert.equal(r.status,200);assert.deepEqual(r.json.data.result.object,original);assert.equal(row(object.id).revision,3);assert.equal(receiptCount('original-key'),1)
  const facts=databaseFacts(dbPath(run.dataDir));assert.equal(facts.userVersion,5);assert.equal(facts.ledger.length,5)
  return {old_pid_stopped:true,new_pid:true,user_version:5,ledger:5,persistent_original_replay:true,current_revision:3}
 })
 await check('T09.foundation-record-and-identity',async()=>{
  owner=(await entryCookie(host.entryUrl)).cookie
  const r=await api(run.port,owner,'POST','/knowledgeos/foundation/records',{content:'synthetic foundation regression'},{'idempotency-key':randomUUID()});assert.equal(r.status,201,JSON.stringify(r.json))
  assert.equal((await call(owner,'GET','/knowledgeos/foundation/records/'+r.json.data.id)).status,200)
  const prefs=await call(alice,'PATCH','/knowledge/v1/me/preferences',{expected_revision:999,goal_text:'stale'});assert.equal(prefs.status,409)
  return {foundation_record_create:201,read:200,preferences_conflict:409}
 })
 // Actual loaded files, not only an injected commit label.
 const loaded=join(run.home,'profiles',run.profile,'node_modules/knowledgeos-panel/lib/index.js')
 const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
 assert.equal(hash(loaded),hash('packages/knowledgeos-panel/lib/index.js'))
 report.loaded_bundle_sha256=hash(loaded);report.schema=databaseFacts(dbPath(run.dataDir)).ledger.map(r=>({version:r.version,checksum:r.checksum}))
}catch(e){report.status='FAIL';report.failure=e.message}finally{await stopHost(host);report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,output:join(out,'summary.json')}));if(report.status!=='PASS')process.exitCode=1}
