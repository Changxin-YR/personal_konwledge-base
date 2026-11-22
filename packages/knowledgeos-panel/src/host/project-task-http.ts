import type { IncomingMessage, ServerResponse } from 'node:http'
import { AssetError } from './asset-store.ts'
import { UUID_PATTERN } from './http.ts'
import type { SessionActor } from './identity.ts'
import type { TaskCriteria, TaskDraft } from './project-task-policy.ts'
import type { ProjectTaskStore } from './project-task-store.ts'

export const taskApi = '/knowledge/v1/project-tasks'
const invalid = () => new AssetError(422,'INVALID_TASK_INPUT')
const id = (v:unknown) => { if(typeof v!=='string'||!UUID_PATTERN.test(v))throw invalid();return v }
const text = (v:unknown) => { if(typeof v!=='string')throw invalid();return v }
const object = (v:unknown,fields:string[]) => {
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.includes(k)))throw invalid()
  return v as Record<string,unknown>
}
const limit = 80_000
async function body(req:IncomingMessage,fields:string[]) {
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
  if(Number(req.headers['content-length'])>limit)throw new AssetError(413,'BODY_TOO_LARGE')
  const chunks:Buffer[]=[];let size=0
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    size+=chunk.length;if(size>limit){req.resume();throw new AssetError(413,'BODY_TOO_LARGE')}chunks.push(chunk)
  }
  let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)))}catch{throw invalid()}
  return object(parsed,fields)
}
const criteria = (value:unknown):TaskCriteria => {
  const c=object(value,['items','submission_rule'])
  if(c.submission_rule!=='next_submission'||!Array.isArray(c.items)||c.items.length>20)throw invalid()
  return {submission_rule:c.submission_rule,items:c.items.map(value=>{
    const row=object(value,['description','weight']);if(typeof row.weight!=='number')throw invalid()
    return {description:text(row.description),weight:row.weight}
  })}
}

export function createProjectTaskHandler(store:ProjectTaskStore,origin:()=>string|undefined,actorFor:(req:IncomingMessage)=>SessionActor|undefined) {
  return async (req:IncomingMessage,res:ServerResponse)=>{
    const send=(status:number,payload:unknown)=>{if(!res.destroyed){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload))}}
    try {
      const base=origin(),method=req.method
      if(!base||req.headers.host!==new URL(base).host||req.headers['sec-fetch-site']==='cross-site'||
        req.headers.origin!==undefined&&req.headers.origin!==base||method!=='GET'&&req.headers['x-knowledgeos-request']!=='1')throw new AssetError(403,'CSRF_REJECTED')
      const url=new URL(req.url??'/',base)
      if(url.origin!==base)throw new AssetError(403,'CSRF_REJECTED')
      const a=actorFor(req);if(!a)throw new AssetError(401,'AUTH_REQUIRED')
      const sendData=(status:number,value:object)=>send(status,{data:{actor_id:a.userId,...value}})
      const path=url.pathname
      if(path===taskApi&&method==='GET'){
        if(!url.search)return sendData(200,{tasks:store.list(a,null)})
        if(url.searchParams.size!==1||!url.searchParams.has('project_id'))throw invalid()
        return sendData(200,{tasks:store.list(a,id(url.searchParams.get('project_id')))})
      }
      if(url.search)throw invalid()
      if(path===taskApi+'/projects'&&method==='GET')return sendData(200,{projects:store.projects(a)})
      const project=/^\/knowledge\/v1\/project-tasks\/projects\/([^/]+)\/members$/.exec(path)
      if(project&&method==='GET')return sendData(200,{project:store.members(a,id(project[1]))})
      if(project&&method==='POST'){
        const input=await body(req,['actor_id','remove_member_id'])
        return sendData(200,store.removeMember(a,id(input.actor_id),id(project[1]),id(input.remove_member_id)))
      }
      if(path===taskApi&&method==='POST'){
        const input=await body(req,['actor_id','project_id','title','goal','due_at','assignee_id','final_reviewer_id','peer_reviewer_id','criteria'])
        const draft:TaskDraft={title:text(input.title),goal:text(input.goal),due_at:text(input.due_at),assignee_id:id(input.assignee_id),
          final_reviewer_id:id(input.final_reviewer_id),criteria:criteria(input.criteria)}
        if('peer_reviewer_id' in input)draft.peer_reviewer_id=id(input.peer_reviewer_id)
        const result=store.assign(a,id(input.actor_id),input.project_id===null?null:id(input.project_id),id(req.headers['idempotency-key']),draft)
        return sendData(result.replayed?200:201,result)
      }
      const task=/^\/knowledge\/v1\/project-tasks\/([^/]+)$/.exec(path)
      if(task&&method==='GET')return sendData(200,{task:store.get(a,id(task[1]))})
      if(task&&method==='PATCH'){
        const input=await body(req,['actor_id','expected_revision','criteria'])
        if(typeof input.expected_revision!=='number')throw invalid()
        return sendData(200,{task:store.revise(a,id(input.actor_id),id(task[1]),input.expected_revision,criteria(input.criteria))})
      }
      throw new AssetError(404,'NOT_FOUND')
    }catch(e){send(e instanceof AssetError?e.status:503,{code:e instanceof AssetError?e.code:'STORAGE_UNAVAILABLE'})}
  }
}
