#!/usr/bin/env node
/** Configuration failures over real HTTP; all installed model responses are fixtures. */
import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { prepareRun,accounts,api,stopHost } from './harness.mjs'
import { modelFailure } from '../../packages/knowledgeos-panel/lib/test-support.js'
const out=resolve(process.argv[2]??'docs/evidence/FND-005/runs/configuration');mkdirSync(out,{recursive:true})
const report={category:'REAL_HTTP_CONFIG_AND_CONTROLLED_ERROR_FIXTURE',real_gpt:false,status:'PASS',checks:[],started_at:new Date().toISOString()}
const base={provider:'fnd005-fixture',model:'deepseek-controlled-tool-model',inputUsdPerMillion:.001,outputUsdPerMillion:.001,maxCalls:1}
const cases=[['unconfigured',{},503,'MODEL_NOT_CONFIGURED'],['non-deepseek',{...base,model:'gpt-fixture'},503,'MODEL_NOT_CONFIGURED'],['provider-unavailable',{...base,provider:'unavailable'},503,'MODEL_NOT_CONFIGURED'],['model-not-found',{...base,model:'deepseek-nonexistent-model'},404,'MODEL_NOT_FOUND'],['prices-absent',{provider:base.provider,model:base.model},200,undefined],['monetary-budget',{...base,budgetUsd:.001,inputUsdPerMillion:1000},200,undefined],['call-budget',base,200,undefined]]
for(const [id,ai,status,code] of cases){let host;const run=prepareRun(out,3133,{ai});try{
 const c=await accounts(run);host=c.host;const body={request_id:randomUUID(),instruction:'读取对象',object_id:'synthetic-target',expected_revision:1,idempotency_key:'key'}
 if(id==='call-budget')assert.equal((await api(run.port,c.alice.cookie,'POST','/knowledge/v1/ai/prepare',body)).status,200)
 const r=await api(run.port,c.alice.cookie,'POST','/knowledge/v1/ai/prepare',{...body,request_id:randomUUID()});assert.equal(r.status,status,JSON.stringify(r.json));assert.equal(r.json.code,code)
 const s=await api(run.port,c.alice.cookie,'GET','/knowledge/v1/ai/status');assert.equal(s.json.data.attempts,status!==200?0:id==='call-budget'?2:1);assert.equal(s.json.data.budget_warning,['monetary-budget','call-budget'].includes(id));if(id==='prices-absent')assert.equal(s.json.data.unknown_cost_calls,1);report.checks.push({id,status:'PASS',http:status,code,attempts:s.json.data.attempts});console.log(id+' PASS')
}catch(e){report.status='FAIL';report.checks.push({id,status:'FAIL',error:e.message})}finally{await stopHost(host)}}
for(const [input,expected] of [['MISSING_CREDENTIAL','CREDENTIALS_MISSING'],['INVALID_CREDENTIAL','CREDENTIALS_INVALID'],['ACCOUNT_QUOTA','QUOTA_EXHAUSTED'],['QUOTA','QUOTA_EXHAUSTED'],['UNKNOWN_MODEL','MODEL_NOT_FOUND'],['MODEL_UNSUPPORTED','MODEL_NOT_FOUND'],['NO_ADAPTER','MODEL_NOT_CONFIGURED'],['TIMEOUT','MODEL_TIMEOUT'],['ABORTED','CANCELLED'],['RATE_LIMIT','PROVIDER_RATE_LIMITED']]){try{assert.equal(modelFailure({code:input}).code,expected);report.checks.push({id:'typed-'+input,status:'PASS',category:'CONTROLLED_ERROR_CLASSIFIER',code:expected})}catch(e){report.status='FAIL';report.checks.push({id:'typed-'+input,status:'FAIL',error:e.message})}}
for(const [input,expected] of [[{code:'NO_CREDENTIAL_STORE'},'CREDENTIALS_MISSING'],[{code:'AUTH',status:401,message:'quota read permission denied'},'CREDENTIALS_INVALID'],[{code:'AUTH',status:403,message:'billing permission denied'},'PROVIDER_PERMISSION_DENIED']]){try{assert.equal(modelFailure(input).code,expected);report.checks.push({id:'R4.'+expected,status:'PASS',category:'CONTROLLED_ERROR_CLASSIFIER'})}catch(e){report.status='FAIL';report.checks.push({id:'R4.'+expected,status:'FAIL',error:e.message})}}
// The actual pinned pi-ai adapter hides its catalog if the credential is absent.
// A local trap proves credential/model classification occurs before any wire call.
let networkRequests=0
const trap=createServer((req,res)=>{networkRequests++;res.statusCode=500;res.end('synthetic unexpected request')})
await new Promise(r=>trap.listen(0,'127.0.0.1',r))
const credentialRef='FND005_UNSET_'+randomUUID().replaceAll('-','').toUpperCase();assert(!process.env[credentialRef])
for(const [id,model,status,code] of [['actual-pi-ai-missing-credential','deepseek-credential-fixture-model',503,'CREDENTIALS_MISSING'],['actual-pi-ai-unknown-model-with-hidden-catalog','deepseek-unknown-fixture-model',404,'MODEL_NOT_FOUND']]){
 let host
 const run=prepareRun(out,3133,{fixture:false,ai:{...base,provider:'fnd005-no-key',model},providerRows:[{id:'llm-pi-ai',config:{providers:{'fnd005-no-key':{api:'openai-completions',baseURL:`http://127.0.0.1:${trap.address().port}/v1`,apiKeyEnv:credentialRef,models:[{id:'deepseek-credential-fixture-model',name:'Synthetic credential fixture (NOT GPT)'}]}}}}]})
 try{const c=await accounts(run);host=c.host;const r=await api(run.port,c.alice.cookie,'POST','/knowledge/v1/ai/prepare',{request_id:randomUUID(),instruction:'读取合成对象',object_id:'synthetic-target',expected_revision:1,idempotency_key:randomUUID()});assert.equal(r.status,status,JSON.stringify(r.json));assert.equal(r.json.code,code);assert.equal(networkRequests,0);report.checks.push({id,status:'PASS',category:'ACTUAL_PINNED_PI_AI_ADAPTER_REAL_HTTP_NO_CREDENTIAL',http:status,code,network_requests:networkRequests});console.log(id+' PASS')}
 catch(e){report.status='FAIL';report.checks.push({id,status:'FAIL',error:e.message})}finally{await stopHost(host)}
}
await new Promise(r=>trap.close(r))
report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');if(report.status!=='PASS')process.exitCode=1
