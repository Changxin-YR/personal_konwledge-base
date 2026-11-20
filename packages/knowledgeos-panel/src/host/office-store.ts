import {randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError,type BlobRef} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import type {ParseTx} from './parse-store.ts'
import {WORD_MEDIA} from './office-schema.ts'
import type {AuthorizationAction} from './authorization.ts'

type Permit=(session:string,user:string,asset:string,action:AuthorizationAction,now:string)=>boolean
const missing=()=>new AssetError(404,'ASSET_NOT_FOUND')
const keyPattern=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const checkKey=(key:string)=>{if(!keyPattern.test(key)||key.length!==36)throw new AssetError(422,'INVALID_IDEMPOTENCY_KEY')}
const deadline=(now:string)=>new Date(Date.parse(now)+15_000).toISOString()
const due="state='queued' OR (state='running' AND lease_until<=?)"
const sourceSQL=`SELECT v.asset_id,v.id AS version_id,b.media_type,b.sha256,b.byte_length,b.storage_key,
  NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS head
  FROM asset_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND b.media_type IN (?,?)`

export class OfficeStore {
  constructor(private tx:ParseTx,private permit:Permit){}

  private sourceRow(db:DatabaseSync,v:string){return db.prepare(sourceSQL).get(v,WORD_MEDIA.doc,WORD_MEDIA.docx)}
  private access(db:DatabaseSync,now:string,a:SessionActor,id:string,v:string,action:AuthorizationAction){
    if(!this.permit(a.sessionId,a.userId,id,'read',now)||(action!=='read'&&!this.permit(a.sessionId,a.userId,id,action,now)))throw missing()
    const row=this.sourceRow(db,v);if(!row||row.asset_id!==id)throw missing();return row
  }

  list(a:SessionActor,id:string,v:string){return this.tx('read',(db,now)=>{
    this.access(db,now,a,id,v,'read')
    const rows=db.prepare('SELECT id,state,page_count,missing_fonts,failure_code FROM office_conversions WHERE version_id=? ORDER BY rowid DESC').all(v)
    const notes=db.prepare('SELECT id,page,body FROM office_quality_notes WHERE conversion_id=? ORDER BY rowid')
    return {version_id:v,conversions:rows.map(r=>({...r,missing_fonts:r.missing_fonts?JSON.parse(String(r.missing_fonts)):[],notes:notes.all(r.id!)}))}
  })}

  start(a:SessionActor,id:string,v:string,key:string){return this.tx('write',(db,now)=>{
    const row=this.access(db,now,a,id,v,'edit');checkKey(key)
    const prev=db.prepare('SELECT id,version_id,state FROM office_conversions WHERE actor_id=? AND request_key=?').get(a.userId,key)
    if(prev){if(prev.version_id!==v)throw new AssetError(409,'IDEMPOTENCY_CONFLICT');return {id:String(prev.id),state:String(prev.state),replayed:true}}
    if(!row.head)throw new AssetError(409,'SOURCE_CHANGED')
    if(db.prepare("SELECT 1 FROM office_conversions WHERE version_id=? AND state IN ('queued','running')").get(v))throw new AssetError(409,'CONVERSION_IN_PROGRESS')
    const cid=randomUUID()
    db.prepare("INSERT INTO office_conversions(id,version_id,actor_id,request_key,state,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(cid,v,a.userId,key,now,now)
    db.prepare('INSERT INTO office_authorizations VALUES(?,?)').run(cid,a.sessionId)
    return {id:cid,state:'queued',replayed:false}
  })}

  cancel(a:SessionActor,id:string,v:string,cid:string){return this.tx('write',(db,now)=>{
    this.access(db,now,a,id,v,'edit')
    const row=db.prepare('SELECT state FROM office_conversions WHERE id=? AND version_id=?').get(cid,v);if(!row)throw missing()
    if(row.state!=='cancelled'){
      if(row.state!=='running'&&row.state!=='queued')throw new AssetError(409,'CONVERSION_NOT_ACTIVE')
      db.prepare("UPDATE office_conversions SET state='cancelled',failure_code='CANCELLED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now,cid)
    }
    return {id:cid,state:'cancelled'}
  })}

  result(a:SessionActor,id:string,v:string,cid:string,download:boolean){return this.tx('read',(db,now)=>{
    this.access(db,now,a,id,v,download?'export':'read')
    const row=db.prepare("SELECT b.storage_key,b.byte_length,b.sha256 FROM office_conversions c JOIN blobs b ON b.id=c.result_blob_id WHERE c.id=? AND c.version_id=? AND c.state='ready' AND b.media_type='application/pdf'").get(cid,v)
    if(!row)throw missing();return {key:String(row.storage_key),byteLength:Number(row.byte_length),sha256:String(row.sha256)}
  })}

  note(a:SessionActor,id:string,v:string,cid:string,key:string,page:number,body:string){return this.tx('write',(db,now)=>{
    this.access(db,now,a,id,v,'edit');checkKey(key)
    const row=db.prepare("SELECT page_count FROM office_conversions WHERE id=? AND version_id=? AND state='ready'").get(cid,v);if(!row)throw missing()
    if(!Number.isSafeInteger(page)||page<1||page>Number(row.page_count)||typeof body!=='string'||!body.trim()||body.length>2000||body.includes('\0'))throw new AssetError(422,'INVALID_QUALITY_NOTE')
    const prev=db.prepare('SELECT id,conversion_id,page,body FROM office_quality_notes WHERE author_id=? AND request_key=?').get(a.userId,key)
    if(prev){if(prev.conversion_id!==cid||prev.page!==page||prev.body!==body)throw new AssetError(409,'IDEMPOTENCY_CONFLICT');return {id:String(prev.id),replayed:true}}
    const note=randomUUID();db.prepare('INSERT INTO office_quality_notes VALUES(?,?,?,?,?,?,?)').run(note,cid,a.userId,page,body,now,key);return {id:note,replayed:false}
  })}

  claim(){
    if(!this.tx('read',(db,now)=>db.prepare(`SELECT 1 FROM office_conversions WHERE ${due} LIMIT 1`).get(now)))return
    return this.tx('write',(db,now)=>{
      const row=db.prepare(`SELECT id,attempt FROM office_conversions WHERE ${due} ORDER BY rowid LIMIT 1`).get(now);if(!row)return
      if(Number(row.attempt)>=3){db.prepare("UPDATE office_conversions SET state='failed',failure_code='LEASE_EXPIRED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now,row.id!);return}
      const token=randomUUID();db.prepare("UPDATE office_conversions SET state='running',attempt=attempt+1,lease_token=?,lease_until=?,updated_at=? WHERE id=?").run(token,deadline(now),now,row.id!)
      return this.authority(db,now,token)?{token}:undefined
    })
  }

  private authority(db:DatabaseSync,now:string,token:string){
    const row=db.prepare(`SELECT c.id,c.actor_id,c.version_id,a.session_id FROM office_conversions c LEFT JOIN office_authorizations a ON a.conversion_id=c.id
      WHERE c.state='running' AND c.lease_token=? AND c.lease_until>?`).get(token,now);if(!row)return
    const source=this.sourceRow(db,String(row.version_id)),session=String(row.session_id),user=String(row.actor_id),asset=String(source?.asset_id)
    if(!source?.head||!row.session_id||!this.permit(session,user,asset,'read',now)||!this.permit(session,user,asset,'edit',now)){
      db.prepare('UPDATE office_conversions SET state=?,failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(source?.head?'failed':'superseded',source?.head?'AUTHORIZATION_LOST':'SOURCE_CHANGED',now,row.id!);return
    }
    return {assetId:asset,versionId:String(row.version_id),key:String(source.storage_key),sha256:String(source.sha256),byteLength:Number(source.byte_length),extension:source.media_type===WORD_MEDIA.doc?'doc' as const:'docx' as const}
  }
  source(token:string){return this.tx('write',(db,now)=>this.authority(db,now,token))}
  renew(token:string){return this.tx('write',(db,now)=>!!this.authority(db,now,token)&&!!db.prepare('UPDATE office_conversions SET lease_until=? WHERE lease_token=?').run(deadline(now),token).changes)}
  complete(token:string,blob:BlobRef,pageCount:number,fonts:readonly string[]){return this.tx('write',(db,now)=>{
    if(!this.authority(db,now,token))return false
    if(!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>10000||!Number.isSafeInteger(blob.byteLength)||blob.byteLength<=0||blob.byteLength>64*1024*1024||!Array.isArray(fonts)||fonts.length>1024||fonts.some(f=>typeof f!=='string'||f.length>512))throw new AssetError(422,'INVALID_OFFICE_RESULT')
    const bid=randomUUID();db.prepare("INSERT INTO blobs VALUES(?,?,?,?,'application/pdf')").run(bid,blob.key,blob.sha256,blob.byteLength)
    db.prepare("UPDATE office_conversions SET state='ready',result_blob_id=?,page_count=?,missing_fonts=?,failure_code=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(bid,pageCount,JSON.stringify(fonts),now,token);return true
  })}
  fail(token:string,code:string){this.tx('write',(db,now)=>{
    if(!this.authority(db,now,token))return
    db.prepare("UPDATE office_conversions SET state='failed',failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(/^[a-zA-Z0-9_-]{1,64}$/.test(code)?code:'CONVERSION_FAILED',now,token)
  })}
}
