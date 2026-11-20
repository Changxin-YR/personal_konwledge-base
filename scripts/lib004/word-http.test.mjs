// Run with node --experimental-transform-types --test scripts/lib004/word-http.test.mjs.
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
import {WORD_MEDIA} from '../../packages/knowledgeos-panel/src/host/office-schema.ts'
import {acceptanceSamples} from './acceptance-samples.mjs'

test('Word intake through HTTP: authenticated version download, media-bound replay and no cross-account access',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-word-http-')),storage=new ProbeStorage({dataDir:dir}),identity=new IdentityService(storage)
  let origin='';const handler=libraryHandler(storage.assets,new PdfOriginals(join(dir,'originals')),()=>origin,req=>identity.actor(req.headers.authorization??''))
  const server=createServer(handler),password='Synthetic password 2026!'
  try{
    await identity.bootstrap({loginName:'owner',displayName:'Owner',password});await identity.register({loginName:'peer',displayName:'Peer',password})
    const token=async loginName=>(await identity.login({loginName,password,source:'isolated'})).token
    const owner=await token('owner'),other=await token('peer');await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port
    const key=randomUUID(),files=acceptanceSamples(),word=files['a08-v1.docx']
    const upload=(body,media,k=key)=>fetch(origin+'/knowledge/v1/imports',{method:'POST',headers:{authorization:owner,'x-knowledgeos-request':'1','idempotency-key':k,'x-knowledgeos-filename':'example.docx','content-type':media},body})
    const res=await upload(word,WORD_MEDIA.docx);assert.equal(res.status,201);const {data}=await res.json();assert.equal(data.media_type,WORD_MEDIA.docx)
    assert.equal((await upload(word,WORD_MEDIA.docx)).status,200);assert.equal((await upload(Buffer.from('other media'),'text/plain')).status,409)
    assert.equal((await upload(files['a08-reference.pdf'],WORD_MEDIA.docx,randomUUID())).status,422)
    const path=origin+`/knowledge/v1/assets/${data.id}/versions/${data.version_id}/original`,get=(token,download=true)=>fetch(path+(download?'?download=1':''),{headers:token?{authorization:token}:{}})
    assert.equal((await get(null)).status,401);assert.equal((await get(other)).status,404);assert.equal((await get(owner,false)).status,422)
    const result=await get(owner);assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),WORD_MEDIA.docx);assert.deepEqual(Buffer.from(await result.arrayBuffer()),word)
    const list=await fetch(origin+'/knowledge/v1/assets',{headers:{authorization:owner}});assert.equal((await list.json()).data.items.length,1)
  }finally{if(server.listening)await new Promise(r=>server.close(r));await identity.close();storage.close()}
})
