#!/usr/bin/env node
/** Real native executor policy waits + real HTTP/SQLite, controlled model and barrier fixture. */
import assert from 'node:assert/strict'
import { existsSync,writeFileSync,rmSync,mkdirSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { prepareRun,accounts,api,login,sql,dbPath,stopHost } from './harness.mjs'
const out=resolve(process.argv[2]??'docs/evidence/FND-005/runs/barriers');mkdirSync(out,{recursive:true});const run=prepareRun(out,3135)
const report={category:'REAL_DSH_NATIVE_HTTP_SQLITE_WITH_CONTROLLED_MODEL_POLICY_BARRIERS',status:'PASS',real_gpt:false,started_at:new Date().toISOString(),checks:[]}
const arm=p=>writeFileSync(join(run.barrierDir,p+'.arm'),'synthetic'),release=p=>writeFileSync(join(run.barrierDir,p+'.release'),'release'),clear=p=>{for(const ext of ['arm','reached','release'])rmSync(join(run.barrierDir,p+'.'+ext),{force:true})}
const reached=async p=>{const end=Date.now()+4000;while(!existsSync(join(run.barrierDir,p+'.reached'))&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert(existsSync(join(run.barrierDir,p+'.reached')),'native barrier not reached')}
let host,c,alice,bob,object
const post=(cookie,path,b)=>api(run.port,cookie,'POST',path,b)
const prep=async(cookie,id,instruction='读取对象')=>{const r=await post(cookie,'/knowledge/v1/ai/prepare',{request_id:randomUUID(),instruction,object_id:id,expected_revision:1,idempotency_key:randomUUID()});assert.equal(r.status,200,JSON.stringify(r.json));return r.json.data}
const execute=(cookie,p)=>post(cookie,'/knowledge/v1/ai/execute',{prepared_id:p.prepared_id})
const check=async(id,fn)=>{try{const facts=await fn();report.checks.push({id,status:'PASS',facts});console.log(id+' PASS')}catch(e){report.status='FAIL';report.checks.push({id,status:'FAIL',error:e.message});throw e}finally{clear('pre');clear('post');clear('native-cancel')}}
try{
 c=await accounts(run);host=c.host;alice=c.alice.cookie;bob=c.bob.cookie
 const p=await post(alice,'/knowledge/v1/projects',{name:'synthetic barrier project'});assert.equal(p.status,201);const project=p.json.data
 assert.equal((await post(alice,`/knowledge/v1/projects/${project.id}/memberships`,{user_id:c.bob.user.id,role:'member'})).status,204)
 const o=await post(alice,'/knowledge/v1/objects',{scope:'project',project_id:project.id,title:'synthetic protected',body:'synthetic protected sentinel'});object=o.json.data
 const g=await post(alice,'/knowledge/v1/grants',{object_id:object.id,subject_type:'user',subject_id:c.bob.user.id,action:'read'});assert.equal(g.status,201)
 await check('R1.post-body-revocation-suppresses-publication',async()=>{
  const p=await prep(bob,object.id);arm('post');const pending=execute(bob,p);await reached('post');await post(alice,'/knowledge/v1/grants/revoke',{grant_id:g.json.data.id});release('post');const r=await pending;assert.equal(r.status,404);assert.equal(r.json.code,'NOT_FOUND');assert(!r.text.includes('synthetic protected sentinel'));return {native_body_completed:true,revocation_before_publication:true,http:404,no_body_disclosed:true}
 })
 await check('R1.post-body-logout-suppresses-publication',async()=>{
  const personal=await post(bob,'/knowledge/v1/objects',{title:'synthetic logout',body:'synthetic logout sentinel'}),p=await prep(bob,personal.json.data.id);arm('post');const pending=execute(bob,p);await reached('post');await post(bob,'/knowledge/v1/auth/logout',{});release('post');const r=await pending;assert.equal(r.status,401);assert.equal(r.json.code,'AUTH_REQUIRED');assert(!r.text.includes('synthetic logout sentinel'));return {http:401,no_body_disclosed:true}
 })
 const personal=await post(alice,'/knowledge/v1/objects',{title:'synthetic cancelled write',body:'baseline'}),id=personal.json.data.id
 await check('R2.cancel-native-wait-before-body',async()=>{
  const p=await prep(alice,id,'修改正文为：must not commit');arm('pre');const pending=execute(alice,p);await reached('pre');assert.equal((await post(alice,'/knowledge/v1/ai/cancel',{request_id:p.request_id})).status,200);release('pre');const r=await pending;assert.equal(r.status,409);assert.equal(r.json.code,'CANCELLED');assert.equal(sql(dbPath(run.dataDir),'SELECT revision FROM knowledge_objects WHERE id=?',[id])[0].revision,1);return {http:409,code:r.json.code,revision:1,no_write:true}
 })
 await check('R3.native-aborted-before-dispatch-classified',async()=>{
  const p=await prep(alice,id);arm('native-cancel');const r=await execute(alice,p);assert.equal(r.status,409);assert.equal(r.json.code,'CANCELLED');return {native_code:'ABORTED_BEFORE_DISPATCH',http:409,code:r.json.code}
 })
 await check('R2.cancel-after-commit-preserves-receipt',async()=>{
  const p=await prep(alice,id,'修改正文为：committed before cancellation');arm('post');const pending=execute(alice,p);await reached('post');assert.equal(sql(dbPath(run.dataDir),'SELECT revision FROM knowledge_objects WHERE id=?',[id])[0].revision,2);const cancelled=await post(alice,'/knowledge/v1/ai/cancel',{request_id:p.request_id});assert.equal(cancelled.status,409);assert.equal(cancelled.json.code,'OPERATION_ALREADY_COMPLETED');release('post');assert.equal((await pending).status,200);assert.equal(sql(dbPath(run.dataDir),'SELECT count(*) n FROM ai_tool_mutations WHERE object_id=?',[id])[0].n,1);return {cancel_http:409,code:cancelled.json.code,execute_http:200,revision:2,receipt_count:1}
 })
}catch(e){report.status='FAIL';report.error=e.message}finally{release('pre');release('post');await stopHost(host)}
report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');if(report.status!=='PASS')process.exitCode=1
