import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError,type BlobRef} from './asset-store.ts'
import {citationAnchor,resolveCitationText} from './citation-anchor.ts'
import {makeLocator,type RenderWitness} from './citation-locator.ts'
import type {SessionActor} from './identity.ts'
import type {ParseTx} from './parse-store.ts'
import {WORD_MEDIA,type WordMedia} from './office-schema.ts'
import {createBookmark,readNavigation,samePoint,savePosition,type ReadingPoint} from './reading-state.ts'
import {insertAnnotation,listAnnotations,mutateAnnotation,type AnnotationAccess,type AnnotationDraft} from './annotation-store.ts'

export const CITATION_SCHEMA=`CREATE TABLE citations (
  id TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), quote_hash TEXT NOT NULL CHECK(length(quote_hash)=64),
  created_at TEXT NOT NULL, UNIQUE(created_by,request_key)
) STRICT;`
export interface ReaderTarget {asset_id:string;version_id:string;ordinal:number;conversion_id?:string}
export interface CitationSpec extends ReaderTarget {start:number;end:number;source_hash:string}
export interface ReaderSource extends ReaderTarget {
  kind:'pdf'|'text'|'office';total:number;state:string;text:string;title:string;chapter:string;ref?:BlobRef
  wordOriginal?:BlobRef&{media:WordMedia}
}
// Only the Host renderer may supply this witness. Never deserialize it from client input.
const notFound=()=>new AssetError(404,'SOURCE_NOT_FOUND')
const invalid=()=>new AssetError(422,'INVALID_READER_UNIT')
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex')
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const fields='id,asset_id,version_id,conversion_id,ordinal,start,end,source_hash,quote_hash'
function dto(row:Record<string,unknown>){const {conversion_id,...rest}=row;return {...rest,...(conversion_id?{conversion_id}:{})} as CitationSpec&{id:string;quote_hash:string}}

export class CitationStore {
  constructor(private tx:ParseTx,private current:(a:SessionActor,now:string)=>SessionActor|undefined,
    private allowed:(a:SessionActor,id:string,now:string)=>boolean,
    private annotationAccess?:(a:SessionActor,id:string,now:string)=>AnnotationAccess|undefined,
    private readHorizon?:(a:SessionActor,id:string,now:string)=>string|null|undefined){}
  private actor(prior:SessionActor,now:string){const a=this.current(prior,now);if(!a)throw new AssetError(401,'AUTH_REQUIRED');return a}
  private read(db:DatabaseSync,a:SessionActor,t:ReaderTarget,now:string):ReaderSource {
    if(!this.allowed(a,t.asset_id,now))throw notFound()
    const r=db.prepare(`SELECT v.original_name,b.media_type,b.storage_key,b.sha256,b.byte_length FROM asset_versions v
      JOIN blobs b ON b.id=v.blob_id WHERE v.asset_id=? AND v.id=?`).get(t.asset_id,t.version_id)
    if(!r)throw notFound();if(!Number.isSafeInteger(t.ordinal)||t.ordinal<1)throw invalid()
    const base={asset_id:t.asset_id,version_id:t.version_id,ordinal:t.ordinal,title:String(r.original_name),chapter:'',text:''}
    if(r.media_type==='text/plain'||r.media_type==='text/markdown'){
      if(t.conversion_id)throw notFound()
      const v=db.prepare('SELECT block_count FROM text_versions WHERE version_id=?').get(t.version_id)
      const total=Number(v?.block_count??0);if(!total&&t.ordinal===1)return {...base,kind:'text',total,state:'empty'}
      const block=db.prepare('SELECT text,kind FROM text_blocks WHERE version_id=? AND ordinal=?').get(t.version_id,t.ordinal)
      if(!block)throw invalid();return {...base,kind:'text',total,state:'ready',text:String(block.text),chapter:String(block.kind)}
    }
    if(r.media_type==='application/pdf'){
      if(t.conversion_id)throw notFound()
      const v=db.prepare('SELECT total,state FROM pdf_parse_runs WHERE version_id=?').get(t.version_id),total=Number(v?.total??0)
      if(total&&t.ordinal>total)throw invalid()
      const p=db.prepare('SELECT state,text,chapter FROM pdf_pages WHERE version_id=? AND page=?').get(t.version_id,t.ordinal)
      const state=String(p?.state??v?.state??'idle');const withText=p&&(state==='ready'||state==='review')
      return {...base,kind:'pdf',total,state,text:withText?String(p.text):'',chapter:String(p?.chapter??''),ref:{key:String(r.storage_key),byteLength:Number(r.byte_length),sha256:String(r.sha256)}}
    }
    const sql=`SELECT c.id,c.page_count,b.storage_key,b.byte_length,b.sha256 FROM office_conversions c JOIN blobs b ON b.id=c.result_blob_id
      WHERE c.version_id=? AND c.state='ready' `
    const c=t.conversion_id?db.prepare(sql+'AND c.id=?').get(t.version_id,t.conversion_id):db.prepare(sql+'ORDER BY c.rowid DESC LIMIT 1').get(t.version_id)
    if(!c){if(t.conversion_id)throw notFound();return {...base,kind:'office',total:0,state:'unconverted'}}
    if(r.media_type!==WORD_MEDIA.doc&&r.media_type!==WORD_MEDIA.docx)throw notFound()
    const total=Number(c.page_count);if(t.ordinal>total)throw invalid();return {...base,conversion_id:String(c.id),kind:'office',total,state:'ready',ref:{key:String(c.storage_key),byteLength:Number(c.byte_length),sha256:String(c.sha256)},
      wordOriginal:{key:String(r.storage_key),byteLength:Number(r.byte_length),sha256:String(r.sha256),media:r.media_type}}
  }
  source(prior:SessionActor,t:ReaderTarget){return this.tx('read',(db,now)=>this.read(db,this.actor(prior,now),t,now))}
  validateTaskMaterial(db:DatabaseSync,actor:SessionActor,t:ReaderTarget,now:string) {
    const source=this.read(db,actor,t,now)
    // Never pin a floating Word rendering or a location the reader cannot verify.
    return source.total>=t.ordinal&&(source.kind!=='office'||Boolean(t.conversion_id&&source.conversion_id===t.conversion_id))
  }
  recallSource(db:DatabaseSync,actor:SessionActor,t:ReaderTarget,now:string){
    const s=this.read(db,actor,t,now)
    if(s.kind==='office'){
      // The Word index binds page bytes to the fixed conversion, not to the latest result.
      if(!t.conversion_id||s.conversion_id!==t.conversion_id)throw new AssetError(422,'RECALL_CONVERSION_REQUIRED')
      const page=db.prepare(`SELECT q.blank,p.text FROM office_conversions c JOIN recall_word_sources q
        ON q.conversion_id=c.id AND q.result_blob_id=c.result_blob_id
        LEFT JOIN word_search_pages p ON p.conversion_id=q.conversion_id AND p.page=q.page
        WHERE c.id=? AND q.page=?`).get(s.conversion_id,s.ordinal)
      if(!page||!page.blank&&typeof page.text!=='string')throw new AssetError(409,'RECALL_SOURCE_NOT_READY')
      return {...s,text:page.blank?'':String(page.text)}
    }
    // Review pages may be incomplete, and can still be re-extracted in place.
    if(s.kind==='pdf'&&!s.text&&db.prepare('SELECT 1 FROM recall_pdf_blank_pages WHERE version_id=? AND page=?').get(s.version_id,s.ordinal))return s
    if(s.state!=='ready')throw new AssetError(409,'RECALL_SOURCE_NOT_READY')
    return s
  }
  navigation(prior:SessionActor,t:ReaderTarget){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),src=this.read(db,a,{...t,ordinal:1},now)
    return readNavigation(db,a.userId,t.version_id,p=>{
      if(src.conversion_id!==p.conversion_id||p.ordinal>src.total)return false
      try{return samePoint(this.read(db,a,{...t,...p},now),p)}
      catch(e){if(e instanceof AssetError&&e.code==='INVALID_READER_UNIT')return false;throw e}
    })
  })}
  outline(prior:SessionActor,t:ReaderTarget){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),source=this.read(db,a,t,now)
    const items=source.kind==='text'?db.prepare("SELECT ordinal,text FROM text_blocks WHERE version_id=? AND kind='heading' ORDER BY ordinal LIMIT 2048").all(t.version_id).flatMap(row=>{
      const lines=String(row.text).trimEnd().split(/\r\n|\r|\n/),first=lines[0]!
      const atx=/^ {0,3}#{1,6}(?:[ \t]+|$)/
      const label=atx.test(first)?first.replace(atx,'').replace(/[ \t]+#+[ \t]*$/,''):lines.slice(0,-1).map(line=>line.trim()).join(' ')
      const title=label.trim().slice(0,250)
      return title?[{ordinal:Number(row.ordinal),title}]:[]
    }):[]
    return {actor_id:a.userId,source,items}
  })}
  private writer(prior:SessionActor,expectedActor:string,now:string){
    const a=this.actor(prior,now);if(a.userId!==expectedActor)throw new AssetError(409,'READER_ACTOR_CHANGED');return a
  }
  savePosition(prior:SessionActor,t:ReaderTarget&ReadingPoint,revision:number,expectedActor:string){return this.tx('write',(db,now)=>{
    const a=this.writer(prior,expectedActor,now)
    const src=this.read(db,a,{asset_id:t.asset_id,version_id:t.version_id,ordinal:t.ordinal},now)
    if(!samePoint(src,t))throw new AssetError(409,'READING_SOURCE_CHANGED')
    return savePosition(db,a.userId,t.version_id,t,revision)
  })}
  addBookmark(prior:SessionActor,t:ReaderTarget&ReadingPoint,title:string,expectedActor:string){return this.tx('write',(db,now)=>{
    const a=this.writer(prior,expectedActor,now),src=this.read(db,a,t,now)
    if(!samePoint(src,t))throw new AssetError(409,'READING_SOURCE_CHANGED')
    return createBookmark(db,a.userId,t.version_id,t,title)
  })}
  deleteBookmark(prior:SessionActor,t:ReaderTarget,id:string,expectedActor:string){return this.tx('write',(db,now)=>{
    const a=this.writer(prior,expectedActor,now);this.read(db,a,t,now)
    const del=db.prepare('DELETE FROM reading_bookmarks WHERE id=? AND user_id=? AND version_id=?').run(id,a.userId,t.version_id)
    if(del.changes!==1)throw notFound()
    return {id}
  })}
  private annotatable(db:DatabaseSync,a:SessionActor,t:ReaderTarget,now:string,write=false){
    const src=this.read(db,a,t,now),scope=this.annotationAccess?.(a,t.asset_id,now)
    if(!scope||write&&!scope.canComment)throw notFound()
    return {src,scope}
  }
  listAnnotations(prior:SessionActor,t:ReaderTarget){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),{src,scope}=this.annotatable(db,a,t,now)
    return listAnnotations(db,src,a.userId,scope)
  })}
  addAnnotation(prior:SessionActor,t:ReaderTarget,draft:AnnotationDraft,expectedActor:string){return this.tx('write',(db,now)=>{
    const a=this.writer(prior,expectedActor,now),{src,scope}=this.annotatable(db,a,t,now,true)
    const row=db.prepare(`SELECT ${fields} FROM citations WHERE id=? AND created_by=? AND asset_id=? AND version_id=? AND ordinal=? AND conversion_id IS ?`).get(draft.citation_id,a.userId,src.asset_id,src.version_id,src.ordinal,src.conversion_id??null)
    if(!row)throw notFound()
    if((src.state!=='ready'&&src.state!=='review')||src.kind!=='office'&&row.source_hash!==sha(src.text))throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    return insertAnnotation(db,src,a.userId,scope,draft,dto(row))
  })}
  updateAnnotation(prior:SessionActor,t:ReaderTarget,id:string,revision:number,body:string,expectedActor:string){return this.tx('write',(db,now)=>{
    const a=this.writer(prior,expectedActor,now),{src,scope}=this.annotatable(db,a,t,now,true)
    return mutateAnnotation(db,src,a.userId,scope,id,revision,body)
  })}
  deleteAnnotation(prior:SessionActor,t:ReaderTarget,id:string,revision:number,expectedActor:string){return this.tx('write',(db,now)=>{
    const a=this.writer(prior,expectedActor,now),{src,scope}=this.annotatable(db,a,t,now,true)
    return mutateAnnotation(db,src,a.userId,scope,id,revision)
  })}
  access(prior:SessionActor,asset:string,version:string){return this.tx('read',(db,now)=>{
    const actor=this.actor(prior,now),expires=this.readHorizon?this.readHorizon(actor,asset,now):this.allowed(actor,asset,now)?null:undefined
    if(expires===undefined)throw notFound()
    const row=db.prepare(`SELECT v.version,NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS latest
      FROM asset_versions v WHERE v.asset_id=? AND v.id=?`).get(asset,version)
    if(!row)throw notFound()
    return {actor_id:actor.userId,asset_id:asset,version_id:version,version:Number(row.version),is_latest:!!row.latest,server_time:now,read_expires_at:expires}
  })}
  private text(s:ReaderSource,w?:RenderWitness){
    if(s.state!=='ready'&&s.state!=='review')throw new AssetError(409,'SOURCE_NOT_READY')
    if(s.kind!=='office')return s.text
    if(!w||w.conversion_id!==s.conversion_id||w.sha256!==s.ref?.sha256||w.ordinal!==s.ordinal)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    return w.text
  }
  verifySelection(db:DatabaseSync,actor:SessionActor,spec:CitationSpec,now:string,w?:RenderWitness) {
    const source=this.read(db,actor,spec,now)
    if(source.kind==='office'&&!spec.conversion_id)throw new AssetError(422,'INVALID_CITATION')
    const text=this.text(source,w)
    const range=citationAnchor(text,spec.start,spec.end)
    if(range.source_hash!==spec.source_hash)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    return {title:source.title,kind:source.kind,text,...range}
  }
  selection(prior:SessionActor,spec:CitationSpec,w?:RenderWitness){
    return this.tx('read',(db,now)=>this.verifySelection(db,this.actor(prior,now),spec,now,w))
  }
  checkStoredSelection(db:DatabaseSync,actor:SessionActor,spec:CitationSpec&{quote_hash:string},now:string){
    const source=this.read(db,actor,spec,now)
    if(source.kind==='office'){
      if(!spec.conversion_id||source.conversion_id!==spec.conversion_id)throw notFound()
      return
    }
    resolveCitationText(this.text(source),spec)
  }
  private locator(db:DatabaseSync,id:string){const r=db.prepare('SELECT snapshot FROM citation_locators WHERE citation_id=?').get(id);return r?JSON.parse(String(r.snapshot)) as ReturnType<typeof makeLocator>:null}
  private receipt(db:DatabaseSync,a:SessionActor,now:string,spec:CitationSpec,key:string,range:ReturnType<typeof citationAnchor>){
    const old=db.prepare(`SELECT ${fields} FROM citations WHERE created_by=? AND request_key=?`).get(a.userId,key)
    if(!old)return
    if(!this.allowed(a,String(old.asset_id),now))throw notFound()
    if(old.asset_id!==spec.asset_id||old.version_id!==spec.version_id||old.ordinal!==spec.ordinal||old.conversion_id!==(spec.conversion_id??null)||old.start!==range.start||old.end!==range.end||old.source_hash!==range.source_hash)throw new AssetError(409,'IDEMPOTENCY_CONFLICT')
    return {data:{...dto(old),locator:this.locator(db,String(old.id))},replayed:true}
  }
  replay(prior:SessionActor,spec:CitationSpec,key:string,w:RenderWitness){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),src=this.read(db,a,spec,now),text=this.text(src,w)
    if(!uuid.test(key))throw new AssetError(422,'INVALID_CITATION')
    if(sha(text)!==spec.source_hash)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    return this.receipt(db,a,now,spec,key,citationAnchor(text,spec.start,spec.end))
  })}
  createPinned(db:DatabaseSync,a:SessionActor,spec:CitationSpec,key:string,now:string,w?:RenderWitness){
    const src=this.read(db,a,spec,now)
    if(!uuid.test(key)||src.kind==='office'&&!spec.conversion_id)throw new AssetError(422,'INVALID_CITATION')
    const text=this.text(src,w);if(sha(text)!==spec.source_hash)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
    const range=citationAnchor(text,spec.start,spec.end)
    const old=this.receipt(db,a,now,spec,key,range);if(old)return old
    const neighbor=(n:number)=>{if(src.kind!=='text')return null;const r=db.prepare('SELECT anchor FROM text_blocks WHERE version_id=? AND ordinal=?').get(src.version_id,n);return r?String(r.anchor):null}
    const locator=makeLocator(src,text,spec.start,spec.end,{previous:neighbor(src.ordinal-1),next:neighbor(src.ordinal+1)},w)
    const id=randomUUID();db.prepare('INSERT INTO citations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,a.userId,key,spec.asset_id,spec.version_id,spec.conversion_id??null,spec.ordinal,range.start,range.end,range.source_hash,range.quote_hash,now)
    db.prepare('INSERT INTO citation_locators(citation_id,snapshot) VALUES(?,?)').run(id,JSON.stringify(locator))
    return {data:{...spec,...range,id,locator},replayed:false}
  }
  create(prior:SessionActor,spec:CitationSpec,key:string,w?:RenderWitness){
    return this.tx('write',(db,now)=>this.createPinned(db,this.actor(prior,now),spec,key,now,w))
  }
  private lookup(db:DatabaseSync,a:SessionActor,id:string,now:string){
    const r=db.prepare(`SELECT ${fields} FROM citations WHERE id=?`).get(id);if(!r||!this.allowed(a,String(r.asset_id),now))throw notFound();return dto(r)
  }
  target(prior:SessionActor,id:string){return this.tx('read',(db,now)=>this.lookup(db,this.actor(prior,now),id,now))}
  knowledgeSource(db:DatabaseSync,actor:SessionActor,id:string,now:string){
    const citation=this.lookup(db,actor,id,now)
    this.checkStoredSelection(db,actor,citation,now)
    return citation
  }
  resolve(prior:SessionActor,id:string,w?:RenderWitness){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),r=this.lookup(db,a,id,now),source=this.read(db,a,r,now)
    return {...r,quote:resolveCitationText(this.text(source,w),r),locator:this.locator(db,id)}
  })}
}
