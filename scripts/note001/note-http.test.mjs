import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {createNoteHandler} from '../../packages/knowledgeos-panel/src/host/note-http.ts'

test('note route rejects forged identity and stale revisions and does not expose private notes via projects',async()=>{
  const storage=new ProbeStorage({dataDir:mkdtempSync(join(tmpdir(),'kos-note-http-'))}),identity=new IdentityService(storage)
  const password='Notes HTTP test password!',ownerInput={loginName:'owner',displayName:'Owner',password},peerInput={loginName:'peer',displayName:'Peer',password}
  let origin
  const server=createServer(createNoteHandler(storage.notes,()=>origin,req=>identity.actor(req.headers.authorization??'')))
  try{
    await identity.bootstrap(ownerInput);await identity.register(peerInput)
    const owner=(await identity.login({...ownerInput,source:'http'})).token,peer=(await identity.login({...peerInput,source:'http'})).token
    const actor=identity.actor(owner),reader=identity.actor(peer),now=new Date().toISOString()
    const project=storage.createProject({id:randomUUID(),serviceId:actor.serviceId,ownerUserId:actor.userId,name:'Fixture',now})
    storage.addProjectMembership({projectId:project.id,userId:reader.userId,role:'member',validFrom:now})
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));origin=`http://127.0.0.1:${server.address().port}`
    const req=async(status,path='',method='GET',body,authorization=owner,extra={})=>{
      const response=await fetch(origin+'/knowledge/v1/notes'+path,{method,body:body===undefined?undefined:JSON.stringify(body),
        headers:{authorization,'content-type':'application/json','x-knowledgeos-request':'1',...extra}})
      const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));assert.equal(response.headers.get('cache-control'),'no-store');return result
    }
    const key={'idempotency-key':randomUUID()},draft={actor_id:actor.userId,title:'Private',body:'Original contribution',kind:'project'}
    assert.equal((await req(401,'','GET',undefined,'')).code,'AUTH_REQUIRED')
    await req(403,'','POST',draft,owner,{...key,origin:'https://example.invalid'})
    await req(403,'','POST',draft,owner,{...key,'x-knowledgeos-request':'0'})
    await req(409,'','POST',{...draft,actor_id:reader.userId},owner,key)
    await req(422,'','POST',{...draft,owner_user_id:reader.userId},owner,key)
    await req(422,'','POST',{...draft,title:null},owner,key)
    const {data:note}=await req(201,'','POST',draft,owner,key)
    assert.deepEqual((await req(200,'','POST',draft,owner,key)).data,note)
    assert.equal((await req(200)).data.items[0].body,undefined)
    await req(422,'?after='+note.id+'&after='+note.id)
    const path='/'+note.id,patch={actor_id:actor.userId,expected_revision:1,body:'Now edited'}
    assert.equal((await req(200,path,'PATCH',patch)).data.revision,2)
    assert.equal((await req(409,path,'PATCH',{...patch,body:'Stale change'})).code,'REVISION_CONFLICT')
    assert.equal((await req(200,path)).data.body,'Now edited')
    assert.equal((await req(404,path,'GET',undefined,peer)).data,undefined)
    const proj='/projects/'+project.id,link={actor_id:actor.userId,note_id:note.id}
    assert.equal((await req(201,proj,'POST',link)).data.replayed,false)
    assert.equal((await req(200,proj,'POST',link)).data.replayed,true)
    assert.equal((await req(200,proj)).data.items[0].id,note.id)
    assert.deepEqual((await req(200,proj,'GET',undefined,peer)).data.items,[])
    await req(404,proj,'POST',{actor_id:reader.userId,note_id:note.id},peer)
  }finally{
    if(server.listening)await new Promise(ok=>server.close(ok));await identity.close();storage.close()
  }
})
