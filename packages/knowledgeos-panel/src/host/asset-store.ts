import {createHash, randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import type {SessionActor} from './identity.ts'
import type {AuthorizationAction} from './authorization.ts'
import type {WordMedia} from './office-schema.ts'

export const ASSET_SCHEMA = `CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type='application/pdf')
) STRICT;
CREATE TABLE assets (id TEXT PRIMARY KEY REFERENCES knowledge_objects(id)) STRICT;
CREATE TABLE asset_versions (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), version INTEGER NOT NULL CHECK(version>0),
  parent_version_id TEXT REFERENCES asset_versions(id), blob_id TEXT NOT NULL UNIQUE REFERENCES blobs(id),
  original_name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, UNIQUE(asset_id,version), UNIQUE(created_by,idempotency_key)
) STRICT;`

export class AssetError extends Error { constructor(readonly status:number, readonly code:string) { super(code) } }
export interface ImportSpec {title:string; key:string; assetId?:string; expectedVersion?:number}
export interface BlobRef {key:string; sha256:string; byteLength:number}
export type TextMedia='text/plain'|'text/markdown'
export interface IndexedText {media:TextMedia;encoding:string;blocks:{kind:string;start:number;end:number;text:string;anchor:string}[]}
export interface AssetReceipt {id:string;title:string;version_id:string;version:number;sha256:string;byte_length:number;media_type?:TextMedia|WordMedia}
type Tx = <T>(mode:'read'|'write',op:(db:DatabaseSync, now:string)=>T)=>T
const receiptSQL = `SELECT v.asset_id AS id,v.original_name AS title,v.id AS version_id,v.version,b.sha256,b.byte_length,b.media_type FROM asset_versions v JOIN blobs b ON b.id=v.blob_id `
function receipt(row:Record<string,unknown>):AssetReceipt {
  const {media_type,...rest}=row
  return (media_type==='application/pdf'?rest:{...rest,media_type}) as unknown as AssetReceipt
}

export class AssetStore {
  constructor(private tx:Tx, private current:(actor:SessionActor,now:string)=>SessionActor|undefined,
    private allowed:(actor:SessionActor,id:string,action:AuthorizationAction,now:string)=>boolean) {}

  private actor(prior:SessionActor,now:string) {const actor=this.current(prior,now);if(!actor)throw new AssetError(401,'AUTH_REQUIRED');return actor}
  private check(actor:SessionActor,id:string,action:AuthorizationAction,now:string) {if(!this.allowed(actor,id,action,now))throw new AssetError(404,'ASSET_NOT_FOUND')}

  publish(prior:SessionActor, spec:ImportSpec, blob:BlobRef,format?:IndexedText|{media:WordMedia},onPublish?:(db:DatabaseSync,actor:SessionActor,receipt:AssetReceipt)=>void):{receipt:AssetReceipt;replayed:boolean} {
    const text=format && 'blocks' in format ? format : undefined
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now), digest=createHash('sha256').update(JSON.stringify([spec.title,spec.assetId??null,spec.expectedVersion??null,blob.sha256,blob.byteLength,...(text?[text.media,text.encoding]:format?[format.media]:[])])).digest('hex')
      const prev=db.prepare('SELECT id,asset_id,request_digest FROM asset_versions WHERE created_by=? AND idempotency_key=?').get(actor.userId,spec.key)
      if(prev){this.check(actor,String(prev.asset_id),'read',now);this.check(actor,String(prev.asset_id),'edit',now);if(prev.request_digest!==digest)throw new AssetError(409,'IDEMPOTENCY_CONFLICT');const r=receipt(db.prepare(receiptSQL+'WHERE v.id=?').get(prev.id!)!);onPublish?.(db,actor,r);return {receipt:r,replayed:true}}
      const id=spec.assetId??randomUUID(), vid=randomUUID(), bid=randomUUID();let version=1,parent:string|null=null
      if(spec.assetId){
        this.check(actor,id,'read',now);this.check(actor,id,'edit',now)
        const last=db.prepare('SELECT id,version FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1').get(id)
        if(!last)throw new AssetError(404,'ASSET_NOT_FOUND');if(last.version!==spec.expectedVersion)throw new AssetError(409,'VERSION_CONFLICT')
        version=Number(last.version)+1;parent=String(last.id);db.prepare('UPDATE knowledge_objects SET revision=revision+1,updated_at=? WHERE id=?').run(now,id)
        db.prepare("UPDATE office_conversions SET state='superseded',lease_token=NULL,lease_until=NULL,failure_code='SOURCE_CHANGED',updated_at=? WHERE version_id=? AND state IN ('queued','running')").run(now,parent)
      }else{
        db.prepare(`INSERT INTO knowledge_objects (id,service_id,space_id,scope_kind,project_id,owner_user_id,object_type,title,body,status,revision,created_at,updated_at) VALUES (?,?,?,'personal',NULL,?,'asset',?,'','active',1,?,?)`).run(id,actor.serviceId,actor.personalSpaceId,actor.userId,spec.title,now,now)
        db.prepare('INSERT INTO assets VALUES (?)').run(id)
      }
      db.prepare('INSERT INTO blobs VALUES (?,?,?,?,?)').run(bid,blob.key,blob.sha256,blob.byteLength,format?.media??'application/pdf')
      db.prepare('INSERT INTO asset_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(vid,id,version,parent,bid,spec.title,actor.userId,now,spec.key,digest)
      if(text){
        db.prepare('INSERT INTO text_versions VALUES(?,?,?)').run(vid,text.encoding,text.blocks.length)
        const insert=db.prepare('INSERT INTO text_blocks VALUES(?,?,?,?,?,?,?)')
        text.blocks.forEach((b,i)=>insert.run(vid,i+1,b.kind,b.start,b.end,b.text,b.anchor))
      }
      const published={id,title:spec.title,version_id:vid,version,sha256:blob.sha256,byte_length:blob.byteLength,...(format?{media_type:format.media}:{})}
      onPublish?.(db,actor,published)
      return {receipt:published,replayed:false}
    })
  }

  list(prior:SessionActor):AssetReceipt[] { return this.tx('read',(db,now)=>{
    const actor=this.actor(prior,now);return db.prepare(receiptSQL+`JOIN knowledge_objects o ON o.id=v.asset_id
      WHERE o.service_id=? AND o.status='active' AND (o.owner_user_id=? OR EXISTS(
        SELECT 1 FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
        WHERE i.object_id=o.id AND i.service_id=o.service_id AND r.user_id=? AND i.revoked_at IS NULL
          AND r.revoked_at IS NULL AND r.expires_at=i.expires_at AND r.expires_at>?))
      ORDER BY v.created_at DESC,v.version DESC,v.id`).all(actor.serviceId,actor.userId,actor.userId,now).filter(v=>this.allowed(actor,String(v.id),'read',now)).map(receipt)
  }) }

  original(prior:SessionActor,id:string,versionId:string,download:boolean) {return this.tx('read',(db,now)=>{
    const actor=this.actor(prior,now);this.check(actor,id,'read',now);if(download)this.check(actor,id,'export',now)
    const r=db.prepare('SELECT b.storage_key,b.sha256,b.byte_length,b.media_type,t.encoding FROM asset_versions v JOIN blobs b ON b.id=v.blob_id LEFT JOIN text_versions t ON t.version_id=v.id WHERE v.asset_id=? AND v.id=?').get(id,versionId)
    if(!r)throw new AssetError(404,'ASSET_NOT_FOUND');return {key:String(r.storage_key),sha256:String(r.sha256),byteLength:Number(r.byte_length),...(r.media_type==='application/pdf'?{}:{media:String(r.media_type)}),...(typeof r.encoding==='string'?{encoding:r.encoding}:{})}
  })}

  blocks(prior:SessionActor,id:string,v:string,from:number,limit:number){return this.tx('read',(db,now)=>{
    const actor=this.actor(prior,now);this.check(actor,id,'read',now)
    if(!Number.isSafeInteger(from)||from<1||!Number.isSafeInteger(limit)||limit<1||limit>10)throw new AssetError(422,'INVALID_BLOCK_RANGE')
    const meta=db.prepare('SELECT encoding,block_count AS total FROM text_versions t JOIN asset_versions a ON a.id=t.version_id WHERE a.asset_id=? AND a.id=?').get(id,v)
    if(!meta)throw new AssetError(404,'ASSET_NOT_FOUND')
    return {version_id:v,...meta,blocks:db.prepare('SELECT ordinal,kind,start,end,text,anchor FROM text_blocks WHERE version_id=? AND ordinal>=? ORDER BY ordinal LIMIT ?').all(v,from,limit)}
  })}
}
