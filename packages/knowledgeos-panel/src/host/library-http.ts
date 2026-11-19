import {randomUUID} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {AssetError,type AssetStore,type ImportSpec} from './asset-store.ts'
import {PdfInputError,type PdfOriginals} from './pdf-originals.ts'
import type {SessionActor} from './identity.ts'

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const max=64*1024*1024
async function receive(req:IncomingMessage){
  const declared=req.headers['content-length'];if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>max))throw new AssetError(413,'FILE_TOO_LARGE')
  const chunks:Buffer[]=[];let count=0
  for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);count+=b.length;if(count>max)throw new AssetError(413,'FILE_TOO_LARGE');chunks.push(b)}
  if(!count)throw new AssetError(422,'INVALID_PDF');return Buffer.concat(chunks,count)
}
function specFor(req:IncomingMessage):ImportSpec {
  const key=req.headers['idempotency-key'], name=req.headers['x-knowledgeos-filename'],assetId=req.headers['x-knowledgeos-asset-id'],version=req.headers['x-knowledgeos-expected-version']
  if(typeof key!=='string'||!uuid.test(key)||typeof name!=='string'||name.length>2200)throw new AssetError(422,'INVALID_IMPORT')
  let title:string;try{title=decodeURIComponent(name).trim().normalize('NFC')}catch{throw new AssetError(422,'INVALID_FILENAME')}
  if(!title||title.length>200||/[\\/\x00-\x1f\x7f]/u.test(title))throw new AssetError(422,'INVALID_FILENAME')
  if(assetId===undefined&&version===undefined)return {title,key}
  if(typeof assetId!=='string'||!uuid.test(assetId)||typeof version!=='string'||!/^\d{1,9}$/.test(version)||Number(version)<1)throw new AssetError(422,'INVALID_VERSION')
  return {title,key,assetId,expectedVersion:Number(version)}
}

export function libraryHandler(store:AssetStore, originals:PdfOriginals, origin:()=>string|undefined,actorFor:(req:IncomingMessage)=>SessionActor|undefined){
  let transfers=0
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const requestId=randomUUID();let transfer=false
    res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff')
    const json=(status:number,payload:unknown)=>{if(!res.destroyed){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(payload))}}
    const reserve=()=>{if(transfers>=2)throw new AssetError(429,'TRANSFER_BUSY');transfers++;transfer=true}
    try{
      const host=origin();if(!host||req.headers.host!==new URL(host).host||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin!==undefined&&req.headers.origin!==host||req.method!=='GET'&&req.headers['x-knowledgeos-request']!=='1')throw new AssetError(403,'CSRF_REJECTED')
      const actor=actorFor(req);if(!actor)throw new AssetError(401,'AUTH_REQUIRED')
      const current=()=>{const a=actorFor(req);if(!a||a.sessionId!==actor.sessionId)throw new AssetError(401,'AUTH_REQUIRED');return a}
      const url=new URL(req.url??'/',host);if(url.origin!==host)throw new AssetError(403,'CSRF_REJECTED')
      if(req.method==='GET'&&url.pathname==='/knowledge/v1/assets'&&!url.search){json(200,{data:{items:store.list(actor)},request_id:requestId});return}
      if(req.method==='POST'&&url.pathname==='/knowledge/v1/imports'&&!url.search){
        if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/pdf')throw new AssetError(415,'PDF_REQUIRED')
        const spec=specFor(req);reserve();const bytes=await receive(req);current()
        const blob=await originals.put(bytes)
        // An uncertain COMMIT must never delete an original that might be referenced.
        // Unreferenced objects from a failed transaction remain private for safe reconciliation.
        let result:ReturnType<AssetStore['publish']>
        try {result=store.publish(current(),spec,blob)}catch(e){
          if(e instanceof AssetError)await originals.discard(blob.key);else originals.retain(blob.key)
          throw e
        }
        if(result.replayed){
          await originals.discard(blob.key)
          const old=store.original(current(),result.receipt.id,result.receipt.version_id,false)
          await originals.read(old.key,old.sha256,old.byteLength)
        }else originals.retain(blob.key)
        // A replay cleanup may have yielded; do not publish stale authorized metadata.
        store.original(current(),result.receipt.id,result.receipt.version_id,false)
        json(result.replayed?200:201,{data:result.receipt,request_id:requestId});return
      }
      const path=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/original$/.exec(url.pathname)
      if(req.method==='GET'&&path&&uuid.test(path[1]!)&&uuid.test(path[2]!)&&(!url.search||url.search==='?download=1')){
        reserve();const download=Boolean(url.search),original=()=>store.original(current(),path[1]!,path[2]!,download),r=original()
        const bytes=await originals.read(r.key,r.sha256,r.byteLength);original()
        res.statusCode=200;res.setHeader('content-type','application/pdf');res.setHeader('content-security-policy',"sandbox; default-src 'none'");res.setHeader('content-disposition',`${download?'attachment':'inline'}; filename="document.pdf"`);res.setHeader('content-length',bytes.length);res.end(bytes);return
      }
      throw new AssetError(404,'NOT_FOUND')
    }catch(e){const error=e instanceof AssetError?e:e instanceof PdfInputError?new AssetError(422,'INVALID_PDF'):new AssetError(503,'ORIGINAL_UNAVAILABLE');json(error.status,{code:error.code,message:error.code,request_id:requestId})}
    finally{if(transfer)transfers--}
  }
}
