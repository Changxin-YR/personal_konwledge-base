import type {IncomingMessage,ServerResponse} from 'node:http'
import {AssetError} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import type {RecallAction,RecallStore} from './recall-store.ts'

const basePath='/knowledge/v1/recall',uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/, limit=2*1024*1024
const invalid=()=>new AssetError(422,'INVALID_RECALL')
function id(x:unknown){if(typeof x!=='string'||!uuid.test(x))throw invalid();return x}
function integer(x:unknown,min=1){if(typeof x!=='number'||!Number.isSafeInteger(x)||x<min||x>=Number.MAX_SAFE_INTEGER)throw invalid();return x}
function object(x:unknown,keys:string[]):Record<string,unknown>{
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))throw invalid()
  return x as Record<string,unknown>
}
function hash(h:unknown){
  if(typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h))throw invalid()
  return h
}
function point(value:unknown){
  const v=object(value,['ordinal','offset','source_hash'])
  return {ordinal:integer(v.ordinal),offset:integer(v.offset,0),source_hash:hash(v.source_hash)}
}
function target(v:Record<string,unknown>){return {asset_id:id(v.asset_id),version_id:id(v.version_id),...('conversion_id' in v?{conversion_id:id(v.conversion_id)}:{})}}
async function json(req:IncomingMessage){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
  if(Number(req.headers['content-length'])>limit)throw new AssetError(413,'BODY_TOO_LARGE')
  const chunks:Buffer[]=[];let size=0
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    const b=Buffer.from(chunk);size+=b.length;if(size>limit){req.resume();throw new AssetError(413,'BODY_TOO_LARGE')}chunks.push(b)
  }
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)))}catch{throw invalid()}
}

export function createRecallHandler(store:RecallStore,origin:()=>string|undefined,actorFor:(req:IncomingMessage)=>SessionActor|undefined){
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const send=(http:number,data:unknown)=>{if(!res.destroyed){res.writeHead(http,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}}
    try{
      const base=origin(),method=req.method
      if(!base||req.headers.host!==new URL(base).host||req.headers['sec-fetch-site']==='cross-site'||
        req.headers.origin!==undefined&&req.headers.origin!==base||method!=='GET'&&req.headers['x-knowledgeos-request']!=='1')throw new AssetError(403,'CSRF_REJECTED')
      const url=new URL(req.url??'/',base);if(url.origin!==base)throw new AssetError(403,'CSRF_REJECTED')
      const actor=actorFor(req);if(!actor)throw new AssetError(401,'AUTH_REQUIRED')
      const path=url.pathname,q=url.searchParams, info={actor_id:actor.userId}
      if(new Set(q.keys()).size!==q.size)throw invalid()
      if(method==='GET'&&path===basePath+'/source'){
        const fields=object(Object.fromEntries(q),['asset_id','version_id','conversion_id','ordinal']),n=q.get('ordinal')
        if(n===null||!/^\d+$/.test(n))throw invalid()
        return send(200,{data:store.authorPage(actor,{...target(fields),ordinal:integer(Number(n))})})
      }
      if(method==='GET'&&path===basePath){
        if([...q.keys()].some(k=>k!=='after'))throw invalid()
        return send(200,{data:{...info,...store.list(actor,q.has('after')?id(q.get('after')):'')}})
      }
      if(q.size)throw invalid()
      if(method==='POST'&&path===basePath){
        const v=object(await json(req),['actor_id','asset_id','version_id','conversion_id','title','first','last','interior_hashes','masks'])
        if(typeof v.title!=='string'||v.title.includes('\0')||!Array.isArray(v.masks)||!Array.isArray(v.interior_hashes))throw invalid()
        const masks=v.masks.map(raw=>{const m=object(raw,['ordinal','start','end','group']);return {ordinal:integer(m.ordinal),start:integer(m.start,0),end:integer(m.end),group:integer(m.group)}})
        const saved=store.create(actor,id(v.actor_id),id(req.headers['idempotency-key']),{...target(v),title:v.title.trim(),first:point(v.first),last:point(v.last),interior_hashes:v.interior_hashes.map(hash),masks})
        return send(saved.replayed?200:201,{data:{...info,...saved.data}})
      }
      const row=/^\/knowledge\/v1\/recall\/([^/]+)$/.exec(path)
      if(row&&method==='GET')return send(200,{data:{...info,...store.get(actor,id(row[1]))}})
      if(row&&method==='PATCH'){
        const v=object(await json(req),['actor_id','event','value','expected_revision']),event=v.event
        if(event!=='move'&&event!=='hint'&&event!=='reveal'&&event!=='recall'&&event!=='rating')throw invalid()
        const action:RecallAction={event,value:integer(v.value),expected_revision:integer(v.expected_revision)}
        return send(200,{data:{...info,...store.act(actor,id(v.actor_id),id(row[1]),id(req.headers['idempotency-key']),action)}})
      }
      throw new AssetError(404,'NOT_FOUND')
    }catch(e){send(e instanceof AssetError?e.status:503,{code:e instanceof AssetError?e.code:'STORAGE_UNAVAILABLE'})}
  }
}
