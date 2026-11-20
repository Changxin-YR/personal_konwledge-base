import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError,type AssetReceipt,type BlobRef} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import type {ParseTx} from './parse-store.ts'

interface Member {ordinal:number;name:string;path:string;size:number;compressedSize:number;media:string|null;reason:string|null}
type Context=(actor:SessionActor,now:string)=>SessionActor|undefined
const notFound=()=>new AssetError(404,'IMPORT_NOT_FOUND')
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

export class ZipStore {
  constructor(private tx:ParseTx,private current:Context,private readable:(actor:SessionActor,id:string,now:string)=>boolean){}
  private actor(prior:SessionActor,now:string){const a=this.current(prior,now);if(!a)throw new AssetError(401,'AUTH_REQUIRED');return a}
  private owned(db:DatabaseSync,a:SessionActor,id:string){
    const row=db.prepare('SELECT id,title,storage_key,sha256,byte_length FROM zip_imports WHERE id=? AND owner_id=?').get(id,a.userId)
    if(!row)throw notFound();return row
  }
  stage(prior:SessionActor,spec:{key:string;title:string},blob:BlobRef,members:readonly Member[]){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now),old=db.prepare('SELECT * FROM zip_imports WHERE owner_id=? AND upload_key=?').get(a.userId,spec.key)
    if(old){if(old.sha256!==blob.sha256||old.byte_length!==blob.byteLength||old.title!==spec.title)throw new AssetError(409,'IDEMPOTENCY_CONFLICT');return {id:String(old.id),replayed:true}}
    const id=randomUUID();db.prepare('INSERT INTO zip_imports VALUES(?,?,?,?,?,?,?,?)').run(id,a.userId,spec.key,spec.title,blob.key,blob.sha256,blob.byteLength,now)
    const insert=db.prepare(`INSERT INTO zip_entries(id,import_id,ordinal,name,path,byte_length,compressed_size,media_type,reason,state,publish_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?)`)
    for(const m of members)insert.run(randomUUID(),id,m.ordinal,m.name,m.path,m.size,m.compressedSize,m.media,m.reason,randomUUID())
    return {id,replayed:false}
  })}
  list(prior:SessionActor){return this.tx('read',(db,now)=>db.prepare('SELECT id,title,byte_length,sha256,created_at FROM zip_imports WHERE owner_id=? ORDER BY created_at DESC,id').all(this.actor(prior,now).userId))}
  source(prior:SessionActor,id:string){return this.tx('read',(db,now)=>{const r=this.owned(db,this.actor(prior,now),id);return {key:String(r.storage_key),sha256:String(r.sha256),byteLength:Number(r.byte_length)}})}
  manifest(prior:SessionActor,id:string){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),r=this.owned(db,a,id)
    const rows=db.prepare(`SELECT e.id,e.name,e.path,e.byte_length AS size,e.compressed_size,e.media_type,e.reason,e.state,e.error,
      v.asset_id,v.id AS version_id,v.version,v.original_name,b.sha256,b.byte_length FROM zip_entries e
      LEFT JOIN asset_versions v ON v.id=e.version_id LEFT JOIN blobs b ON b.id=v.blob_id WHERE e.import_id=? ORDER BY e.ordinal`).all(id)
    const entries=rows.map(({asset_id,version_id,version,original_name,sha256,byte_length,...e})=>{
      const receipt=asset_id&&this.readable(a,String(asset_id),now)?{id:asset_id,version_id,version,title:original_name,sha256,byte_length,media_type:e.media_type}:undefined
      return {...e,...(receipt?{receipt}:{})}
    })
    const state=rows.some(x=>x.state==='selected')?'selected':rows.some(x=>x.state==='failed')?'partial':rows.some(x=>x.state==='imported')?'imported':'staged'
    return {id,title:r.title,byte_length:r.byte_length,sha256:r.sha256,state,entries}
  })}
  select(prior:SessionActor,id:string,key:string,ids:readonly string[]){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now);this.owned(db,a,id)
    if(!uuid.test(key)||!Array.isArray(ids)||!ids.length||ids.length>512||ids.some(x=>typeof x!=='string'||!uuid.test(x))||new Set(ids).size!==ids.length)throw new AssetError(422,'INVALID_SELECTION')
    const canonical=JSON.stringify([...ids].sort()),digest=createHash('sha256').update(canonical).digest('hex')
    const seen=db.prepare('SELECT import_id,selection_digest FROM zip_selections WHERE owner_id=? AND request_key=?').get(a.userId,key)
    if(seen&&(seen.import_id!==id||seen.selection_digest!==digest))throw new AssetError(409,'IDEMPOTENCY_CONFLICT')
    const get=db.prepare('SELECT id,ordinal,path,media_type,reason,state,publish_key FROM zip_entries WHERE import_id=? AND id=?')
    const members=ids.map(entry=>{const r=get.get(id,entry);if(!r||r.reason!==null||!r.media_type)throw new AssetError(422,'INVALID_SELECTION');return {id:entry,ordinal:Number(r.ordinal),path:String(r.path),media:String(r.media_type),key:String(r.publish_key),imported:r.state==='imported'}})
    if(!seen)db.prepare('INSERT INTO zip_selections VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,a.userId,key,digest,canonical,now)
    const mark=db.prepare("UPDATE zip_entries SET state='selected',error=NULL WHERE import_id=? AND id=? AND state IN ('available','failed')")
    for(const entry of ids)mark.run(id,entry)
    return members.sort((a,b)=>a.ordinal-b.ordinal)
  })}
  failure(prior:SessionActor,id:string,entry:string,code:string){this.tx('write',(db,now)=>{
    this.owned(db,this.actor(prior,now),id);db.prepare("UPDATE zip_entries SET state='failed',error=? WHERE import_id=? AND id=? AND state='selected'").run(code,id,entry)
  })}
  // Called inside AssetStore.publish's transaction; never open a nested transaction.
  publication(id:string,entry:string,key:string){return (db:DatabaseSync,a:SessionActor,r:AssetReceipt)=>{
    this.owned(db,a,id)
    const updated=db.prepare(`UPDATE zip_entries SET state='imported',version_id=?,error=NULL WHERE import_id=? AND id=? AND publish_key=?
      AND (state='selected' OR (state='imported' AND version_id=?))`).run(r.version_id,id,entry,key,r.version_id)
    if(updated.changes!==1)throw new AssetError(409,'SELECTION_CHANGED')
  }}
}
