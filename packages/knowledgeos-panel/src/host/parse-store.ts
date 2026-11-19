import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import type { SessionActor } from './identity.ts'

export const PARSE_SCHEMA = `CREATE TABLE pdf_parse_runs (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('queued','running','complete','partial','failed','cancelled')),
  total INTEGER NOT NULL DEFAULT 0 CHECK(total BETWEEN 0 AND 10000), token TEXT UNIQUE, deadline INTEGER,
  losses INTEGER NOT NULL DEFAULT 0, error TEXT, CHECK ((state='running')=(token IS NOT NULL)), CHECK ((token IS NULL)=(deadline IS NULL))
) STRICT;
CREATE TABLE pdf_pages (
  version_id TEXT NOT NULL REFERENCES pdf_parse_runs(version_id), page INTEGER NOT NULL CHECK(page>=1),
  state TEXT NOT NULL CHECK(state IN ('pending','ready','review','failed')), chapter TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '', error TEXT, generation INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(version_id,page)
) STRICT;
CREATE INDEX pdf_pending ON pdf_pages(version_id,state,page);`

export type ParseTx = <T>(mode:'read'|'write', op:(db:DatabaseSync, now:string)=>T)=>T
type Permit = (session:string,user:string,id:string,write:boolean,now:string)=>boolean
const leaseMs = 15_000
export interface PageResult { text:string; needsReview:boolean; chapter:string }

export class ParseStore {
  constructor(private tx:ParseTx, private permit:Permit) {}

  operation(actor:SessionActor,v:string) {
    const id=this.tx('read',(db,now)=>{
      const r=db.prepare('SELECT v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id WHERE r.version_id=?').get(v)
      if(!r || !this.permit(actor.sessionId,actor.userId,String(r.asset_id),false,now))throw new AssetError(404,'ASSET_NOT_FOUND')
      return String(r.asset_id)
    })
    return this.control(actor,id,v,'status')
  }

  pages(actor:SessionActor,id:string,v:string,from:number,limit:number) {
    if(!Number.isSafeInteger(from)||from<1||!Number.isSafeInteger(limit)||limit<1||limit>10)throw new AssetError(422,'INVALID_PAGE_RANGE')
    return this.tx('read',(db,now)=>{
      if(!this.permit(actor.sessionId,actor.userId,id,false,now)||!db.prepare('SELECT 1 FROM asset_versions WHERE asset_id=? AND id=?').get(id,v))throw new AssetError(404,'ASSET_NOT_FOUND')
      const rows=db.prepare(`SELECT page,state,chapter,error,CASE WHEN state IN ('ready','review') THEN text ELSE NULL END AS text
        FROM pdf_pages WHERE version_id=? AND page>=? ORDER BY page LIMIT ?`).all(v,from,limit)
      return {version_id:v,from,pages:rows}
    })
  }

  control(actor:SessionActor,id:string,v:string,op:'status'|'start'|'cancel'|'retry',page?:number) {
    return this.tx(op==='status'?'read':'write',(db,now)=>{
      if(!this.permit(actor.sessionId,actor.userId,id,op!=='status',now) ||
        !db.prepare('SELECT 1 FROM asset_versions WHERE asset_id=? AND id=?').get(id,v)) throw new AssetError(404,'ASSET_NOT_FOUND')
      const prev=db.prepare('SELECT state FROM pdf_parse_runs WHERE version_id=?').get(v)
      if(op==='start') {
        if(!prev) db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v,actor.sessionId,actor.userId)
        else if(['failed','cancelled'].includes(String(prev.state))) {
          db.prepare("UPDATE pdf_parse_runs SET session_id=?,user_id=?,state='queued',error=NULL,losses=0 WHERE version_id=?").run(actor.sessionId,actor.userId,v)
        }
      } else if(op==='cancel') {
        if(!prev || !['running','queued','cancelled'].includes(String(prev.state))) throw new AssetError(409,'PARSE_NOT_ACTIVE')
        db.prepare("UPDATE pdf_parse_runs SET state='cancelled',token=NULL,deadline=NULL,error='CANCELLED' WHERE version_id=?").run(v)
      } else if(op==='retry') {
        if(!prev || prev.state!=='partial' || !page || !db.prepare("UPDATE pdf_pages SET state='pending',error=NULL WHERE version_id=? AND page=? AND state IN ('failed','review')").run(v,page).changes) throw new AssetError(409,'PAGE_NOT_RETRYABLE')
        db.prepare("UPDATE pdf_parse_runs SET state='queued',session_id=?,user_id=?,error=NULL,losses=0 WHERE version_id=?").run(actor.sessionId,actor.userId,v)
      }
      const run=db.prepare('SELECT state,total,error FROM pdf_parse_runs WHERE version_id=?').get(v)
      return {state:run?.state??'idle',total:run?.total??0,error:run?.error??null,pages:db.prepare('SELECT page,state,chapter,error FROM pdf_pages WHERE version_id=? ORDER BY page').all(v)}
    })
  }

  claim() {
    // An idle worker must not take SQLite's writer reservation just to poll.
    if(!this.tx('read',(db,now)=>db.prepare("SELECT 1 FROM pdf_parse_runs WHERE state='queued' OR (state='running' AND deadline<=?) LIMIT 1").get(Date.parse(now))))return
    return this.tx('write',(db,now)=>{
      const ms=Date.parse(now)
      db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN losses>=3 THEN 'failed' ELSE 'queued' END,losses=losses+1,
        token=NULL,deadline=NULL,error='LEASE_EXPIRED' WHERE state='running' AND deadline<=?`).run(ms)
      const r=db.prepare(`SELECT r.version_id,r.session_id,r.user_id,v.asset_id,b.storage_key,b.sha256,b.byte_length
        FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id JOIN blobs b ON b.id=v.blob_id WHERE r.state='queued' ORDER BY r.rowid LIMIT 1`).get()
      if(!r)return
      const version=String(r.version_id)
      if(!this.permit(String(r.session_id),String(r.user_id),String(r.asset_id),true,now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',error='AUTHORIZATION_LOST' WHERE version_id=?").run(version);return
      }
      const token=randomUUID()
      db.prepare("UPDATE pdf_parse_runs SET state='running',token=?,deadline=?,error=NULL WHERE version_id=?").run(token,ms+leaseMs,version)
      return {version,token,key:String(r.storage_key),sha256:String(r.sha256),byteLength:Number(r.byte_length)}
    })
  }

  private leased<T>(token:string, op:(db:DatabaseSync,v:string,ms:number)=>T) {
    return this.tx('write',(db,now)=>{
      const ms=Date.parse(now),r=db.prepare(`SELECT r.*,v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id
        WHERE token=? AND state='running' AND deadline>?`).get(token,ms)
      if(!r)return undefined
      if(!this.permit(String(r.session_id),String(r.user_id),String(r.asset_id),true,now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='AUTHORIZATION_LOST' WHERE token=?").run(token);return undefined
      }
      return op(db,String(r.version_id),ms)
    })
  }

  renew(token:string) {return this.leased(token,(db,_v,ms)=>Boolean(db.prepare('UPDATE pdf_parse_runs SET deadline=? WHERE token=?').run(ms+leaseMs,token).changes))}
  initialize(token:string,total:number) {
    if(!Number.isSafeInteger(total)||total<1||total>10000)throw Error('PAGE_COUNT_LIMIT')
    return this.leased(token,(db,v)=>{
      const before=Number(db.prepare('SELECT total FROM pdf_parse_runs WHERE version_id=?').get(v)!.total)
      if(before && before!==total)throw Error('PAGE_COUNT_CHANGED')
      if(!before){db.prepare('UPDATE pdf_parse_runs SET total=? WHERE version_id=?').run(total,v)
        const insert=db.prepare("INSERT INTO pdf_pages(version_id,page,state) VALUES(?,?,'pending')")
        for(let p=1;p<=total;p++)insert.run(v,p)
      }
      return true
    })
  }
  next(token:string) {return this.leased(token,(db,v)=>{
    const pending=db.prepare("SELECT page FROM pdf_pages WHERE version_id=? AND state='pending' ORDER BY page LIMIT 1").get(v)
    if(pending)return Number(pending.page)
    db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN EXISTS(SELECT 1 FROM pdf_pages WHERE version_id=? AND state IN ('failed','review'))
      THEN 'partial' ELSE 'complete' END,token=NULL,deadline=NULL,error=NULL WHERE version_id=?`).run(v,v)
    return null
  })}
  publish(token:string,page:number,result:PageResult|null) {return this.leased(token,(db,v)=>{
    if(result && (result.text.length>262144||result.chapter.length>512))throw Error('PAGE_OUTPUT_LIMIT')
    const state=result ? (result.needsReview||!result.text.trim()?'review':'ready'):'failed'
    const wrote=db.prepare(`UPDATE pdf_pages SET state=?,text=?,chapter=?,error=?,generation=generation+1
      WHERE version_id=? AND page=? AND state='pending'`).run(state,result?.text??'',result?.chapter??'',result?null:'PAGE_EXTRACTION_FAILED',v,page)
    if(wrote.changes)db.prepare('UPDATE pdf_parse_runs SET losses=0 WHERE version_id=?').run(v)
    return Boolean(wrote.changes)
  })}
  fail(token:string) {return this.leased(token,(db,v)=>db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='DOCUMENT_UNAVAILABLE' WHERE version_id=?").run(v))}
}
