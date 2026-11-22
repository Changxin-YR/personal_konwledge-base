import type {IncomingMessage,ServerResponse} from 'node:http'
import {AssetError} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import {noteId,noteKinds,noteText,noteLimits,type NoteDraft,type NotePatch} from './note-input.ts'
import type {OutlineAction} from './note-outline.ts'
import type {NoteStore} from './note-store.ts'

const prefix='/knowledge/v1/notes', limit=200_000
const invalid=()=>new AssetError(422,'INVALID_NOTE')
const id=(value:unknown):string=>{if(typeof value!=='string'||!noteId.test(value))throw invalid();return value}
const keys=(body:Record<string,unknown>,allowed:string[])=>{
  if(Object.keys(body).some(k=>!allowed.includes(k)))throw invalid()
}
async function jsonBody(req:IncomingMessage):Promise<Record<string,unknown>>{
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
  const parts:Buffer[]=[];let size=0
  if(Number(req.headers['content-length'])>limit)throw new AssetError(413,'BODY_TOO_LARGE')
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    const part=Buffer.from(chunk);size+=part.length;if(size>limit){req.resume();throw new AssetError(413,'BODY_TOO_LARGE')}parts.push(part)
  }
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,size)))}catch{throw invalid()}
  if(!body||typeof body!=='object'||Array.isArray(body))throw invalid()
  return body
}
function fields(input:Record<string,unknown>,all:boolean){
  const patch:Partial<NoteDraft>={}
  if(all||'title' in input){if(!noteText(input.title,noteLimits.title))throw invalid();patch.title=input.title as string}
  if(all||'body' in input){if(!noteText(input.body,noteLimits.body))throw invalid();patch.body=input.body as string}
  if(all||'kind' in input){if(!noteKinds.includes(input.kind as NoteDraft['kind']))throw invalid();patch.kind=input.kind as NoteDraft['kind']}
  return patch
}

function outlineAction(input:Record<string,unknown>):OutlineAction{
  const common=['actor_id','expected_revision','action']
  switch(input.action){
    case 'add':
    case 'edit':{
      const action=input.action,target=action==='add'?'parent_id':'node_id'
      keys(input,[...common,target,'body'])
      if(!noteText(input.body,noteLimits.body))throw invalid()
      const body=input.body as string
      return action==='add'?{action,parent_id:id(input[target]),body}:{action,node_id:id(input[target]),body}
    }
    case 'move':
      keys(input,[...common,'node_id','parent_id','index'])
      if(typeof input.index!=='number')throw invalid()
      return {action:'move',node_id:id(input.node_id),parent_id:id(input.parent_id),index:input.index}
    case 'delete':
      keys(input,[...common,'node_id','mode','preview_token'])
      if(input.mode!=='subtree'&&input.mode!=='promote')throw invalid()
      if(typeof input.preview_token!=='string'||!/^[a-f0-9]{64}$/.test(input.preview_token))throw invalid()
      return {action:'delete',node_id:id(input.node_id),mode:input.mode,preview_token:input.preview_token}
    case 'undo':
      keys(input,common);return {action:'undo'}
    default:throw invalid()
  }
}

export function createNoteHandler(store:NoteStore,origin:()=>string|undefined,actorFor:(req:IncomingMessage)=>SessionActor|undefined){
  return async (req:IncomingMessage,res:ServerResponse)=>{
    const send=(status:number,data:unknown)=>{
      if(res.destroyed)return
      res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))
    }
    try{
      const base=origin(), method=req.method
      if(!base||req.headers.host!==new URL(base).host || req.headers['sec-fetch-site']==='cross-site' ||
        req.headers.origin!==undefined&&req.headers.origin!==base || method!=='GET'&&req.headers['x-knowledgeos-request']!=='1')throw new AssetError(403,'CSRF_REJECTED')
      const url=new URL(req.url??'/',base), path=url.pathname
      if(url.origin!==base)throw new AssetError(403,'CSRF_REJECTED')
      const actor=actorFor(req);if(!actor)throw new AssetError(401,'AUTH_REQUIRED')
      const info={actor_id:actor.userId}, row=/^\/knowledge\/v1\/notes\/([^/]+)$/.exec(path), project=/^\/knowledge\/v1\/notes\/projects\/([^/]+)$/.exec(path)
      const cursor=()=>{
        if([...url.searchParams].length===0)return ''
        if([...url.searchParams].length!==1||!url.searchParams.has('after'))throw invalid()
        return id(url.searchParams.get('after'))
      }
      if(method==='GET'&&path===prefix)return send(200,{data:{...info,...store.list(actor,cursor())}})
      if(method==='GET'&&path===prefix+'/projects')return send(200,{data:{...info,...store.managedProjects(actor,cursor())}})
      if(method==='GET'&&project)return send(200,{data:{...info,...store.projectRefs(actor,id(project[1]),cursor())}})
      if(url.search)throw invalid()
      const outline=/^\/knowledge\/v1\/notes\/([^/]+)\/(nodes|delete-preview)$/.exec(path)
      if(outline&&((method==='PATCH'&&outline[2]==='nodes')||(method==='POST'&&outline[2]==='delete-preview'))){
        const input=await jsonBody(req),expected=id(input.actor_id),note=id(outline[1]),revision=input.expected_revision
        if(typeof revision!=='number')throw invalid()
        if(method==='PATCH')return send(200,{data:{...info,...store.changeOutline(actor,expected,note,revision,outlineAction(input))}})
        keys(input,['actor_id','expected_revision','node_id'])
        return send(200,{data:{...info,...store.previewDelete(actor,expected,note,revision,id(input.node_id))}})
      }
      if(method==='GET'&&row)return send(200,{data:{...info,...store.get(actor,id(row[1]))}})
      if(method==='POST'&&path===prefix){
        const input=await jsonBody(req);keys(input,['actor_id','title','body','kind','add_citation'])
        const saved=store.create(actor,id(input.actor_id),id(req.headers['idempotency-key']),fields(input,true) as NoteDraft,'add_citation' in input?id(input.add_citation):undefined)
        return send(saved.replayed?200:201,{data:{...info,...saved.data}})
      }
      if(method==='PATCH'&&row){
        const input=await jsonBody(req);keys(input,['actor_id','expected_revision','title','body','kind','add_citation','remove_reference'])
        const patch:NotePatch=fields(input,false)
        if('add_citation' in input)patch.add_citation=id(input.add_citation)
        if('remove_reference' in input)patch.remove_reference=id(input.remove_reference)
        if(typeof input.expected_revision!=='number')throw invalid()
        return send(200,{data:{...info,...store.save(actor,id(input.actor_id),id(row[1]),input.expected_revision,patch)}})
      }
      if(method==='POST'&&project){
        const input=await jsonBody(req);keys(input,['actor_id','note_id'])
        const result=store.linkProject(actor,id(input.actor_id),id(project[1]),id(input.note_id))
        return send(result.replayed?200:201,{data:{...info,...result}})
      }
      throw new AssetError(404,'NOT_FOUND')
    }catch(e){send(e instanceof AssetError?e.status:503,{code:e instanceof AssetError?e.code:'STORAGE_UNAVAILABLE'})}
  }
}
