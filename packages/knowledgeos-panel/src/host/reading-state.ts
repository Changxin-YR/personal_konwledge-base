import type {DatabaseSync, SQLOutputValue} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {AssetError} from './asset-store.ts'
import type {ReaderSource} from './citation-store.ts'

const pointColumns = `ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 1000000),
  conversion_id TEXT REFERENCES office_conversions(id), source_hash TEXT NOT NULL CHECK(length(source_hash)=64)`
export const READING_STATE_SCHEMA = `CREATE TABLE reading_positions (
  user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ${pointColumns}, revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(user_id,version_id)
) STRICT;
CREATE TABLE reading_bookmarks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ${pointColumns}, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120)
) STRICT;
CREATE INDEX reading_bookmarks_scope ON reading_bookmarks(user_id,version_id);`

export type ReadingPoint = {ordinal:number;conversion_id?:string;source_hash:string}
export const canRemember = (s:ReaderSource) => s.state==='ready'||s.state==='review'
export const positionHash = (s:ReaderSource) => s.kind==='office' ? s.ref!.sha256 : createHash('sha256').update(s.text).digest('hex')
export const samePoint = (s:ReaderSource,p:ReadingPoint) => canRemember(s)&&s.ordinal===p.ordinal&&s.conversion_id===p.conversion_id&&positionHash(s)===p.source_hash
type Row = Record<string,SQLOutputValue>
const point=(r:Row):ReadingPoint=>({ordinal:Number(r.ordinal),source_hash:String(r.source_hash),...(r.conversion_id?{conversion_id:String(r.conversion_id)}:{})})
const columns='ordinal,conversion_id,source_hash'

export function readNavigation(db:DatabaseSync,user:string,version:string,valid:(p:ReadingPoint)=>boolean){
  const r=db.prepare(`SELECT revision,${columns} FROM reading_positions WHERE user_id=? AND version_id=?`).get(user,version)
  const p=r?point(r):null
  const bookmarks=db.prepare(`SELECT id,title,${columns} FROM reading_bookmarks WHERE user_id=? AND version_id=? ORDER BY rowid`).all(user,version)
  return {actor_id:user,revision:Number(r?.revision??0),position:p&&valid(p)?p:null,bookmarks:bookmarks.map(r=>({id:String(r.id),title:String(r.title),...point(r)}))}
}

export function savePosition(db:DatabaseSync,user:string,version:string,p:ReadingPoint,expected:number){
  const revision=expected+1
  const change=expected===0
    ? db.prepare('INSERT INTO reading_positions(user_id,version_id,ordinal,conversion_id,source_hash,revision) VALUES(?,?,?,?,?,1) ON CONFLICT DO NOTHING').run(user,version,p.ordinal,p.conversion_id??null,p.source_hash)
    : db.prepare('UPDATE reading_positions SET ordinal=?,conversion_id=?,source_hash=?,revision=? WHERE user_id=? AND version_id=? AND revision=?').run(p.ordinal,p.conversion_id??null,p.source_hash,revision,user,version,expected)
  if(change.changes!==1)throw new AssetError(409,'READING_REVISION_CONFLICT')
  return {revision,position:{ordinal:p.ordinal,source_hash:p.source_hash,...(p.conversion_id?{conversion_id:p.conversion_id}:{})}}
}

export function createBookmark(db:DatabaseSync,user:string,version:string,p:ReadingPoint,title:string){
  if(Number(db.prepare('SELECT count(*) AS n FROM reading_bookmarks WHERE user_id=? AND version_id=?').get(user,version)?.n)>=200)throw new AssetError(409,'BOOKMARK_LIMIT')
  const id=randomUUID()
  db.prepare('INSERT INTO reading_bookmarks(id,user_id,version_id,ordinal,conversion_id,source_hash,title) VALUES(?,?,?,?,?,?,?)').run(id,user,version,p.ordinal,p.conversion_id??null,p.source_hash,title)
  return {id,title,ordinal:p.ordinal,source_hash:p.source_hash,...(p.conversion_id?{conversion_id:p.conversion_id}:{})}
}
