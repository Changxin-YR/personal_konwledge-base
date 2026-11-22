import assert from 'node:assert/strict'
import {appendFileSync} from 'node:fs'
import {join} from 'node:path'

const origin=process.env.KO_TEST_LOOPBACK
assert.match(origin??'',/^http:\/\/127\.0\.0\.1:[1-9][0-9]+$/)
assert(process.env.KO_RUN)
const original=globalThis.fetch
globalThis.fetch=async (input,init)=>{
  const url=new URL(input instanceof Request?input.url:input)
  if(url.origin===origin&&!url.username&&!url.password)return original(input,{...init,redirect:'error'})
  const method=init?.method??(input instanceof Request?input.method:'GET')
  const labels=new Map([['GET /models','directory'],['POST /anthropic/v1/messages','messages'],['POST /anthropic/v1/files','files']])
  const route=url.origin==='https://api.deepseek.com'&&!url.search&&!url.username&&!url.password?labels.get(method+' '+url.pathname)??'other':'other'
  appendFileSync(join(process.env.KO_RUN,'native-blocked.jsonl'),JSON.stringify({route,outcome:'denied_before_dispatch'})+'\n')
  throw Error('ISOLATED_FETCH_DENIED')
}
