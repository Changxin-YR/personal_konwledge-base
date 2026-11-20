import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {randomUUID} from 'node:crypto'
import test from 'node:test'
import {libraryHandler} from '../../packages/knowledgeos-panel/src/host/library-http.ts'

test('a PDF keeps its transfer reservation until finish or close, and releases it only once',async()=>{
  const host='127.0.0.1:3000',req={headers:{host},method:'GET',url:`/knowledge/v1/assets/${randomUUID()}/versions/${randomUUID()}/original`}
  const store={original:()=>({key:'fixture',sha256:'fixture',byteLength:1})}, originals={read:async()=>Buffer.from('x')}
  const handler=libraryHandler(store,originals,()=>`http://${host}`,()=>({sessionId:'synthetic'}))
  async function get(){const res=Object.assign(new EventEmitter(),{setHeader(){},end(){}});await handler(req,res);return res}
  const one=await get(),two=await get();assert.equal(one.statusCode,200);assert.equal(two.statusCode,200);assert.equal((await get()).statusCode,429)
  one.emit('finish');one.emit('close');const three=await get();assert.equal(three.statusCode,200);assert.equal((await get()).statusCode,429)
  two.emit('close');assert.equal((await get()).statusCode,200);three.emit('finish')
})
