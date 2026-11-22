import assert from 'node:assert/strict'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'

const [candidate,entry]=process.argv.slice(2)
const host=await isolate(candidate,entry,{nativeEgressProbe:true})
try{
  const boot=await host.start()
  const result=await until(host.nativeResult,'native transport preflight',30_000)
  assert.equal(boot.pid,result.pid)
  console.log(JSON.stringify({...result,binding:host.facts,scope:'isolated_host_deny_only',live_acceptance:'BLOCKED'},null,2))
  assert.equal(result.status,'PASS')
}finally{await host.stop()}
