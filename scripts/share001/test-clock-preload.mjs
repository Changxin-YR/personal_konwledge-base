// Isolated acceptance process only. No request input or production clock setting.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {isAbsolute} from 'node:path'

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
