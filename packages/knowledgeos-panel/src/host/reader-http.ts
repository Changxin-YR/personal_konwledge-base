import {createHash} from 'node:crypto'
import type {IncomingMessage} from 'node:http'
import type {SessionActor} from './identity.ts'
import {AssetError} from './asset-store.ts'
import type {CitationStore,CitationSpec,ReaderSource,ReaderTarget} from './citation-store.ts'
import type {RenderWitness} from './citation-locator.ts'
import type {PdfOriginals} from './pdf-originals.ts'
import {alignWordSelection,wordPageLimit,wordParagraphs} from './word-locator.ts'
import {WORD_MEDIA} from './office-schema.ts'
import {canRemember,positionHash,type ReadingPoint} from './reading-state.ts'

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex')
type Current=()=>SessionActor
type Rendered={text:string;image:string;width:number;height:number;boxes:{start:number;end:number;x:number;y:number;width:number;height:number}[]}
export type PageRenderer=(bytes:Buffer,ordinal:number,signal:AbortSignal)=>Promise<Rendered>
export type WordPages=(bytes:Buffer,signal:AbortSignal)=>Promise<{numPages:number;page(n:number):Promise<{text:string}>;outline?():Promise<{ordinal:number;title:string;depth:number}[]>;close():Promise<void>}>
export type LegacyWordSource=(s:NonNullable<ReaderSource['wordOriginal']>,check:()=>void,signal:AbortSignal)=>Promise<Buffer>

export class ReaderService {
  constructor(private store:CitationStore,private originals:PdfOriginals,private render?:PageRenderer,private wordPages?:WordPages,private legacyWord?:LegacyWordSource){}
  access(current:Current,asset:string,version:string){return this.store.access(current(),asset,version)}
  navigation(current:Current,t:ReaderTarget){return this.store.navigation(current(),t)}
  savePosition(current:Current,t:ReaderTarget&ReadingPoint,r:number,a:string){return this.store.savePosition(current(),t,r,a)}
  addBookmark(current:Current,t:ReaderTarget&ReadingPoint,title:string,a:string){return this.store.addBookmark(current(),t,title,a)}
  deleteBookmark(current:Current,t:ReaderTarget,id:string,a:string){return this.store.deleteBookmark(current(),t,id,a)}
  async outline(current:Current,t:ReaderTarget,signal:AbortSignal){
    const {actor_id,source,items}=this.store.outline(current(),t)
    if(source.kind!=='pdf')return {actor_id,items}
    if(!this.wordPages||!source.ref)throw new AssetError(503,'OUTLINE_UNAVAILABLE')
    const safe=()=>{if(signal.aborted)throw new AssetError(409,'READ_CANCELLED');if(this.access(current,t.asset_id,t.version_id).actor_id!==actor_id)throw new AssetError(409,'READER_ACTOR_CHANGED')}
    try{
      const bytes=await this.originals.read(source.ref.key,source.ref.sha256,source.ref.byteLength);safe()
      const pdf=await this.wordPages(bytes,signal)
      let outline
      try{if(!pdf.outline)throw Error('Outline unavailable');outline=await pdf.outline()}
      finally{await pdf.close()}
      safe();return {actor_id,items:outline}
    }catch(e){safe();throw e instanceof AssetError?e:new AssetError(503,'OUTLINE_UNAVAILABLE')}
  }
  private async rendered(current:Current,s:ReaderSource,signal:AbortSignal){
    if(!this.render||!s.ref)throw new AssetError(503,'PAGE_RENDER_UNAVAILABLE')
    const bytes=await this.originals.read(s.ref.key,s.ref.sha256,s.ref.byteLength)
    const check=()=>{if(signal.aborted)throw new AssetError(409,'READ_CANCELLED');const r=this.store.source(current(),s)
      if(r.state!==s.state||r.text!==s.text||r.ref?.sha256!==s.ref?.sha256||r.conversion_id!==s.conversion_id)throw new AssetError(409,'CITATION_SOURCE_CHANGED')}
    check();let rendered:Rendered
    try{rendered=await this.render(bytes,s.ordinal,signal)}catch(e){check();if((e as {code?:string})?.code==='PDF_BUSY')throw new AssetError(429,'PAGE_RENDER_BUSY');throw e instanceof AssetError?e:new AssetError(503,'PAGE_RENDER_UNAVAILABLE')}
    check();if(s.kind==='pdf'&&rendered.text!==s.text)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    return rendered
  }
  async page(current:Current,t:ReaderTarget,signal:AbortSignal){
    const s=this.store.source(current(),t),{ref:_private,wordOriginal:_word,...publicFields}=s
    const position=canRemember(s)?{position_hash:positionHash(s)}:{}
    if(s.kind==='text'||!canRemember(s))return {...publicFields,...position,anchor:hash(s.text)}
    const {text,image,width,height,boxes}=await this.rendered(current,s,signal)
    return {...publicFields,...position,text,anchor:hash(text),image,width,height,boxes,original_sha256:s.ref!.sha256}
  }
  private async witness(current:Current,t:ReaderTarget,signal:AbortSignal):Promise<RenderWitness|undefined>{
    const s=this.store.source(current(),t);if(s.kind==='text')return
    if(s.state!=='ready'&&s.state!=='review')throw new AssetError(409,'SOURCE_NOT_READY')
    if(s.kind==='office'&&!t.conversion_id)throw new AssetError(422,'INVALID_CITATION')
    const {text,width,height,boxes}=await this.rendered(current,s,signal)
    return {...(s.conversion_id?{conversion_id:s.conversion_id}:{}),sha256:s.ref!.sha256,ordinal:t.ordinal,text,width,height,boxes}
  }
  private async wordSelection(current:Current,s:ReaderSource,spec:CitationSpec,w:RenderWitness,signal:AbortSignal){
    const original=s.wordOriginal,ref=s.ref
    if(!original||!ref||!this.wordPages||s.total>wordPageLimit)return
    const deadline=AbortSignal.any([signal,AbortSignal.timeout(25_000)])
    const check=()=>{
      if(signal.aborted)throw new AssetError(409,'READ_CANCELLED')
      const r=this.store.source(current(),s)
      if(r.conversion_id!==s.conversion_id||r.ref?.sha256!==ref.sha256||r.wordOriginal?.sha256!==original.sha256)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    }
    try{
      check()
      const docx=original.media===WORD_MEDIA.docx?await this.originals.read(original.key,original.sha256,original.byteLength):await this.legacyWord?.(original,check,deadline)
      check();if(!docx)return
      const paragraphs=await wordParagraphs(docx),pdf=await this.originals.read(ref.key,ref.sha256,ref.byteLength)
      check();const doc=await this.wordPages(pdf,deadline)
      try{
        if(doc.numPages!==s.total)return
        return await alignWordSelection(paragraphs,s.version_id,original.sha256,s.ordinal,w.text,spec.start,spec.end,doc.numPages,async n=>{
          check();deadline.throwIfAborted();return (await doc.page(n)).text
        })
      }finally{await doc.close()}
    }catch(e){
      check()
      if((e as {code?:string})?.code==='PDF_BUSY')throw new AssetError(429,'PAGE_RENDER_BUSY')
      if(deadline.aborted)throw new AssetError(503,'WORD_STRUCTURE_UNAVAILABLE')
    }
  }
  async create(current:Current,spec:CitationSpec,key:string,signal:AbortSignal){
    const w=await this.witness(current,spec,signal)
    if(w?.conversion_id){
      const old=this.store.replay(current(),spec,key,w);if(old)return old
      const word=await this.wordSelection(current,this.store.source(current(),spec),spec,w,signal)
      if(word)w.word=word
    }
    return this.store.create(current(),spec,key,w)
  }
  async resolve(current:Current,id:string,signal:AbortSignal){const t=this.store.target(current(),id),w=t.conversion_id?await this.witness(current,t,signal):undefined;return this.store.resolve(current(),id,w)}
}

export async function readerRoute(req:IncomingMessage,url:URL,service:ReaderService,current:Current,signal:AbortSignal,
  body:(req:IncomingMessage,empty:string,max:number)=>Promise<Buffer>,reserve:()=>void,send:(status:number,data:unknown)=>void){
  const reading=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader-(state|outline|bookmarks)(?:\/([a-f0-9-]+))?$/.exec(url.pathname)
  if(reading&&uuid.test(reading[1]!)&&uuid.test(reading[2]!)&&!url.search){
    const t={asset_id:reading[1]!,version_id:reading[2]!,ordinal:1},kind=reading[3],id=reading[4],method=req.method
    if(method==='GET'&&!id&&kind==='state'){send(200,service.navigation(current,t));return true}
    if(method==='GET'&&!id&&kind==='outline'){reserve();send(200,await service.outline(current,t,signal));return true}
    const save=kind==='state'&&method==='PUT'&&!id,add=kind==='bookmarks'&&method==='POST'&&!id,del=kind==='bookmarks'&&method==='DELETE'&&id&&uuid.test(id)
    if(save||add||del){
      const a=req.headers['x-knowledgeos-reader-actor'];if(typeof a!=='string'||!uuid.test(a))throw new AssetError(422,'INVALID_READER_ACTOR')
      if(del&&id){send(200,service.deleteBookmark(current,t,id,a));return true}
      if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AssetError(415,'JSON_REQUIRED')
      reserve();const b=await body(req,'INVALID_READING_POINT',2048)
      let v;try{v=JSON.parse(b.toString('utf8'))}catch{throw new AssetError(422,'INVALID_READING_POINT')}
      if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['ordinal','source_hash','conversion_id',save?'expected_revision':'title'].includes(k))||
        !Number.isSafeInteger(v.ordinal)||v.ordinal<1||v.ordinal>1_000_000||typeof v.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(v.source_hash)||
        ('conversion_id' in v&&(typeof v.conversion_id!=='string'||!uuid.test(v.conversion_id))))throw new AssetError(422,'INVALID_READING_POINT')
      const p={...t,ordinal:v.ordinal,source_hash:v.source_hash,...(v.conversion_id?{conversion_id:v.conversion_id}:{})}
      if(save){
        if(!Number.isSafeInteger(v.expected_revision)||v.expected_revision<0||v.expected_revision>=Number.MAX_SAFE_INTEGER)throw new AssetError(422,'INVALID_READER_REVISION')
        send(200,service.savePosition(current,p,v.expected_revision,a))
      }else{
        if(typeof v.title!=='string'||!v.title.trim()||v.title.length>120||/[\p{Cc}\p{Cf}]/u.test(v.title))throw new AssetError(422,'INVALID_BOOKMARK_TITLE')
        send(201,service.addBookmark(current,p,v.title.trim(),a))
      }
      return true
    }
  }
  const access=/^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/reader-access$/.exec(url.pathname)
  if(access&&uuid.test(access[1]!)&&uuid.test(access[2]!)&&!url.search&&req.method==='GET'){
    send(200,service.access(current,access[1]!,access[2]!));return true
  }
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
