// Isolated acceptance process only. No request input or production clock setting.
import assert from 'node:assert/strict'
import {appendFileSync,readFileSync} from 'node:fs'
import {IncomingMessage} from 'node:http'
import {isAbsolute,join} from 'node:path'

const file=process.env.KO_TEST_BUSINESS_CLOCK
assert(file&&isAbsolute(file)&&process.env.DSH_HOME)
const RealDate=Date
const current=()=>{
  const n=Number(readFileSync(file,'ascii'));assert(Number.isSafeInteger(n)&&n>=Date.UTC(2026,0,1));return n
}
globalThis.Date=new Proxy(RealDate,{
  construct(target,args,newTarget){return Reflect.construct(target,args.length?args:[current()],newTarget)},
  apply(){return new RealDate(current()).toString()},
  get(target,key,receiver){return key==='now'?current:Reflect.get(target,key,receiver)},
})

// Observe a body that has entered the real authenticated handler. The client
// holds its final bytes; no code in this hook changes the request or its time.
assert(process.env.KO_RUN&&isAbsolute(process.env.KO_RUN))
const iterator=IncomingMessage.prototype.iterator
IncomingMessage.prototype.iterator=function(options){
  const stream=iterator.call(this,options),label=this.headers['x-kos-test-arrival']
  if(this.method!=='POST'||this.url!=='/knowledge/v1/invitations/redeem'||typeof label!=='string'||!/^[a-f0-9]{32}$/.test(label))return stream
  const observe=event=>appendFileSync(join(process.env.KO_RUN,'invite-arrivals.jsonl'),JSON.stringify({label,event,at:current()})+'\n')
  return (async function*(){
    let first=true
    for await(const chunk of stream){if(first){observe('entered');first=false}yield chunk}
    observe('completed')
  })()
}
