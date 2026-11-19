#!/usr/bin/env node
/** Explicit existing trusted Host only. Business login secret is read from process env, never persisted. */
import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { randomUUID,createHash } from 'node:crypto'
import { api,login } from './harness.mjs'
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf('--'+k);return i<0?undefined:args[i+1]},out=resolve(arg('out')??'docs/evidence/FND-005/real-provider');mkdirSync(out,{recursive:true})
const report={category:'REAL_GPT_PROVIDER',status:'BLOCKED',is_gpt:false,candidate_id:arg('candidate')??'UNFROZEN',provider:null,model:arg('expect-model')??null,started_at:new Date().toISOString(),provider_calls:0,operations:[]}
try{
 report.count_basis='Successful prepare responses on the operator-confirmed route only; failed requests do not establish upstream wire/charge counts.'
 if(!arg('port')||!arg('expect-provider')||!arg('expect-model')||!arg('candidate')||!process.env.KO_FND005_LOGIN||!process.env.KO_FND005_PASSWORD){report.reason='NO_EXPLICIT_AUTHORIZED_GPT_HOST_ROUTE_CANDIDATE_AND_BUSINESS_LOGIN';throw new Error('BLOCKED')}
 assert(/^gpt-|^o[1-9](?:-|$)/i.test(arg('expect-model')),'expected model must identify the authorized GPT model')
 const port=Number(arg('port'));assert(Number.isSafeInteger(port)&&port>0&&port<65536)
 const auth=await login(port,process.env.KO_FND005_LOGIN,process.env.KO_FND005_PASSWORD);assert.equal(auth.response.status,200,'business login failed');const cookie=auth.cookie
 const config=(await api(port,cookie,'GET','/knowledge/v1/ai/status')).json.data;assert.equal(config.model,arg('expect-model'),'configured model differs; refusing substitution');assert.equal(config.provider,arg('expect-provider'),'configured provider differs; refusing substitution');assert.notEqual(config.provider,'fnd005-fixture');assert(config.configured);report.provider=config.provider;report.model=config.model;report.prepare_requests=0
 const o=await api(port,cookie,'POST','/knowledge/v1/objects',{title:'FND005 synthetic GPT verification',body:'synthetic GPT baseline'});assert.equal(o.status,201);const id=o.json.data.id
 for(const [tool,instruction,revision] of [['knowledgeos_read_object','读取指定测试对象',1],['knowledgeos_update_object','把指定测试对象的正文改为 synthetic GPT committed update',1]]){
  const key=randomUUID();report.prepare_requests++;const p=await api(port,cookie,'POST','/knowledge/v1/ai/prepare',{request_id:randomUUID(),instruction,object_id:id,expected_revision:revision,idempotency_key:key});if(p.status!==200){report.http_status=p.status;report.failure_code=/^[A-Z_]{1,64}$/.test(p.json?.code)?p.json.code:'PREPARE_FAILED';throw new Error('prepare failed')}assert.equal(p.json.data.provider,config.provider);assert.equal(p.json.data.model,config.model);report.provider_calls++;report.is_gpt=true;assert.equal(p.json.data.tool,tool)
  const e=await api(port,cookie,'POST','/knowledge/v1/ai/execute',{prepared_id:p.json.data.prepared_id});assert.equal(e.status,200,e.json.code);const reread=await api(port,cookie,'GET','/knowledge/v1/objects/'+id);assert.equal(reread.status,200);assert.equal(reread.json.data.body,e.json.data.result.object.body)
  const writing=tool==='knowledgeos_update_object';assert.equal(e.json.data.result.object.id,id);assert.equal(reread.json.data.id,id);assert.equal(reread.json.data.revision,writing?2:1);assert.equal(reread.json.data.body,writing?'synthetic GPT committed update':'synthetic GPT baseline');assert.equal(e.json.data.result.code,writing?'UPDATED':'READ');report.operations.push({tool,status:'PASS',real_provider_call:true,ui_verified:false,sql_verified:false,object_id:id,revision:reread.json.data.revision,body_sha256:createHash('sha256').update(reread.json.data.body).digest('hex'),reason:'UI_AND_INDEPENDENT_SQL_PROOF_STILL_REQUIRED'})
 }
 report.reason='PROVIDER_HTTP_PASSED_UI_SQL_INDEPENDENT_REVIEW_STILL_REQUIRED'
}catch(e){if(e.message!=='BLOCKED'){report.status='FAIL';report.reason='REAL_RUN_FAILED';report.failure_type=e.name}}
report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status==='FAIL')process.exitCode=1
