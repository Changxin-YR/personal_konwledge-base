import {randomUUID} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {AssetError,type AssetStore,type ImportSpec,type IndexedText} from './asset-store.ts'
import {PdfInputError,type PdfOriginals} from './pdf-originals.ts'
import type {SessionActor} from './identity.ts'
import type {ParseStore} from './parse-store.ts'
import {decodeText,TextInputError,MAX_BYTES as textLimit} from './text-document.ts'
import {isWordMedia,WordInputError} from './word-original.ts'
import {WORD_MEDIA} from './office-schema.ts'
import type {OfficeStore} from './office-store.ts'
import type {ZipStore} from './zip-store.ts'
import {readerRoute,type ReaderService} from './reader-http.ts'
import {inspectZip,preflightZipSelection,readZipMember,ZipInputError} from './zip-reader.ts'

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const max=64*1024*1024
async function processInput(req:IncomingMessage){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
  let count=0;const parts:Buffer[]=[]
  for await(const chunk of req){const b=Buffer.from(chunk);count+=b.length;if(count>1024)throw new AssetError(413,'BODY_TOO_LARGE');parts.push(b)}
  let value;try{value=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw new AssetError(422,'INVALID_PROCESS')}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version_id','page'].includes(k))||typeof value.version_id!=='string'||!uuid.test(value.version_id)||('page' in value&&(!Number.isSafeInteger(value.page)||value.page<1||value.page>10000)))throw new AssetError(422,'INVALID_PROCESS')
  return value as {version_id:string,page?:number}
}
async function receive(req:IncomingMessage,emptyCode:string,limit:number){
  const declared=req.headers['content-length'];if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw new AssetError(413,'FILE_TOO_LARGE')
  const chunks:Buffer[]=[];let count=0
  for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);count+=b.length;if(count>limit)throw new AssetError(413,'FILE_TOO_LARGE');chunks.push(b)}
  if(!count)throw new AssetError(422,emptyCode);return Buffer.concat(chunks,count)
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

function inputError(e:unknown){
  if(e instanceof TextInputError)return new AssetError(e.code==='TEXT_TOO_LARGE'?413:422,e.code)
  if(e instanceof WordInputError)return new AssetError(422,'INVALID_WORD')
  if(e instanceof PdfInputError)return new AssetError(422,'INVALID_PDF')
  if(e instanceof ZipInputError)return new AssetError(e.code==='ZIP_LIMIT_EXCEEDED'?413:422,e.code)
}

async function publishInput(store:AssetStore,originals:PdfOriginals,current:()=>SessionActor,spec:ImportSpec,bytes:Buffer,media:string,encoding?:string,hook?:Parameters<AssetStore['publish']>[4]){
  const word=isWordMedia(media),isText=media==='text/plain'||media==='text/markdown'
  if(!isText&&!word&&media!=='application/pdf')throw new AssetError(415,'UNSUPPORTED_MEDIA_TYPE')
  const text:IndexedText|undefined=isText?{media,...decodeText(bytes,media,encoding)}:undefined
  const blob=text?await originals.putText(bytes):word?await originals.putWord(bytes,media):await originals.put(bytes)
  let result:ReturnType<AssetStore['publish']>
  try{result=store.publish(current(),spec,blob,word?{media}:text,hook)}catch(e){
    if(e instanceof AssetError)await originals.discard(blob.key);else originals.retain(blob.key)
    throw e
  }
  if(result.replayed){
    await originals.discard(blob.key);const old=store.original(current(),result.receipt.id,result.receipt.version_id,false)
    await originals.read(old.key,old.sha256,old.byteLength)
  }else originals.retain(blob.key)
  store.original(current(),result.receipt.id,result.receipt.version_id,false)
  return result
}

export function libraryHandler(store:AssetStore, originals:PdfOriginals, origin:()=>string|undefined,actorFor:(req:IncomingMessage)=>SessionActor|undefined, parses?:ParseStore, office?:OfficeStore,officeAvailable=()=>true,archives?:ZipStore,reader?:ReaderService){
  let transfers=0
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const requestId=randomUUID();let transfer=false,handlerDone=false,responseDone=false
    res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff')
    const json=(status:number,payload:unknown)=>{if(!res.destroyed){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(payload))}}
    const release=()=>{if(transfer&&handlerDone&&responseDone){transfers--;transfer=false}}
    const reserve=()=>{if(transfers>=2)throw new AssetError(429,'TRANSFER_BUSY');transfers++;transfer=true
      const sent=()=>{responseDone=true;res.off('finish',sent);res.off('close',sent);release()};res.once('finish',sent);res.once('close',sent);if(res.destroyed||res.writableFinished)sent()}
    try{
      const host=origin();if(!host||req.headers.host!==new URL(host).host||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin!==undefined&&req.headers.origin!==host||req.method!=='GET'&&req.headers['x-knowledgeos-request']!=='1')throw new AssetError(403,'CSRF_REJECTED')
      const actor=actorFor(req);if(!actor)throw new AssetError(401,'AUTH_REQUIRED')
      const current=()=>{const a=actorFor(req);if(!a||a.sessionId!==actor.sessionId)throw new AssetError(401,'AUTH_REQUIRED');return a}
      const url=new URL(req.url??'/',host);if(url.origin!==host)throw new AssetError(403,'CSRF_REJECTED')
      if(reader&&(url.pathname.endsWith('/reader')||url.pathname.startsWith('/knowledge/v1/citations'))){
        const ac=new AbortController(),stop=()=>ac.abort();res.once('close',stop);if(res.destroyed)stop()
        try{if(await readerRoute(req,url,reader,current,ac.signal,receive,reserve,(code,data)=>json(code,{data,request_id:requestId})))return}finally{res.off('close',stop)}
      }
      if(req.method==='GET'&&url.pathname==='/knowledge/v1/assets'&&!url.search){json(200,{data:{items:store.list(actor)},request_id:requestId});return}
      const op=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/office(?:\/(start)|\/([a-f0-9-]+)\/(cancel|notes|pdf))?$/.exec(url.pathname)
      if(office&&op&&uuid.test(op[1]!)&&uuid.test(op[2]!)&&(!op[4]||uuid.test(op[4]))){
        const id=op[1]!,v=op[2]!,cid=op[4]!,command=op[3]??op[5],key=req.headers['idempotency-key']
        const send=(status:number,data:unknown)=>json(status,{data,request_id:requestId})
        if(req.method==='GET'&&!command){const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length)throw new AssetError(422,'INVALID_HISTORY_CURSOR');send(200,office.list(current(),id,v,Object.fromEntries(url.searchParams)));return}
        if(req.method==='POST'&&command==='start'&&!url.search){const r=office.start(current(),id,v,typeof key==='string'?key:'',officeAvailable());send(r.replayed?200:202,r);return}
        if(req.method==='POST'&&command==='cancel'&&!url.search){send(200,office.cancel(current(),id,v,cid));return}
        if(req.method==='POST'&&command==='notes'&&!url.search){
          if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
          const bytes=await receive(req,'INVALID_QUALITY_NOTE',16384);let input
          try{input=JSON.parse(bytes.toString('utf8'))}catch{throw new AssetError(422,'INVALID_QUALITY_NOTE')}
          if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['body','page'].includes(k)))throw new AssetError(422,'INVALID_QUALITY_NOTE')
          const r=office.note(current(),id,v,cid,typeof key==='string'?key:'',input.page,input.body);send(r.replayed?200:201,r);return
        }
        if(req.method==='GET'&&command==='pdf'&&(!url.search||url.search==='?download=1')){
          reserve();const download=!!url.search,result=()=>office.result(current(),id,v,cid,download),ref=result()
          const bytes=await originals.read(ref.key,ref.sha256,ref.byteLength);result()
          res.setHeader('content-type','application/pdf');res.setHeader('content-length',bytes.length);res.setHeader('content-security-policy',"sandbox; default-src 'none'");res.setHeader('content-disposition',`${download?'attachment':'inline'}; filename="preview.pdf"`);res.end(bytes);return
        }
      }
      if(archives&&!url.search){
        const archive=/^\/knowledge\/v1\/imports\/([a-f0-9-]+)\/(entries|selection)$/.exec(url.pathname)
        if(req.method==='GET'&&url.pathname==='/knowledge/v1/imports'){json(200,{data:{items:archives.list(current())},request_id:requestId});return}
        if(archive&&uuid.test(archive[1]!)){
          const id=archive[1]!
          if(req.method==='GET'&&archive[2]==='entries'){json(200,{data:archives.manifest(current(),id),request_id:requestId});return}
          if(req.method==='POST'&&archive[2]==='selection'){
            const key=req.headers['idempotency-key'];if(typeof key!=='string'||!uuid.test(key))throw new AssetError(422,'INVALID_SELECTION')
            if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
            reserve();const body=await receive(req,'INVALID_SELECTION',24*1024)
            let input;try{input=JSON.parse(body.toString('utf8'))}catch{throw new AssetError(422,'INVALID_SELECTION')}
            if(!input||typeof input!=='object'||Object.keys(input).length!==1||!Array.isArray(input.entry_ids))throw new AssetError(422,'INVALID_SELECTION')
            const ref=archives.source(current(),id),items=archives.select(current(),id,key,input.entry_ids),pending=items.filter(e=>!e.imported)
            if(pending.length){
              const bytes=await originals.read(ref.key,ref.sha256,ref.byteLength)
              try{await preflightZipSelection(bytes,pending.map(e=>e.ordinal))}catch(e){
                if(e instanceof ZipInputError)for(const m of pending)archives.failure(current(),id,m.id,e.code)
                throw e
              }
              for(const m of pending){
                current();const content=await readZipMember(bytes,m.ordinal),title=m.path.split('/').at(-1)!
                if(title.length>200){archives.failure(current(),id,m.id,'INVALID_FILENAME');continue}
                try{await publishInput(store,originals,current,{title,key:m.key},content,m.media,undefined,archives.publication(id,m.id,m.key))}
                catch(e){const invalid=inputError(e);if(!invalid)throw e;archives.failure(current(),id,m.id,invalid.code)}
              }
            }
            json(200,{data:archives.manifest(current(),id),request_id:requestId});return
          }
        }
      }
      if(req.method==='POST'&&url.pathname==='/knowledge/v1/imports'&&!url.search){
        const media=req.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
        if(media==='application/zip'&&archives){
          const spec=specFor(req);if(spec.assetId||req.headers['x-knowledgeos-encoding']!==undefined)throw new AssetError(422,'INVALID_IMPORT')
          reserve();const bytes=await receive(req,'ZIP_MALFORMED',max);current();const members=inspectZip(bytes),blob=await originals.putArchive(bytes)
          let staged:ReturnType<ZipStore['stage']>
          try{staged=archives.stage(current(),spec,blob,members)}catch(e){if(e instanceof AssetError)await originals.discard(blob.key);else originals.retain(blob.key);throw e}
          if(staged.replayed){await originals.discard(blob.key);const ref=archives.source(current(),staged.id);await originals.read(ref.key,ref.sha256,ref.byteLength)}else originals.retain(blob.key)
          json(staged.replayed?200:201,{data:archives.manifest(current(),staged.id),request_id:requestId});return
        }
        const word=isWordMedia(media),isText=media==='text/plain'||media==='text/markdown'
        if(media!=='application/pdf'&&!isText&&!word)throw new AssetError(415,'UNSUPPORTED_MEDIA_TYPE')
        const encoding=req.headers['x-knowledgeos-encoding']
        if(encoding!==undefined&&(typeof encoding!=='string'||!isText))throw new AssetError(422,'TEXT_UNSUPPORTED_ENCODING')
        const spec=specFor(req);reserve();const bytes=await receive(req,isText?'TEXT_INVALID_INPUT':word?'INVALID_WORD':'INVALID_PDF',isText?textLimit:max);current()
        const result=await publishInput(store,originals,current,spec,bytes,media,encoding)
        json(result.replayed?200:201,{data:result.receipt,request_id:requestId});return
      }
      const parse=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/parse(?:\/(start|cancel|retry\/([1-9]\d{0,4})))?$/.exec(url.pathname)
      const processPath=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/process$/.exec(url.pathname)
      const pagesPath=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/pages$/.exec(url.pathname)
      const operation=/^\/knowledge\/v1\/operations\/([a-f0-9-]+)$/.exec(url.pathname)
      const blockPath=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/blocks$/.exec(url.pathname)
      if(blockPath&&req.method==='GET'&&uuid.test(blockPath[1]!)&&uuid.test(blockPath[2]!)){
        const keys=[...url.searchParams.keys()];if(keys.some(k=>!['from','limit'].includes(k))||new Set(keys).size!==keys.length)throw new AssetError(422,'INVALID_BLOCK_RANGE')
        json(200,{data:store.blocks(current(),blockPath[1]!,blockPath[2]!,Number(url.searchParams.get('from')??1),Number(url.searchParams.get('limit')??5)),request_id:requestId});return
      }
      const respond=(v:string,data:ReturnType<ParseStore['control']>,asyncRequest:boolean)=>{
        const active=['queued','running'].includes(String(data.state)),location='/knowledge/v1/operations/'+v
        if(asyncRequest&&active)res.setHeader('location',location)
        json(asyncRequest&&active?202:200,{data:{...data,operation_id:v,status_url:location,cancellable:active},request_id:requestId})
      }
      if(operation && parses && req.method==='GET'&&!url.search&&uuid.test(operation[1]!)){respond(operation[1]!,parses.operation(current(),operation[1]!),false);return}
      if(processPath && parses && req.method==='POST'&&!url.search&&uuid.test(processPath[1]!)){
        const {version_id:v,page}=await processInput(req);respond(v,parses.control(current(),processPath[1]!,v,page?'retry':'start',page),true);return
      }
      if(pagesPath && parses && req.method==='GET'&&uuid.test(pagesPath[1]!)&&uuid.test(pagesPath[2]!)){
        const keys=[...url.searchParams.keys()];if(keys.some(k=>!['from','limit'].includes(k))||new Set(keys).size!==keys.length)throw new AssetError(422,'INVALID_PAGE_RANGE')
        const from=Number(url.searchParams.get('from')??1),limit=Number(url.searchParams.get('limit')??5)
        json(200,{data:parses.pages(current(),pagesPath[1]!,pagesPath[2]!,from,limit),request_id:requestId});return
      }
      if(parse && parses && !url.search && uuid.test(parse[1]!) && uuid.test(parse[2]!) && req.method===(parse[3]?'POST':'GET')) {
        const op=parse[4]?'retry':parse[3]==='start'?'start':parse[3]==='cancel'?'cancel':'status'
        respond(parse[2]!,parses.control(current(),parse[1]!,parse[2]!,op,parse[4]?Number(parse[4]):undefined),op==='start'||op==='retry');return
      }
      const path=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/original$/.exec(url.pathname)
      if(req.method==='GET'&&path&&uuid.test(path[1]!)&&uuid.test(path[2]!)&&(!url.search||url.search==='?download=1')){
        reserve();const download=Boolean(url.search),original=()=>store.original(current(),path[1]!,path[2]!,download),r=original()
        const word=isWordMedia(r.media),ext=word?(r.media===WORD_MEDIA.doc?'doc':'docx'):r.media==='text/plain'?'txt':r.media==='text/markdown'?'md':'pdf'
        // A raw Word file is an attachment, never an inline renderer. Its bytes require export permission.
        if(word&&!download)throw new AssetError(422,'WORD_DOWNLOAD_REQUIRED')
        const bytes=await originals.read(r.key,r.sha256,r.byteLength);original()
        res.statusCode=200;res.setHeader('content-type',word?r.media!:r.media?`${download?r.media:'text/plain'}; charset=${r.encoding}`:'application/pdf');res.setHeader('content-security-policy',"sandbox; default-src 'none'");res.setHeader('content-disposition',`${download?'attachment':'inline'}; filename="document.${ext}"`);res.setHeader('content-length',bytes.length);res.end(bytes);return
      }
      throw new AssetError(404,'NOT_FOUND')
    }catch(e){const error=e instanceof AssetError?e:inputError(e)??new AssetError(503,'ORIGINAL_UNAVAILABLE');json(error.status,{code:error.code,message:error.code,request_id:requestId})}
    finally{handlerDone=true;release()}
  }
}
