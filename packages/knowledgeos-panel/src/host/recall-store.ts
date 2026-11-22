import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError} from './asset-store.ts'
import type {ReaderSource,ReaderTarget} from './citation-store.ts'
import type {SessionActor} from './identity.ts'
import type {ParseTx} from './parse-store.ts'
import {recallMasks,recallPractice,recallSelection,type RecallMask,type RecallPoint,type RecallSegment} from './recall-range.ts'

export const RECALL_SCHEMA=`CREATE TABLE recall_pdf_blank_pages (
  version_id TEXT NOT NULL, page INTEGER NOT NULL,
  PRIMARY KEY(version_id,page), FOREIGN KEY(version_id,page) REFERENCES pdf_pages(version_id,page)
) STRICT;
CREATE TABLE recall_word_sources (
  conversion_id TEXT NOT NULL REFERENCES word_search_runs(conversion_id), page INTEGER NOT NULL CHECK(page>=1),
  result_blob_id TEXT NOT NULL REFERENCES blobs(id), blank INTEGER NOT NULL CHECK(blank IN (0,1)),
  PRIMARY KEY(conversion_id,page)
) STRICT;
CREATE TABLE recall_materials (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id), service_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), title TEXT NOT NULL, created_at TEXT NOT NULL,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(service_id,owner_user_id,request_key)
) STRICT;
CREATE INDEX recall_materials_owner ON recall_materials(service_id,owner_user_id,id);
CREATE TABLE recall_segments (
  material_id TEXT NOT NULL REFERENCES recall_materials(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>=start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), PRIMARY KEY(material_id,ordinal)
) STRICT;
CREATE TABLE recall_masks (
  material_id TEXT NOT NULL, ordinal INTEGER NOT NULL, start INTEGER NOT NULL CHECK(start>=0),
  end INTEGER NOT NULL CHECK(end>start), mask_group INTEGER NOT NULL CHECK(mask_group>=1),
  PRIMARY KEY(material_id,ordinal,start), FOREIGN KEY(material_id,ordinal) REFERENCES recall_segments(material_id,ordinal)
) STRICT;
CREATE TABLE recall_attempts (
  material_id TEXT PRIMARY KEY, active_ordinal INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1),
  FOREIGN KEY(material_id,active_ordinal) REFERENCES recall_segments(material_id,ordinal)
) STRICT;
CREATE TABLE recall_events (
  material_id TEXT NOT NULL REFERENCES recall_attempts(material_id), revision INTEGER NOT NULL CHECK(revision>=2),
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64), event TEXT NOT NULL,
  value INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(material_id,revision), UNIQUE(material_id,request_key),
  CHECK(event IN ('move','hint','reveal','recall','rating'))
) STRICT;
CREATE INDEX recall_events_groups ON recall_events(material_id,event,value);`

type Source = Omit<ReaderTarget,'ordinal'>
export type RecallDraft = Source & {title:string; first:RecallPoint; last:RecallPoint; interior_hashes:string[]; masks:RecallMask[]}
export type RecallAction = {event:'move'|'hint'|'reveal'|'recall'|'rating';value:number;expected_revision:number}
type Material = {id:string;title:string;asset_id:string;version_id:string;conversion_id:string|null}
type ReadSource = (db:DatabaseSync,a:SessionActor,t:ReaderTarget,now:string)=>ReaderSource
const sha=(text:string)=>createHash('sha256').update(text).digest('hex')
const invalid=()=>new AssetError(422,'INVALID_RECALL')
const notFound=()=>new AssetError(404,'RECALL_NOT_FOUND')
const point=(t:{asset_id:string;version_id:string;conversion_id?:string|null},ordinal:number):ReaderTarget=>({asset_id:t.asset_id,version_id:t.version_id,ordinal,...(t.conversion_id?{conversion_id:t.conversion_id}:{})})

export class RecallStore {
  constructor(private tx:ParseTx,private current:(a:SessionActor,now:string)=>SessionActor|undefined,
    private allowed:(a:SessionActor,id:string,now:string)=>boolean,private source:ReadSource){}

  private actor(prior:SessionActor,now:string,expected?:string){
    const a=this.current(prior,now);if(!a)throw new AssetError(401,'AUTH_REQUIRED')
    if(expected!==undefined&&expected!==a.userId)throw new AssetError(409,'ACTOR_CHANGED')
    return a
  }
  private material(db:DatabaseSync,a:SessionActor,id:string,now:string){
    const row=db.prepare(`SELECT id,title,asset_id,version_id,conversion_id FROM recall_materials WHERE id=? AND service_id=? AND owner_user_id=?`)
      .get(id,a.serviceId,a.userId) as Material|undefined
    if(!row||!this.allowed(a,row.asset_id,now))throw notFound()
    return row
  }
  private practice(db:DatabaseSync,a:SessionActor,m:Material,now:string){
    const attempt=db.prepare('SELECT active_ordinal,revision FROM recall_attempts WHERE material_id=?').get(m.id)!
    const ordinal=Number(attempt.active_ordinal)
    const segment=db.prepare('SELECT ordinal,start,end,source_hash FROM recall_segments WHERE material_id=? AND ordinal=?').get(m.id,ordinal) as RecallSegment
    const source=this.source(db,a,point(m,ordinal),now)
    const masks=db.prepare('SELECT ordinal,start,end,mask_group AS "group" FROM recall_masks WHERE material_id=? AND ordinal=? ORDER BY start').all(m.id,ordinal) as RecallMask[]
    const events=db.prepare(`SELECT event,value,count(*) AS count FROM recall_events WHERE material_id=? AND event IN ('hint','reveal','recall') GROUP BY event,value`).all(m.id)
    const ratings=db.prepare("SELECT value FROM recall_events WHERE material_id=? AND event='rating' ORDER BY revision DESC LIMIT 1").get(m.id)
    const revealed=new Set(events.filter(e=>e.event==='reveal').map(e=>Number(e.value)))
    const recalled=events.filter(e=>e.event==='recall').map(e=>Number(e.value))
    const bounds=db.prepare('SELECT min(ordinal) AS first,max(ordinal) AS last,sum(end-start) AS length FROM recall_segments WHERE material_id=?').get(m.id)!
    const head=db.prepare('SELECT id FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1').get(m.asset_id)
    const conversion=m.conversion_id?db.prepare("SELECT id FROM office_conversions WHERE version_id=? AND state='ready' ORDER BY rowid DESC LIMIT 1").get(m.version_id):undefined
    return {material:m,ordinal,revision:Number(attempt.revision),first:Number(bounds.first),last:Number(bounds.last),length:Number(bounds.length),page_length:segment.end-segment.start,
      source_changed:head?.id!==m.version_id||Boolean(m.conversion_id&&conversion?.id!==m.conversion_id),runs:recallPractice(segment,masks,revealed,source.text),
      progress:{hints:events.filter(e=>e.event==='hint').map(e=>({group:Number(e.value),count:Number(e.count)})),
        revealed:[...revealed],independent_recall:recalled,self_rating:ratings?Number(ratings.value):null}}
  }
  authorPage(prior:SessionActor,t:ReaderTarget){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),s=this.source(db,a,t,now)
    return {actor_id:a.userId,ordinal:s.ordinal,total:s.total,text:s.text,title:s.title,source_hash:sha(s.text)}
  })}
  list(prior:SessionActor,after=''){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),items=[]
    for(const row of db.prepare('SELECT id,title,asset_id FROM recall_materials WHERE service_id=? AND owner_user_id=? AND id>? ORDER BY id').iterate(a.serviceId,a.userId,after)){
      if(!this.allowed(a,String(row.asset_id),now))continue
      items.push({id:String(row.id),title:String(row.title)});if(items.length===51)break
    }
    return {items:items.slice(0,50),next:items.length>50?items[49]!.id:null}
  })}
  get(prior:SessionActor,id:string){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now);return this.practice(db,a,this.material(db,a,id,now),now)
  })}
  create(prior:SessionActor,expected:string,key:string,draft:RecallDraft){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now,expected),digest=sha(JSON.stringify(draft))
    const old=db.prepare('SELECT id,request_digest FROM recall_materials WHERE service_id=? AND owner_user_id=? AND request_key=?').get(a.serviceId,a.userId,key)
    if(old){
      const m=this.material(db,a,String(old.id),now)
      if(old.request_digest!==digest)throw new AssetError(409,'IDEMPOTENCY_CONFLICT')
      return {data:this.practice(db,a,m,now),replayed:true}
    }
    if(!draft.title.trim()||draft.title.length>200||!draft.masks.length)throw invalid()
    const first=this.source(db,a,point(draft,draft.first.ordinal),now)
    const read=(n:number)=>n===first.ordinal?first.text:this.source(db,a,point(draft,n),now).text
    const segments=recallSelection(draft.first,draft.last,draft.interior_hashes,first.total,read),masks=recallMasks(segments,draft.masks,read),id=randomUUID()
    const m={id,title:draft.title,asset_id:draft.asset_id,version_id:draft.version_id,conversion_id:draft.conversion_id??null}
    db.prepare('INSERT INTO recall_materials VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,a.userId,a.serviceId,m.asset_id,m.version_id,m.conversion_id,m.title,now,key,digest)
    const insert=db.prepare('INSERT INTO recall_segments VALUES(?,?,?,?,?)')
    for(const s of segments)insert.run(id,s.ordinal,s.start,s.end,s.source_hash)
    const maskInsert=db.prepare('INSERT INTO recall_masks VALUES(?,?,?,?,?)')
    for(const mask of masks)maskInsert.run(id,mask.ordinal,mask.start,mask.end,mask.group)
    db.prepare('INSERT INTO recall_attempts VALUES(?,?,1)').run(id,draft.first.ordinal)
    return {data:this.practice(db,a,m,now),replayed:false}
  })}
  act(prior:SessionActor,expected:string,id:string,key:string,action:RecallAction){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now,expected),m=this.material(db,a,id,now),digest=sha(JSON.stringify(action))
    const priorEvent=db.prepare('SELECT request_digest FROM recall_events WHERE material_id=? AND request_key=?').get(id,key)
    if(priorEvent){
      if(priorEvent.request_digest!==digest)throw new AssetError(409,'IDEMPOTENCY_CONFLICT')
      return this.practice(db,a,m,now)
    }
    const attempt=db.prepare('SELECT active_ordinal,revision FROM recall_attempts WHERE material_id=?').get(id)!
    if(attempt.revision!==action.expected_revision)throw new AssetError(409,'REVISION_CONFLICT')
    const {event,value}=action,ordinal=event==='move'?value:Number(attempt.active_ordinal)
    if(!Number.isSafeInteger(value)||value<1)throw invalid()
    if(event==='move'){
      if(!db.prepare('SELECT 1 FROM recall_segments WHERE material_id=? AND ordinal=?').get(id,ordinal))throw invalid()
    }else if(event==='hint'||event==='reveal'||event==='recall'){
      if(!db.prepare('SELECT 1 FROM recall_masks WHERE material_id=? AND ordinal=? AND mask_group=?').get(id,ordinal,value))throw invalid()
      if(event==='recall'&&db.prepare("SELECT 1 FROM recall_events WHERE material_id=? AND value=? AND event IN ('hint','reveal','recall')").get(id,value))
        throw new AssetError(409,'RECALL_NOT_INDEPENDENT')
    }else if(event==='rating'?value>5:true)throw invalid()
    const revision=action.expected_revision+1
    db.prepare('UPDATE recall_attempts SET active_ordinal=?,revision=? WHERE material_id=?').run(ordinal,revision,id)
    db.prepare('INSERT INTO recall_events VALUES(?,?,?,?,?,?,?)').run(id,revision,key,digest,event,value,now)
    // Projection verifies the pinned page too; a failed projection rolls the event back.
    return this.practice(db,a,m,now)
  })}
}
