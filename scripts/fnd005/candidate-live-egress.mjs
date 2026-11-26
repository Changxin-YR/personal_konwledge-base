import assert from 'node:assert/strict'
import {existsSync,readFileSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {bodies,priceApproval,sha,tools,uuid} from './candidate-live-guards.mjs'

export const credentialAlias='KOS_TOKEASE_ACCEPTANCE_KEY'
export const relayRoute={provider:'tokease',model:'deepseek-v4.1-flash-1017',endpoint:'https://tokease.cn/v1'}
const completionUrl=relayRoute.endpoint+'/chat/completions'
const fields=new Set(['model','messages','stream','stream_options','store','max_tokens','max_completion_tokens','tools','n','thinking'])
const systemHash='7d4db3505e930091bda89d1ca41f1da3d6deb5621afd82637a8efe84745771e6'
const toolHashes=['2505b8f74a8d909f87626d46026afc75854e56db751770ddb0b141d0e53ad0b6','eda009992aede8e270b4bf3c4b740ad3acc7c31c43d3910908a53dc6f626c8b1']

export function instructionFor(step) {
  return step===1?'Read this object.':'Set only the body to exactly: '+bodies[1]
}

export function makePermit(candidate,route,step,objectId,now=Date.now()) {
  return {candidate,route,step,objectId,expiresAt:now+30_000}
}

function contentText(content) {
  if(typeof content==='string')return content
  assert(Array.isArray(content) && content.length===1)
  const part=content[0]
  assert.deepEqual(Object.keys(part).sort(),['text','type'])
  assert(part.type==='text' && typeof part.text==='string')
  return part.text
}

const canonical=value=>JSON.stringify(value,(_key,object)=>object&&typeof object==='object'&&!Array.isArray(object)
  ?Object.fromEntries(Object.keys(object).sort().map(key=>[key,object[key]]))
  :object)

export function authorizeCompletion({url,method,body,permit,approval,candidate,step,now=Date.now()}) {
  assert(url===completionUrl && method==='POST')
  assert(permit.candidate===candidate && /^[a-f0-9]{40}$/.test(candidate))
  assert.deepEqual(permit.route,relayRoute)
  assert((step===1||step===2) && permit.step===step && uuid.test(permit.objectId))
  assert(Number.isSafeInteger(permit.expiresAt) && permit.expiresAt>now && permit.expiresAt<=now+30_000)
  priceApproval(approval,relayRoute,now)
  assert(typeof body==='string' && Buffer.byteLength(body,'utf8')<=4096)
  const p=JSON.parse(body)
  assert(Object.keys(p).every(k=>fields.has(k)))
  assert(p.model===relayRoute.model && p.stream===true && (p.n===undefined||p.n===1))
  if(p.stream_options!==undefined)assert.deepEqual(p.stream_options,{include_usage:true})
  if(p.store!==undefined)assert.equal(p.store,false)
  if(p.thinking!==undefined)assert.deepEqual(p.thinking,{type:'disabled'})
  const tokens=[p.max_tokens,p.max_completion_tokens].filter(n=>n!==undefined)
  assert(tokens.length>0 && tokens.every(n=>Number.isInteger(n)&&n>=1&&n<=512))
  assert(Array.isArray(p.messages) && p.messages.length===2)
  const [system,user]=p.messages
  assert.deepEqual(Object.keys(system).sort(),['content','role'])
  assert.deepEqual(Object.keys(user).sort(),['content','role'])
  assert((system.role==='system'||system.role==='developer') && sha(contentText(system.content))===systemHash)
  assert.equal(user.role,'user')
  assert.deepEqual(JSON.parse(contentText(user.content)),{instruction:instructionFor(step),target_object_id:permit.objectId,expected_revision:1})
  assert(Array.isArray(p.tools) && p.tools.length===tools.length)
  for(const [index,tool] of p.tools.entries()) {
    assert.deepEqual(Object.keys(tool).sort(),['function','type'])
    assert.equal(tool.type,'function')
    const {name,description,parameters,strict}=tool.function
    assert(Object.keys(tool.function).every(key=>['name','description','parameters','strict'].includes(key)))
    assert(name===tools[index] && (strict===false||strict===undefined))
    assert.equal(sha(canonical({name,description,parameters})),toolHashes[index])
  }
}

export function guardedFetch(baseFetch,env) {
  const {KO_TEST_LOOPBACK:loopback,KO_RUN:dir,KO_BOUND_CANDIDATE:candidate}=env
  assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]+$/.test(loopback??'') && dir && candidate)
  let dispatches=0
  const path=name=>join(dir,name)
  const json=name=>JSON.parse(readFileSync(path(name),'utf8'))
  return async (input,init={})=>{
    const url=new URL(input instanceof Request?input.url:input)
    if(url.origin===loopback&&!url.username&&!url.password)return baseFetch(input,{...init,redirect:'error'})
    try {
      assert(env.KO_MODE==='live' && dispatches<2)
      const step=dispatches+1
      assert(existsSync(path('armed-'+step)))
      const auth=new Headers(init.headers??(input instanceof Request?input.headers:undefined)).get('authorization')
      assert(env[credentialAlias] && auth==='Bearer '+env[credentialAlias])
      authorizeCompletion({url:url.href,method:init.method??(input instanceof Request?input.method:'GET'),body:init.body,permit:json('permit-'+step),approval:json('approved.json'),candidate,step})
      renameSync(path('permit-'+step),path('consumed-'+step))
      dispatches++
    }catch{throw Error('ACCEPTANCE_EGRESS_DENIED')}
    return baseFetch(input,{...init,redirect:'error'})
  }
}

if(process.env.KO_TOKEASE_CONFINED==='1')globalThis.fetch=guardedFetch(globalThis.fetch,process.env)
