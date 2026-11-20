import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {libraryHandler} from '../../packages/knowledgeos-panel/src/host/library-http.ts'
import {ReaderService} from '../../packages/knowledgeos-panel/src/host/reader-http.ts'
import {PdfOriginals} from '../../packages/knowledgeos-panel/src/host/pdf-originals.ts'
import {acceptanceSamples} from '../lib004/acceptance-samples.mjs'

test('HTTP citation is fixed to the old version and selected occurrence; no disclosure when rendering outlives authorization',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-reader-http-')),s=new ProbeStorage({dataDir:dir}),identity=new IdentityService(s),originals=new PdfOriginals(join(dir,'originals'))
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite')),password='Synthetic reading password!',gate=Promise.withResolvers(),release=Promise.withResolvers()
  // This renderer only creates a synchronization point. Its bytes are not evidence of PDFium rendering.
  const reader=new ReaderService(s.citations,originals,async()=>{gate.resolve();await release.promise;return {text:'page',image:'private test image',width:1,height:1,boxes:[]}})
  let origin,owner,peer;const handler=libraryHandler(s.assets,originals,()=>origin,req=>identity.actor(req.headers.authorization??''),s.parses,s.office,()=>false,s.archives,reader),server=createServer(handler)
  const req=(path,who=owner,body,headers={})=>fetch(origin+'/knowledge/v1/'+path,{method:body!==undefined?'POST':'GET',headers:{authorization:who,'x-knowledgeos-request':'1',...headers},body})
  const json=async(response,status)=>{const r=await response;assert.equal(r.status,status);return r.json()}
  const post=(name,media,body,h={})=>req('imports',owner,body,{'content-type':media,'x-knowledgeos-filename':name,'idempotency-key':randomUUID(),...h})
  try{
    await identity.bootstrap({loginName:'owner',displayName:'Owner',password});await identity.register({loginName:'peer',displayName:'Peer',password})
    const login=async loginName=>(await identity.login({loginName,password,source:'test'})).token;owner=await login('owner');peer=await login('peer')
    await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port
    const text='same same',r=(await json(post('notes.txt','text/plain',text),201)).data,path=`assets/${r.id}/versions/${r.version_id}/reader`
    const window=(await json(req(path+'?unit=1'),200)).data;assert.equal(window.text,text);assert.equal(window.total,1);assert.equal(window.kind,'text');assert.equal(window.anchor,createHash('sha256').update(text).digest('hex'));assert(!('ref' in window))
    await json(req(path+'?unit=1&unit=2'),422);await json(req(path+'?unit=2'),422);await json(req(path,peer),404);await json(req(path,''),401)
    const spec={asset_id:r.id,version_id:r.version_id,ordinal:1,start:5,end:9,source_hash:window.anchor},key=randomUUID(),create=(v,k=key)=>req('citations',owner,JSON.stringify(v),{'content-type':'application/json','idempotency-key':k})
    for(const extra of [{actor:'someone'},{text},{image:'untrusted'}])await json(create({...spec,...extra}),422)
    const c=(await json(create(spec),201)).data;assert.deepEqual((await json(create(spec),200)).data,c);await json(create({...spec,start:0,end:4}),409)
    const resolve=`citations/${c.id}/resolve`;await json(req(resolve,peer),404);await json(req(resolve,''),401)
    await json(post('notes.txt','text/plain','a replacement',{'x-knowledgeos-asset-id':r.id,'x-knowledgeos-expected-version':'1'}),201)
    assert.deepEqual((await json(req(resolve),200)).data,{...c,quote:'same'})
    const pdf=(await json(post('source.pdf','application/pdf',acceptanceSamples()['a08-reference.pdf']),201)).data,version=pdf.version_id,route=`assets/${pdf.id}/versions/${version}/reader`
    const idle=(await json(req(route),200)).data;assert.equal(idle.state,'idle');assert(!Object.hasOwn(idle,'image'))
    const actor=identity.actor(owner);db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state,total) VALUES(?,?,?,'complete',1)").run(version,actor.sessionId,actor.userId)
    db.prepare("INSERT INTO pdf_pages(version_id,page,state,text) VALUES(?,1,'ready','page')").run(version)
    const pending=req(route);await gate.promise;db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').run(new Date().toISOString(),actor.sessionId);release.resolve()
    const denied=await json(pending,401);assert(!('data' in denied));assert(!JSON.stringify(denied).includes('private test image'))
  }finally{release.resolve();if(server.listening)await new Promise(r=>server.close(r));await identity.close();s.close();db.close()}
})
