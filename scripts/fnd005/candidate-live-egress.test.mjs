import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,existsSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {authorizeCompletion,credentialAlias,guardedFetch,instructionFor,makePermit,relayRoute} from './candidate-live-egress.mjs'

const {system,tools}={"system":"Choose exactly one provided KnowledgeOS tool for the user instruction. Use only the specified target object and revision. Do not invent identities, permissions, SQL, paths or commands. Reading uses knowledgeos_read_object. Updating title/body uses knowledgeos_update_object. Do not claim success; the server will execute the tool. Return one tool call.","tools":[{"name":"knowledgeos_read_object","description":"Read the specified existing KnowledgeOS test object. Server enforces the logged-in user permissions.","parameters":{"type":"object","properties":{"object_id":{"type":"string"}},"required":["object_id"],"additionalProperties":false}},{"name":"knowledgeos_update_object","description":"Update the specified existing KnowledgeOS test object at expected_revision. Supply title and/or body. Server enforces identity, permissions, revision and idempotency.","parameters":{"type":"object","properties":{"object_id":{"type":"string"},"expected_revision":{"type":"integer","minimum":1},"title":{"type":"string","minLength":1,"maxLength":200},"body":{"type":"string","maxLength":2000}},"required":["object_id","expected_revision"],"additionalProperties":false}}]}
const candidate='1'.repeat(40),objectId=randomUUID(),url=relayRoute.endpoint+'/chat/completions'
const approval={...relayRoute,currency:'USD_PER_MILLION_TOKENS',input:1,output:4,reviewed_at:new Date().toISOString()}
const payload=step=>({model:relayRoute.model,stream:true,max_tokens:512,store:false,stream_options:{include_usage:true},messages:[
  {role:'developer',content:system},
  {role:'user',content:[{type:'text',text:JSON.stringify({instruction:instructionFor(step),target_object_id:objectId,expected_revision:1})}]},
],tools:tools.map(x=>({type:'function',function:{...x,strict:false}}))})
const permits=[1,2].map(step=>makePermit(candidate,relayRoute,step,objectId))
const args=(step,body=payload(step),overrides={})=>({url,method:'POST',body:JSON.stringify(body),permit:permits[step-1],approval,candidate,step,...overrides})

test('transport proof binds two synthetic operations to the candidate, payload, and bounded endpoint',()=>{
  authorizeCompletion(args(1));authorizeCompletion(args(2))
  for(const [field,value] of [
    ['model','deepseek-v4.1-flash-1017/hs14'],['max_tokens',513],['max_tokens',undefined],['max_completion_tokens',513],
    ['stream_options',{include_usage:false}],['n',2],['store',true],['user','arbitrary'],
    ['messages',payload(2).messages],['messages',[...payload(1).messages,{role:'assistant',content:'extra'}]],
    ['tools',tools.map(tool=>({type:'function',function:{...tool,description:'substitute'}}))],
  ]) assert.throws(()=>authorizeCompletion(args(1,{...payload(1),[field]:value})))
  for(const overrides of [
    {url:url+'?other=1'},{url:url.replace('tokease.cn','other.invalid')},{method:'GET'},
    {candidate:'2'.repeat(40)},{permit:{...permits[0],objectId:randomUUID()}},{permit:{...permits[0],expiresAt:0}},
    {permit:{...permits[0],step:2}},{approval:{...approval,reviewed_at:'2000-01-01'}},
  ]) assert.throws(()=>authorizeCompletion(args(1,payload(1),overrides)))
})

test('fetch confinement denies before forwarding and consumes exactly two independent one-shot permits',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'ko-egress-fixture-')),signals=[],loopback='http://127.0.0.1:37397',dummy='test-only-not-a-secret'
  const env={KO_TEST_LOOPBACK:loopback,KO_RUN:dir,KO_MODE:'live',KO_BOUND_CANDIDATE:candidate,[credentialAlias]:dummy}
  const transport=async(...args)=>{signals.push({url:args[0],redirect:args[1].redirect});return new Response('fixture')}
  const fetch=guardedFetch(transport,env)
  const request=step=>({headers:{authorization:'Bearer '+dummy},method:'POST',body:JSON.stringify(payload(step))})
  await assert.rejects(fetch(url,request(1)),{message:'ACCEPTANCE_EGRESS_DENIED'})
  writeFileSync(join(dir,'approved.json'),JSON.stringify(approval))
  for(const [i,permit] of permits.entries()) {
    writeFileSync(join(dir,'permit-'+(i+1)),JSON.stringify(permit))
    writeFileSync(join(dir,'armed-'+(i+1)),'')
  }
  await assert.rejects(guardedFetch(transport,{...env,KO_MODE:'discover'})(url,request(1)),{message:'ACCEPTANCE_EGRESS_DENIED'})
  await assert.rejects(fetch(relayRoute.endpoint+'/models'),{message:'ACCEPTANCE_EGRESS_DENIED'})
  await assert.rejects(fetch('https://other.invalid',request(1)),{message:'ACCEPTANCE_EGRESS_DENIED'})
  await assert.rejects(fetch(url,{...request(1),headers:{authorization:'Bearer other'}}),{message:'ACCEPTANCE_EGRESS_DENIED'})
  assert.equal(signals.length,0)
  await fetch(loopback+'/health');await fetch(url,request(1))
  assert(existsSync(join(dir,'consumed-1')))
  await assert.rejects(fetch(url,request(1)),{message:'ACCEPTANCE_EGRESS_DENIED'})
  await fetch(url,request(2))
  assert(existsSync(join(dir,'consumed-2')))
  await assert.rejects(fetch(url,request(2)),{message:'ACCEPTANCE_EGRESS_DENIED'})
  assert.deepEqual(signals,[{url:loopback+'/health',redirect:'error'},{url,redirect:'error'},{url,redirect:'error'}])
})
