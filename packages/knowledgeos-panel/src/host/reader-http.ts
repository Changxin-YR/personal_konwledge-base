import {createHash} from 'node:crypto'
import type {IncomingMessage} from 'node:http'
import type {SessionActor} from './identity.ts'
import {AssetError} from './asset-store.ts'
import type {CitationStore,CitationSpec,ReaderSource,ReaderTarget,OfficePageWitness} from './citation-store.ts'
import type {PdfOriginals} from './pdf-originals.ts'

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex')
type Current=()=>SessionActor
type Rendered={text:string;image:string;width:number;height:number;boxes:{start:number;end:number;x:number;y:number;width:number;height:number}[]}
export type PageRenderer=(bytes:Buffer,ordinal:number,signal:AbortSignal)=>Promise<Rendered>

export class ReaderService {
  constructor(private store:CitationStore,private originals:PdfOriginals,private render?:PageRenderer){}
  private async rendered(current:Current,s:ReaderSource,signal:AbortSignal){
    if(!this.render||!s.ref)throw new AssetError(503,'PAGE_RENDER_UNAVAILABLE')
    const bytes=await this.originals.read(s.ref.key,s.ref.sha256,s.ref.byteLength)
    const check=()=>{if(signal.aborted)throw new AssetError(409,'READ_CANCELLED');const r=this.store.source(current(),s)
      if(r.state!==s.state||r.text!==s.text||r.ref?.sha256!==s.ref?.sha256||r.conversion_id!==s.conversion_id)throw new AssetError(409,'CITATION_SOURCE_CHANGED')}
    check();let rendered:Rendered
    try{rendered=await this.render(bytes,s.ordinal,signal)}catch(e){check();throw e instanceof AssetError?e:new AssetError(503,'PAGE_RENDER_UNAVAILABLE')}
    check();if(s.kind==='pdf'&&rendered.text!==s.text)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    return rendered
  }
  async page(current:Current,t:ReaderTarget,signal:AbortSignal){
    const s=this.store.source(current(),t),{ref:_private,...publicFields}=s
    if(s.kind==='text'||!['ready','review'].includes(s.state))return {...publicFields,anchor:hash(s.text)}
    const {text,image,width,height,boxes}=await this.rendered(current,s,signal)
    return {...publicFields,text,anchor:hash(text),image,width,height,boxes}
  }
  private async office(current:Current,t:ReaderTarget,signal:AbortSignal):Promise<OfficePageWitness|undefined>{
    if(!t.conversion_id)return
    const s=this.store.source(current(),t),{text}=await this.rendered(current,s,signal)
    return {conversion_id:t.conversion_id,sha256:s.ref!.sha256,ordinal:t.ordinal,text}
  }
  async create(current:Current,spec:CitationSpec,key:string,signal:AbortSignal){const w=await this.office(current,spec,signal);return this.store.create(current(),spec,key,w)}
  async resolve(current:Current,id:string,signal:AbortSignal){const t=this.store.target(current(),id),w=await this.office(current,t,signal);return this.store.resolve(current(),id,w)}
}

export async function readerRoute(req:IncomingMessage,url:URL,service:ReaderService,current:Current,signal:AbortSignal,
  body:(req:IncomingMessage,empty:string,max:number)=>Promise<Buffer>,reserve:()=>void,send:(status:number,data:unknown)=>void){
  const reader=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader$/.exec(url.pathname)
  if(reader&&uuid.test(reader[1]!)&&uuid.test(reader[2]!)&&req.method==='GET'){
    const p=url.searchParams,keys=[...p.keys()],unit=p.get('unit')??'1',cid=p.get('conversion')
    if(keys.some(k=>!['unit','conversion'].includes(k))||keys.length!==new Set(keys).size||!/^\d{1,9}$/.test(unit)||Number(unit)<1||cid!==null&&!uuid.test(cid))throw new AssetError(422,'INVALID_READER_UNIT')
    reserve();send(200,await service.page(current,{asset_id:reader[1]!,version_id:reader[2]!,ordinal:Number(unit),...(cid?{conversion_id:cid}:{})},signal));return true
  }
  const resolve=/^\/knowledge\/v1\/citations\/([a-f0-9-]+)\/resolve$/.exec(url.pathname)
  if(resolve&&uuid.test(resolve[1]!)&&!url.search&&req.method==='GET'){reserve();send(200,await service.resolve(current,resolve[1]!,signal));return true}
  if(req.method==='POST'&&url.pathname==='/knowledge/v1/citations'&&!url.search){
    if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!uuid.test(key))throw new AssetError(422,'INVALID_CITATION_KEY')
    reserve();const b=await body(req,'INVALID_CITATION',2048);let v;try{v=JSON.parse(b.toString('utf8'))}catch{throw new AssetError(422,'INVALID_CITATION')}
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['asset_id','version_id','ordinal','start','end','source_hash','conversion_id'].includes(k))||
      typeof v.asset_id!=='string'||!uuid.test(v.asset_id)||typeof v.version_id!=='string'||!uuid.test(v.version_id)||('conversion_id' in v&&(typeof v.conversion_id!=='string'||!uuid.test(v.conversion_id)))||
      !Number.isSafeInteger(v.ordinal)||v.ordinal<1||!Number.isSafeInteger(v.start)||!Number.isSafeInteger(v.end)||v.start<0||v.end<=v.start||typeof v.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(v.source_hash))throw new AssetError(422,'INVALID_CITATION')
    const r=await service.create(current,v,key,signal);send(r.replayed?200:201,r.data);return true
  }
  return false
}
