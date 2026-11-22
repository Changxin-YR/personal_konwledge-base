import type {IncomingMessage,ServerResponse} from 'node:http'
import {randomUUID} from 'node:crypto'
import type {SessionActor} from './identity.ts'
import type {InvitationSpec,InvitationStore} from './invitation-store.ts'
import {AssetError} from './asset-store.ts'

const path='/knowledge/v1/invitations',uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const invalid=()=>new AssetError(422,'INVALID_INVITATION')
function id(v:unknown){if(typeof v!=='string'||!uuid.test(v))throw invalid();return v}
function positive(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1)throw invalid();return v}
function optional(v:unknown){return v===undefined?undefined:positive(v)}
function keys(o:Record<string,unknown>,allowed:string[]){if(Object.keys(o).some(k=>!allowed.includes(k)))throw invalid()}
function spec(o:Record<string,unknown>):InvitationSpec{
  keys(o,['actor_id','scope','target_id','permission','days','max_redemptions'])
  const common={id:id(o.target_id),days:optional(o.days),max_redemptions:optional(o.max_redemptions)}
  if(o.scope==='object'&&(o.permission==='read'||o.permission==='edit'))return {...common,scope:o.scope,permission:o.permission}
  if(o.scope==='project'&&o.permission==='member')return {...common,scope:o.scope,permission:o.permission}
  throw invalid()
}
async function body(req:IncomingMessage){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
  if(Number(req.headers['content-length'])>8192)throw new AssetError(413,'BODY_TOO_LARGE')
  const chunks:Buffer[]=[];let size=0
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    const bytes=Buffer.from(chunk);size+=bytes.length;if(size>8192){req.resume();throw new AssetError(413,'BODY_TOO_LARGE')}
    chunks.push(bytes)
  }
  try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));if(!data||typeof data!=='object'||Array.isArray(data))throw invalid();return data as Record<string,unknown>}catch{throw invalid()}
}

export function createInvitationHandler(store:InvitationStore,origin:()=>string|undefined,actorFor:(req:IncomingMessage)=>SessionActor|undefined){
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const correlation=randomUUID()
    const send=(status:number,data:unknown)=>{if(!res.destroyed){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-knowledgeos-request-id':correlation});res.end(JSON.stringify(data))}}
    try{
      const base=origin(),method=req.method
      if(!base||req.headers.host!==new URL(base).host||req.headers['sec-fetch-site']==='cross-site'||
        req.headers.origin!==undefined&&req.headers.origin!==base||method!=='GET'&&req.headers['x-knowledgeos-request']!=='1')throw new AssetError(403,'CSRF_REJECTED')
      const url=new URL(req.url??'/',base);if(url.origin!==base)throw new AssetError(403,'CSRF_REJECTED');if(url.search)throw invalid()
      const a=actorFor(req);if(!a)throw new AssetError(401,'AUTH_REQUIRED')
      const p=url.pathname,row=/^\/knowledge\/v1\/invitations\/([a-f0-9-]+)(?:\/(renew|revoke))?$/.exec(p)
      const reply=(status:number,fields:object)=>send(status,{data:{actor_id:a.userId,...fields}})
      if(method==='GET'&&p===path)return reply(200,store.list(a))
      if(method==='GET'&&row&&!row[2])return reply(200,store.get(a,a.userId,id(row[1])))
      if(method==='POST'){
        const b=await body(req),expected=id(b.actor_id)
        if(p===path+'/preview')return reply(200,store.preview(a,expected,spec(b)))
        if(p===path){const created=store.create(a,expected,spec(b),id(req.headers['idempotency-key']),correlation);return reply(created.replayed?200:201,created)}
        if(p===path+'/redeem'){
          keys(b,['actor_id','token']);if(typeof b.token!=='string')throw invalid()
          const redeemed=store.redeem(a,expected,b.token,correlation);return reply(redeemed.replayed?200:201,redeemed)
        }
        if(row?.[2]==='renew'||row?.[2]==='revoke'){
          keys(b,row[2]==='renew'?['actor_id','expected_revision','days']:['actor_id','expected_revision'])
          return reply(200,store.change(a,expected,id(row[1]),positive(b.expected_revision),row[2],optional(b.days),id(req.headers['idempotency-key']),correlation))
        }
      }
      throw new AssetError(404,'NOT_FOUND')
    }catch(e){send(e instanceof AssetError?e.status:503,{code:e instanceof AssetError?e.code:'STORAGE_UNAVAILABLE'})}
  }
}
