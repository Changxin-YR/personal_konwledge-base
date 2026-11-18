/** Classification-only port fixtures, deliberately not claimed as native/HTTP/provider runs. */
import assert from 'node:assert/strict'
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve,join } from 'node:path'
import { pathToFileURL } from 'node:url'
const out=resolve('docs/evidence/FND-005/independent/service-additional');mkdirSync(out,{recursive:true})
const report={candidate_id:'FND-005-d0ec209b8161e14e',category:'CONTROLLED_SERVICE_PORT_AND_TERMINAL_STREAM_ERRORS',real_gpt:false,status:'PASS',started_at:new Date().toISOString(),checks:[]}
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const manifest=JSON.parse(readFileSync('docs/evidence/FND-005/independent/candidate-original.json','utf8'))
assert.equal(manifest.candidate_id,report.candidate_id)
const path='packages/knowledgeos-panel/lib/test-support.js'
report.loaded_test_support_sha256=hash(path)
if(report.loaded_test_support_sha256!==manifest.candidate_files[path]){
 report.status='NOT_RUN';report.reason='Product writer rebuilding; frozen original bundle no longer matches. Repeat on next frozen candidate.'
}else{
 const {AiService}=await import(pathToFileURL(resolve(path)).href)
 const actor={userId:'synthetic-user',sessionId:'synthetic-session',serviceId:'synthetic-service',personalSpaceId:'synthetic-space',role:'member'}
 const config={provider:'fixture',model:'controlled',maxCalls:8,inputUsdPerMillion:0,outputUsdPerMillion:0}
 const request={request_id:'synthetic-request',instruction:'read',object_id:'synthetic-object',expected_revision:1,idempotency_key:'synthetic-key'}
 const llm=failure=>({listProviders:()=>[{id:'fixture'}],listModels:async()=>[{id:'controlled'}],async *stream(){if(failure){yield {type:'finish',reason:{kind:'error',failure}};return}yield {type:'block-end',block:{type:'tool-call',id:'controlled-call',name:'knowledgeos_read_object',arguments:JSON.stringify({object_id:'synthetic-object'})}};yield {type:'finish',reason:{kind:'tool-calls'}}}})
 const fakeStore={authorizeObject:()=>{throw new Error('business body must not run in classification fixtures')},mutateObjectOnce:()=>{throw new Error('no database mutation permitted')}}
 for(const [code,status,app] of [['ABORTED',409,'CANCELLED'],['ABORTED_BEFORE_DISPATCH',409,'CANCELLED'],['TOOL_TIMEOUT',504,'TOOL_TIMEOUT']]){
  const tools={register:()=>()=>{},execute:async()=>({results:[{callId:'controlled-call',result:{content:[{type:'text',text:'controlled native-shaped error'}],isError:true,error:{info:{code}}}}]})},service=new AiService(fakeStore,config,llm(),tools)
  const item={id:'R3.classify-'+code,input_code:code,expected_http:status,expected_code:app}
  try{const p=await service.prepare(actor,request,new AbortController().signal);await assert.rejects(()=>service.execute(actor,()=>actor,p.prepared_id,new AbortController().signal),e=>e.status===status&&e.code===app);item.status='PASS'}catch(e){item.status='FAIL';item.error=e.message;report.status='FAIL'}finally{service.close()}
  report.checks.push(item)
 }
 for(const [failure,status,app] of [[{code:'NO_CREDENTIAL_STORE'},503,'CREDENTIALS_MISSING'],[{code:'AUTH',status:401,message:'quota read permission denied'},502,'CREDENTIALS_INVALID'],[{code:'AUTH',status:403,message:'billing permission denied'},403,'PROVIDER_PERMISSION_DENIED']]){
  const service=new AiService(fakeStore,config,llm(failure),{register:()=>()=>{},execute:()=>{throw new Error('terminal model error must not dispatch a tool')}}),item={id:'R4.terminal-'+app,input:failure,expected_http:status,expected_code:app}
  try{await assert.rejects(()=>service.prepare(actor,request,new AbortController().signal),e=>e.status===status&&e.code===app);item.status='PASS'}catch(e){item.status='FAIL';item.error=e.message;report.status='FAIL'}finally{service.close()}
  report.checks.push(item)
 }
}
report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length}));if(report.status==='FAIL')process.exitCode=1
