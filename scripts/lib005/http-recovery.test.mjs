import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {libraryHandler} from '../../packages/knowledgeos-panel/src/host/library-http.ts'
import {PdfOriginals} from '../../packages/knowledgeos-panel/src/host/pdf-originals.ts'
import {zip} from '../lib004/acceptance-samples.mjs'

test('HTTP retry resumes from the durable member boundary after a storage outage',async()=>{
  const root=mkdtempSync(join(tmpdir(),'kos-zip-http-')),password='Synthetic password 2026!'
  let origin,storage,identity,server,owner,peer
  async function start(fail){
    storage=new ProbeStorage({dataDir:root});identity=new IdentityService(storage)
    const originals=new PdfOriginals(join(root,'originals'))
    if(fail){const put=originals.putText.bind(originals);let writes=0;originals.putText=async bytes=>{if(++writes===2)throw new Error('simulated unavailable volume');return put(bytes)}}
    const handler=libraryHandler(storage.assets,originals,()=>origin,req=>identity.actor(req.headers.authorization??''),storage.parses,storage.office,()=>false,storage.archives)
    server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port
  }
  const stop=async()=>{await new Promise(r=>server.close(r));await identity.close();storage.close()}
  const req=(path,{who=owner,body,headers}={})=>fetch(origin+'/knowledge/v1/'+path,{method:body?'POST':'GET',headers:{authorization:who,'x-knowledgeos-request':'1',...headers},body})
  try{
    await start(true);await identity.bootstrap({loginName:'owner',displayName:'Owner',password});await identity.register({loginName:'peer',displayName:'Peer',password})
    owner=(await identity.login({loginName:'owner',password,source:'test'})).token;peer=(await identity.login({loginName:'peer',password,source:'test'})).token
    const body=zip({'a.txt':'first','b.md':'# second','bad.pdf':'not a PDF','skip.txt':'never selected'})
    const headers={'idempotency-key':randomUUID(),'x-knowledgeos-filename':'sample.zip','content-type':'application/zip'}
    const staged=await req('imports',{body,headers});assert.equal(staged.status,201);const {data:m}=await staged.json();assert.equal(m.entries.length,4)
    assert.equal((await req('imports',{body,headers})).status,200);assert.deepEqual((await (await req('assets')).json()).data.items,[])
    const path=`imports/${m.id}`,key=randomUUID(),ids=m.entries.slice(0,3).map(e=>e.id)
    const select=(who=owner,k=key,entry_ids=ids)=>req(path+'/selection',{who,body:JSON.stringify({entry_ids}),headers:{'idempotency-key':k,'content-type':'application/json'}})
    assert.equal((await select(peer)).status,404);assert.equal((await req(path+'/entries',{who:peer})).status,404);assert.deepEqual((await (await req('imports',{who:peer})).json()).data.items,[])
    const failed=await select();assert.equal(failed.status,503);assert.equal((await failed.json()).code,'ORIGINAL_UNAVAILABLE')
    const status=async()=>(await(await req(path+'/entries')).json()).data.entries
    const partial=await status();assert.deepEqual(partial.map(x=>x.state),['imported','selected','selected','available']);const receipt=partial[0].receipt
    await stop();await start(false);assert.deepEqual((await status())[0].receipt,receipt)
    assert.equal((await select()).status,200);const entries=await status();assert.deepEqual(entries.map(x=>x.state),['imported','imported','failed','available']);assert.equal(entries[2].error,'INVALID_PDF')
    assert.equal((await select()).status,200);assert.deepEqual(await status(),entries);assert.equal((await select(owner,key,ids.slice(0,1))).status,409)
    const list=(await(await req('assets')).json()).data.items;assert.equal(list.length,2)
    for(const [i,text] of ['first','# second'].entries()){const r=entries[i].receipt;assert.equal(await(await req(`assets/${r.id}/versions/${r.version_id}/original?download=1`)).text(),text)}
  }finally{if(server?.listening)await stop()}
})
