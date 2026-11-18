/** Independent oracles. Model choice and native file barriers are controlled;
 * login, HTTP, native dispatch, authorization, transactions and persistence are real. */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { request } from 'node:http'
import { createConnection } from 'node:net'
import { Worker } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { prepareRun, accounts, api, sql, dbPath, stopHost } from '../../../../scripts/fnd005/harness.mjs'
const out=resolve('docs/evidence/FND-005/independent/additional');mkdirSync(out,{recursive:true})
const run=prepareRun(out,3142), db=dbPath(run.dataDir)
const report={candidate_id:'FND-005-572a5b58a7b46671',category:'INDEPENDENT_REAL_HTTP_NATIVE_SQLITE_WITH_CONTROLLED_MODEL_AND_ORDERING',real_gpt:false,status:'PASS',started_at:new Date().toISOString(),checks:[]}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)), sha=s=>createHash('sha256').update(s).digest('hex')
const post=(c,p,b)=>api(run.port,c,'POST',p,b), get=(c,p)=>api(run.port,c,'GET',p)
const read=id=>sql(db,'SELECT id,title,body,revision,created_at,updated_at,status FROM knowledge_objects WHERE id=?',[id])[0]
const count=(key,user)=>Number(sql(db,'SELECT count(*) n FROM ai_tool_mutations WHERE idempotency_key=? AND user_id=?',[key,user])[0].n)
const expected=(r,status,code)=>{assert.equal(r.status,status);if(code)assert.equal(r.json?.code,code);if(status>=400)assert.equal(r.json?.data,undefined);return {http:r.status,code:r.json?.code??r.json?.data?.result?.code}}
const create=async(c,label,extra={})=>{const r=await post(c,'/knowledge/v1/objects',{title:'independent '+label,body:'synthetic baseline '+label,...extra});expected(r,201);return r.json.data}
const prep=async(c,o,instruction='读取这个对象',key=randomUUID(),rev=o.revision)=>{const r=await post(c,'/knowledge/v1/ai/prepare',{request_id:randomUUID(),instruction,object_id:o.id,expected_revision:rev,idempotency_key:key});expected(r,200);return r.json.data}
const exec=(c,p)=>post(c,'/knowledge/v1/ai/execute',{prepared_id:p.prepared_id})
const arm=p=>writeFileSync(join(run.barrierDir,p+'.arm'),'controlled ordering')
const release=p=>writeFileSync(join(run.barrierDir,p+'.release'),'release')
const clear=()=>{for(const p of ['pre','post'])for(const x of ['arm','reached','release'])rmSync(join(run.barrierDir,p+'.'+x),{force:true})}
const reached=async p=>{const end=Date.now()+4000;while(!existsSync(join(run.barrierDir,p+'.reached'))&&Date.now()<end)await sleep(10);assert(existsSync(join(run.barrierDir,p+'.reached')),'native barrier not reached')}
const until=async t=>{await sleep(Math.max(0,Date.parse(t)-Date.now()+25));assert(Date.now()>=Date.parse(t))}
const setupSql=(statement,...params)=>{const c=new DatabaseSync(db);try{return c.prepare(statement).run(...params)}finally{c.close()}}
const check=async(id,expectedOutcome,fn)=>{const item={id,expected:expectedOutcome,started_at:new Date().toISOString()};try{item.facts=await fn();item.status='PASS'}catch(e){item.status='FAIL';item.error=e.message;report.status='FAIL'}finally{release('pre');release('post');await sleep(25);clear();item.finished_at=new Date().toISOString();report.checks.push(item);console.log(id+' '+item.status)}}
let host,c,alice,bob,project,obj,readGrant,editGrant
const member=async(expires_at)=>expected(await post(alice,`/knowledge/v1/projects/${project.id}/memberships`,{user_id:c.bob.user.id,role:'member',...(expires_at?{expires_at}:{})}),204)
const grant=async(action,expires_at)=>{const r=await post(alice,'/knowledge/v1/grants',{object_id:obj.id,subject_type:'user',subject_id:c.bob.user.id,action,...(expires_at?{expires_at}:{})});expected(r,201);return r.json.data}
const projectFixture=async label=>{const r=await post(alice,'/knowledge/v1/projects',{name:'independent '+label});expected(r,201);project=r.json.data;await member();obj=await create(alice,label,{scope:'project',project_id:project.id})}
try{
 c=await accounts(run);host=c.host;alice=c.alice.cookie;bob=c.bob.cookie
 report.host={port:run.port,pid:host.child.pid,isolated_home:true,isolated_sqlite:true}
 const loaded=join(run.home,'profiles',run.profile,'node_modules/knowledgeos-panel/lib/index.js')
 report.loaded_bundle_sha256=sha(readFileSync(loaded));assert.equal(report.loaded_bundle_sha256,'70a41b8d867667f0ecaa456eac165fde2950c747c4e00f722a07445396b4c093')
 await check('I01.same-native-call-id-and-key-two-actors','Each actor writes only its own object; two actor-scoped receipts; foreign prepared ID is hidden',async()=>{
  const a=await create(alice,'actor-a'),b=await create(bob,'actor-b'),key='independent-shared-key'
  const [pa,pb]=await Promise.all([prep(alice,a,'修改正文为：actor-a-only',key),prep(bob,b,'修改正文为：actor-b-only',key)])
  expected(await exec(bob,pa),404,'PREPARED_NOT_FOUND')
  arm('pre');const pending=Promise.all([exec(alice,pa),exec(bob,pb)]);await reached('pre');release('pre');const rs=await pending
  rs.forEach(r=>expected(r,200));assert.equal(rs[0].json.data.result.object.id,a.id);assert.equal(rs[1].json.data.result.object.id,b.id)
  assert.equal(read(a.id).body,'actor-a-only');assert.equal(read(b.id).body,'actor-b-only');assert.equal(count(key,c.alice.user.id),1);assert.equal(count(key,c.bob.user.id),1)
  return {http:rs.map(r=>r.status),foreign_prepared_http:404,native_call_id:'fixture-call (same for both)',actor_scoped_receipts:[1,1],revisions:[read(a.id).revision,read(b.id).revision]}
 })
 await check('I02.concurrent-different-input-same-key','Exactly one 200 and one 409 IDEMPOTENCY_CONFLICT, one scoped receipt and one increment',async()=>{
  const o=await create(alice,'competing-patches'),key='independent-conflicting-key',a=await prep(alice,o,'修改正文为：candidate-a',key),b=await prep(alice,o,'修改正文为：candidate-b',key)
  const rs=await Promise.all([exec(alice,a),exec(alice,b)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);expected(rs.find(r=>r.status===409),409,'IDEMPOTENCY_CONFLICT');assert.equal(read(o.id).revision,2);assert.equal(count(key,c.alice.user.id),1)
  const before=read(o.id),winner=rs.find(r=>r.status===200).json.data.result.object
  const changedRev=await exec(alice,await prep(alice,o,'修改正文为：'+winner.body,key,2));expected(changedRev,409,'IDEMPOTENCY_CONFLICT');assert.deepEqual(read(o.id),before)
  return {parallel_http:rs.map(r=>r.status),revision_only_reuse_http:409,revision:2,scoped_receipts:1}
 })
 await projectFixture('edit-without-read')
 editGrant=await grant('edit')
 await check('I03.edit-only-is-not-body-read','An edit-only grant cannot obtain a full updated object; no mutation/receipt',async()=>{
  expected(await post(bob,`/knowledge/v1/objects/${obj.id}/action`,{action:'edit'}),200);expected(await get(bob,'/knowledge/v1/objects/'+obj.id),404,'NOT_FOUND')
  const before=read(obj.id),key='independent-edit-only',r=await exec(bob,await prep(bob,obj,'修改正文为：must not leak',key));expected(r,404,'NOT_FOUND');assert.deepEqual(read(obj.id),before);assert.equal(count(key,c.bob.user.id),0);assert(!r.text.includes(obj.body));assert(!r.text.includes(obj.title))
  return {edit_action_http:200,read_http:404,ai_write_http:404,unchanged:true,scoped_receipts:0}
 })
 expected(await post(alice,'/knowledge/v1/grants/revoke',{grant_id:editGrant.id}),204)
 await check('I04.real-grant-expiry-during-native-prewait','An initially readable/editable object becomes hidden after actual expiry while native policy awaits',async()=>{
  const expires=new Date(Date.now()+1000).toISOString();readGrant=await grant('read',expires);editGrant=await grant('edit',expires)
  expected(await get(bob,'/knowledge/v1/objects/'+obj.id),200);const r=await prep(bob,obj),key='independent-timed-grant',w=await prep(bob,obj,'修改正文为：expired-grant-write',key)
  assert(Date.now()<Date.parse(expires));arm('pre');const pending=Promise.all([exec(bob,r),exec(bob,w)]);await reached('pre');await until(expires);const released=new Date().toISOString();release('pre');const rs=await pending;rs.forEach(r=>expected(r,404,'NOT_FOUND'));assert.equal(read(obj.id).revision,1);assert.equal(count(key,c.bob.user.id),0)
  return {expires_at:expires,released_at:released,http:rs.map(r=>r.status),revision:1,scoped_receipts:0,clock:'real wall clock, no override'}
 })
 await check('I05.creator-membership-expires-in-native-prewait','Project creator ownership and retained implicit grants cannot bypass expired membership',async()=>{
  const expires=new Date(Date.now()+1000).toISOString();await member(expires);const own=await create(bob,'creator-membership',{scope:'project',project_id:project.id});expected(await get(bob,'/knowledge/v1/objects/'+own.id),200)
  const r=await prep(bob,own),key='independent-creator-expiry',w=await prep(bob,own,'修改正文为：expired-creator',key)
  assert(Date.now()<Date.parse(expires));arm('pre');const pending=Promise.all([exec(bob,r),exec(bob,w)]);await reached('pre');await until(expires);release('pre');const rs=await pending;rs.forEach(r=>expected(r,404,'NOT_FOUND'));assert.equal(read(own.id).revision,1);assert.equal(count(key,c.bob.user.id),0)
  await member();expected(await get(bob,'/knowledge/v1/objects/'+own.id),200)
  return {expires_at:expires,http:rs.map(r=>r.status),revision:1,scoped_receipts:0,restored_membership_positive_control:200}
 })
 await projectFixture('sql-lock-revoke');readGrant=await grant('read');editGrant=await grant('edit')
 await check('I06.real-http-write-after-serialized-revocation','A separate SQLite writer commits read revocation before mutation lock is acquired; HTTP write denies and persists nothing',async()=>{
  const key='independent-lock-revoke',p=await prep(bob,obj,'修改正文为：must reject after lock',key);arm('pre');const pending=exec(bob,p);await reached('pre')
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE resource_grants SET revoked_at=? WHERE id=?').run(new Date().toISOString(),workerData.grant);parentPort.postMessage({phase:'locked-revocation-uncommitted',at:new Date().toISOString()});parentPort.once('message',()=>setTimeout(()=>{db.exec('COMMIT');db.close();parentPort.postMessage({phase:'revocation-committed',at:new Date().toISOString()})},175));`,{eval:true,workerData:{path:db,grant:readGrant.id}})
  const exited=new Promise((r,j)=>{worker.once('exit',r);worker.once('error',j)})
  const messages=[];const first=new Promise((r,j)=>{worker.once('message',x=>{messages.push(x);r(x)});worker.once('error',j)});await first
  const committed=new Promise((r,j)=>{worker.once('message',x=>{messages.push(x);r(x)});worker.once('error',j)})
  const start=Date.now();release('pre');worker.postMessage('release-after-delay');const r=await pending,elapsed=Date.now()-start;await committed;await exited
  expected(r,404,'NOT_FOUND');assert(elapsed>=100,'write did not wait on real SQLite lock');assert.equal(read(obj.id).revision,1);assert.equal(count(key,c.bob.user.id),0);assert(sql(db,'SELECT revoked_at FROM resource_grants WHERE id=?',[readGrant.id])[0].revoked_at)
  return {ordering:messages,elapsed_ms:elapsed,http:404,revision:1,scoped_receipts:0,setup:'synthetic revocation by separate real SQLite transaction, not public SQL API'}
 })
 await check('I07.commit-response-lost-and-replay-after-later-edit','After response loss at a known commit, original key returns persisted original result even after another edit',async()=>{
  const o=await create(alice,'lost-response'),key='independent-lost-response',p=await prep(alice,o,'修改正文为：original durable outcome',key);arm('post')
  const body=JSON.stringify({prepared_id:p.prepared_id});let req
  const transportClosed=new Promise(resolveClosed=>{req=request({hostname:'127.0.0.1',port:run.port,path:'/knowledge/v1/ai/execute',method:'POST',headers:{cookie:alice,'content-type':'application/json','content-length':Buffer.byteLength(body),'x-knowledgeos-request':'1'}},res=>{res.resume();res.once('end',()=>resolveClosed('response-delivered'))});req.once('error',()=>resolveClosed('response-lost'));req.end(body)})
  await reached('post');assert.equal(read(o.id).revision,2)
  const receipt=sql(db,'SELECT result_json FROM ai_tool_mutations WHERE user_id=? AND idempotency_key=?',[c.alice.user.id,key]);assert.equal(receipt.length,1);const original=JSON.parse(receipt[0].result_json)
  req.destroy(new Error('synthetic response loss'));assert.equal(await transportClosed,'response-lost');release('post');await sleep(100)
  expected(await api(run.port,alice,'PATCH','/knowledge/v1/objects/'+o.id,{expected_revision:2,body:'separate later edit'}),200)
  const replay=await exec(alice,await prep(alice,o,'修改正文为：original durable outcome',key));expected(replay,200);assert.equal(replay.json.data.result.code,'REPLAYED');assert.deepEqual(replay.json.data.result.object,original);assert.equal(read(o.id).revision,3);assert.equal(read(o.id).body,'separate later edit');assert.equal(count(key,c.alice.user.id),1)
  return {transport:'destroyed after SQL-proven commit before HTTP publication',original_result_revision:2,current_sql_revision:3,replay_code:'REPLAYED',exact_original_payload:true,scoped_receipts:1,result_sha256:sha(JSON.stringify(original))}
 })
 await projectFixture('committed-then-read-revoked');readGrant=await grant('read');editGrant=await grant('edit')
 await check('I08.committed-update-publication-recheck-and-reconcile','Committed update loses read permission during post policy: suppress output, retain receipt, deny replay until regrant',async()=>{
  const key='independent-post-commit-revoke',p=await prep(bob,obj,'修改正文为：committed protected outcome',key);arm('post');const pending=exec(bob,p);await reached('post');assert.equal(read(obj.id).revision,2)
  const original=JSON.parse(sql(db,'SELECT result_json FROM ai_tool_mutations WHERE user_id=? AND idempotency_key=?',[c.bob.user.id,key])[0].result_json)
  expected(await post(alice,'/knowledge/v1/grants/revoke',{grant_id:readGrant.id}),204);release('post');const denied=await pending;expected(denied,404,'NOT_FOUND');assert(!denied.text.includes(original.body));assert(!denied.text.includes(original.title))
  expected(await exec(bob,await prep(bob,{...obj,revision:1},'修改正文为：committed protected outcome',key)),404,'NOT_FOUND');readGrant=await grant('read')
  const recovered=await exec(bob,await prep(bob,{...obj,revision:1},'修改正文为：committed protected outcome',key));expected(recovered,200);assert.deepEqual(recovered.json.data.result.object,original);assert.equal(count(key,c.bob.user.id),1);assert.equal(read(obj.id).revision,2)
  return {publication_http:404,revoked_replay_http:404,regranted_replay_http:200,exact_original_result:true,sql_revision:2,scoped_receipts:1}
 })
 await check('I09.inactive-account-before-native-body','Account disabled after HTTP admission and before native body: 401 and no write',async()=>{
  const o=await create(alice,'inactive-account'),key='independent-inactive',p=await prep(alice,o,'修改正文为：must reject disabled',key);arm('pre');const pending=exec(alice,p);await reached('pre')
  setupSql("UPDATE users SET status='disabled' WHERE id=?",c.alice.user.id);release('pre');let r
  try{r=await pending;expected(r,401,'AUTH_REQUIRED');assert.equal(read(o.id).revision,1);assert.equal(count(key,c.alice.user.id),0)}finally{setupSql("UPDATE users SET status='active' WHERE id=?",c.alice.user.id)}
  return {http:r.status,revision:1,scoped_receipts:0,setup:'synthetic inactive-account SQL transition'}
 })
 await check('I10.session-expires-after-read-body-before-publication','An expiring actual login suppresses delayed read output after native body completed',async()=>{
  const o=await create(bob,'session-expiry'),p=await prep(bob,o);arm('post');const pending=exec(bob,p);await reached('post');const expires=new Date(Date.now()+120).toISOString()
  setupSql('UPDATE auth_sessions SET expires_at=? WHERE user_id=?',expires,c.bob.user.id);await until(expires);release('post');const r=await pending;expected(r,401,'AUTH_REQUIRED');assert(!r.text.includes(o.body));assert(!r.text.includes(o.title));expected(await get(bob,'/knowledge/v1/me'),401)
  return {expires_at:expires,http:401,no_protected_result:true,revision:read(o.id).revision,setup:'synthetic session lifetime changed; actual wall-clock expiry and HTTP revalidation'}
 })
 await check('I11.admission-schema-identity-and-csrf','Unsupported actor fields, invalid revision/key, and foreign Origin fail before any model attempt',async()=>{
  const before=(await get(alice,'/knowledge/v1/ai/status')).json.data.attempts,base={request_id:randomUUID(),instruction:'读取对象',object_id:'synthetic-target',expected_revision:1,idempotency_key:'independent-input'}
  const fields=['user_id','actor','actor_id','role','owner_id','owner_user_id','service_id','space_id','session_id','authorization','sql','path','command'],observed=[]
  for(const field of fields){const r=await post(alice,'/knowledge/v1/ai/prepare',{...base,[field]:'forged'});expected(r,422,'INPUT_INVALID');observed.push({field,http:r.status})}
  for(const value of [0,-1,1.5,'1',null])expected(await post(alice,'/knowledge/v1/ai/prepare',{...base,expected_revision:value}),422,'INPUT_INVALID')
  expected(await post(alice,'/knowledge/v1/ai/prepare',{...base,idempotency_key:''}),422,'INPUT_INVALID')
  // The fixed Host can reject the Origin before the business JSON handler.
  const crossOrigin=await api(run.port,alice,'POST','/knowledge/v1/ai/prepare',base,{origin:'https://foreign.invalid'});assert.equal(crossOrigin.status,403);assert.equal(crossOrigin.json?.data,undefined)
  expected(await post('','/knowledge/v1/ai/prepare',base),401,'AUTH_REQUIRED')
  const after=(await get(alice,'/knowledge/v1/ai/status')).json.data.attempts;assert.equal(after,before)
  return {unsupported_fields:observed,invalid_revision_cases:5,empty_key_http:422,foreign_origin_http:403,anonymous_http:401,attempts_delta:after-before}
 })
}catch(e){report.status='FAIL';report.setup_error=e.message}
finally{
 release('pre');release('post');await stopHost(host)
 report.host_stopped=host?host.child.exitCode!==null||host.child.signalCode!==null:false
 report.port_released=await new Promise(r=>{const c=createConnection({host:'127.0.0.1',port:run.port});c.once('connect',()=>{c.destroy();r(false)});c.once('error',()=>r(true))})
 report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n')
 if(report.status!=='PASS')process.exitCode=1
}
