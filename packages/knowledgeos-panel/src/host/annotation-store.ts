import type {DatabaseSync,SQLOutputValue} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import {AssetError} from './asset-store.ts'
import type {CitationSpec,ReaderTarget} from './citation-store.ts'

export const ANNOTATION_SCHEMA=`CREATE TABLE reader_annotations (
  id TEXT PRIMARY KEY, citation_id TEXT NOT NULL REFERENCES citations(id),
  author_id TEXT NOT NULL REFERENCES users(id), project_id TEXT REFERENCES knowledge_projects(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), revision INTEGER NOT NULL CHECK(revision>=1)
) STRICT;
CREATE INDEX reader_annotations_citation ON reader_annotations(citation_id);`

export type AnnotationDraft={citation_id:string;body:string;visibility:'private'|'project'}
export type AnnotationAccess={project_id?:string;canComment:boolean}
type Row=Record<string,SQLOutputValue>
const records=`SELECT a.id,a.citation_id,a.author_id,a.project_id,a.body,a.revision,c.ordinal,c.start,c.end,c.source_hash,c.conversion_id
  FROM reader_annotations a JOIN citations c ON c.id=a.citation_id`
const inSource='c.asset_id=? AND c.version_id=? AND c.ordinal=? AND c.conversion_id IS ?'
const args=(t:ReaderTarget)=>[t.asset_id,t.version_id,t.ordinal,t.conversion_id??null] as const
const hidden=()=>new AssetError(404,'ANNOTATION_NOT_FOUND')
export const visibleAnnotation=(r:Row,user:string,scope:AnnotationAccess)=>r.project_id===null?r.author_id===user:r.project_id===scope.project_id

function dto(r:Row,user:string,scope:AnnotationAccess){return {
  id:String(r.id),citation_id:String(r.citation_id),ordinal:Number(r.ordinal),start:Number(r.start),end:Number(r.end),source_hash:String(r.source_hash),
  ...(r.conversion_id?{conversion_id:String(r.conversion_id)}:{}),visibility:r.project_id?'project':'private',body:String(r.body),revision:Number(r.revision),
  can_edit:r.author_id===user&&scope.canComment,
}}
export function listAnnotations(db:DatabaseSync,t:ReaderTarget,user:string,scope:AnnotationAccess){
  const rows=db.prepare(`${records} WHERE ${inSource} AND ((a.project_id IS NULL AND a.author_id=?) OR a.project_id=?) ORDER BY a.rowid`).all(...args(t),user,scope.project_id??null)
  return {actor_id:user,can_comment:scope.canComment,can_share:scope.canComment&&Boolean(scope.project_id),items:rows.map(r=>dto(r,user,scope))}
}
export function insertAnnotation(db:DatabaseSync,t:ReaderTarget,user:string,scope:AnnotationAccess,draft:AnnotationDraft,citation:CitationSpec){
  const project=draft.visibility==='project'?scope.project_id:null
  if(draft.visibility==='project'&&!project)throw new AssetError(422,'ANNOTATION_SCOPE_UNAVAILABLE')
  const count=db.prepare(`${records.replace(/^SELECT[\s\S]*?FROM/,'SELECT count(*) AS n FROM')} WHERE ${inSource} AND a.project_id IS ?${project?'':' AND a.author_id=?'}`).get(...args(t),project??null,...(project?[]:[user]))
  if(Number(count?.n)>=200)throw new AssetError(409,'ANNOTATION_LIMIT')
  const id=randomUUID()
  db.prepare('INSERT INTO reader_annotations VALUES(?,?,?,?,?,1)').run(id,draft.citation_id,user,project??null,draft.body)
  return dto({...citation,id,citation_id:draft.citation_id,author_id:user,project_id:project??null,body:draft.body,revision:1},user,scope)
}
export function mutateAnnotation(db:DatabaseSync,t:ReaderTarget,user:string,scope:AnnotationAccess,id:string,revision:number,body?:string){
  const row=db.prepare(`${records} WHERE ${inSource} AND a.id=? AND a.author_id=?`).get(...args(t),id,user)
  if(!row||!visibleAnnotation(row,user,scope))throw hidden()
  if(row.revision!==revision)throw new AssetError(409,'ANNOTATION_REVISION_CONFLICT')
  if(body===undefined){db.prepare('DELETE FROM reader_annotations WHERE id=?').run(id);return {id}}
  db.prepare('UPDATE reader_annotations SET body=?,revision=? WHERE id=?').run(body,revision+1,id)
  return dto({...row,body,revision:revision+1},user,scope)
}
