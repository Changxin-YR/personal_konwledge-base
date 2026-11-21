import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import {noteId,noteKinds,noteLimits,noteText,type NoteDraft,type NoteKind,type NotePatch} from './note-input.ts'
import type {ParseTx} from './parse-store.ts'

export const NOTE_SCHEMA=`CREATE TABLE notes (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  note_kind TEXT NOT NULL CHECK(note_kind IN ('plain','reading','project','reflection')),
  revision INTEGER NOT NULL CHECK(revision>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  create_key TEXT NOT NULL, create_digest TEXT NOT NULL CHECK(length(create_digest)=64),
  UNIQUE(service_id, owner_user_id, create_key)
) STRICT;
CREATE INDEX notes_owner_order ON notes(service_id, owner_user_id, id);
CREATE TABLE note_nodes (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), parent_id TEXT,
  order_key INTEGER NOT NULL, body TEXT NOT NULL, body_revision INTEGER NOT NULL CHECK(body_revision>=1),
  UNIQUE(note_id,id), FOREIGN KEY(note_id,parent_id) REFERENCES note_nodes(note_id,id)
) STRICT;
CREATE UNIQUE INDEX note_single_root ON note_nodes(note_id) WHERE parent_id IS NULL;
CREATE TABLE note_references (
  id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES note_nodes(id), citation_id TEXT NOT NULL REFERENCES citations(id),
  UNIQUE(node_id,citation_id)
) STRICT;
CREATE TABLE project_note_refs (
  project_id TEXT NOT NULL REFERENCES knowledge_projects(id), note_id TEXT NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL, PRIMARY KEY(project_id,note_id)
) STRICT;`

type NoteMeta={id:string;title:string;kind:NoteKind;revision:number;updated_at:string}
const rowFields='id,title,note_kind AS kind,revision,updated_at'
const notFound=()=>new AssetError(404,'NOTE_NOT_FOUND')
const invalid=()=>new AssetError(422,'INVALID_NOTE')
const conflict=()=>new AssetError(409,'REVISION_CONFLICT')
function draftValid(d:NoteDraft){
  if(!noteText(d.title,noteLimits.title)||!d.title.trim()||!noteText(d.body,noteLimits.body)||!noteKinds.includes(d.kind))throw invalid()
}

export class NoteStore {
  constructor(private tx:ParseTx,private current:(actor:SessionActor,now:string)=>SessionActor|undefined,
    private canReadAsset:(actor:SessionActor,id:string,now:string)=>boolean,
    private projectMember:(actor:SessionActor,id:string,now:string)=>boolean,
    private projectManager:(actor:SessionActor,id:string)=>boolean){}

  private actor(session:SessionActor,now:string,expected?:string){
    const actor=this.current(session,now)
    if(!actor)throw new AssetError(401,'AUTH_REQUIRED')
    if(expected!==undefined&&actor.userId!==expected)throw new AssetError(409,'ACTOR_CHANGED')
    return actor
  }
  private owned(db:DatabaseSync,a:SessionActor,id:string){
    const row=db.prepare(`SELECT ${rowFields} FROM notes WHERE id=? AND service_id=? AND owner_user_id=?`).get(id,a.serviceId,a.userId) as NoteMeta|undefined
    if(!row)throw notFound()
    return row
  }
  private detail(db:DatabaseSync,a:SessionActor,id:string,now:string){
    const meta=this.owned(db,a,id)
    const root=db.prepare('SELECT id,body FROM note_nodes WHERE note_id=? AND parent_id IS NULL').get(id)
    if(!root)throw Error('Note root is missing')
    const refs=db.prepare(`SELECT r.id,r.citation_id,c.asset_id,c.version_id FROM note_references r JOIN citations c ON c.id=r.citation_id
      WHERE r.node_id=? ORDER BY r.rowid`).all(root.id!)
    return {...meta,body:String(root.body),references:refs.map(r=>this.canReadAsset(a,String(r.asset_id),now)
      ?{id:String(r.id),status:'linked' as const,citation_id:String(r.citation_id),asset_id:String(r.asset_id),version_id:String(r.version_id)}
      :{id:String(r.id),status:'unavailable' as const})}
  }
  private assertCitation(db:DatabaseSync,a:SessionActor,id:string,now:string){
    if(!noteId.test(id))throw invalid()
    const c=db.prepare('SELECT asset_id FROM citations WHERE id=?').get(id)
    if(!c||!this.canReadAsset(a,String(c.asset_id),now))throw new AssetError(404,'SOURCE_NOT_FOUND')
  }
  list(session:SessionActor,after=''){return this.tx('read',(db,now)=>{
    const a=this.actor(session,now);if(after&&!noteId.test(after))throw invalid()
    const rows=db.prepare(`SELECT ${rowFields} FROM notes WHERE service_id=? AND owner_user_id=? AND id>? ORDER BY id LIMIT 51`).all(a.serviceId,a.userId,after) as NoteMeta[]
    return {items:rows.slice(0,50),next:rows.length>50?rows[49].id:null}
  })}
  get(session:SessionActor,id:string){return this.tx('read',(db,now)=>this.detail(db,this.actor(session,now),id,now))}
  create(session:SessionActor,expected:string,key:string,d:NoteDraft,citation?:string){return this.tx('write',(db,now)=>{
    const a=this.actor(session,now,expected);draftValid(d);if(!noteId.test(key))throw invalid()
    const digest=createHash('sha256').update(JSON.stringify([d.title,d.body,d.kind,...(citation===undefined?[]:[citation])])).digest('hex')
    const old=db.prepare('SELECT id,create_digest FROM notes WHERE service_id=? AND owner_user_id=? AND create_key=?').get(a.serviceId,a.userId,key)
    if(old){if(old.create_digest!==digest)throw new AssetError(409,'IDEMPOTENCY_CONFLICT');return {data:this.detail(db,a,String(old.id),now),replayed:true}}
    const id=randomUUID()
    if(citation!==undefined)this.assertCitation(db,a,citation,now)
    db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,1,?,?,?,?)').run(id,a.serviceId,a.personalSpaceId,a.userId,d.title,d.kind,now,now,key,digest)
    db.prepare('INSERT INTO note_nodes VALUES(?,?,NULL,0,?,1)').run(id,id,d.body)
    if(citation!==undefined)db.prepare('INSERT INTO note_references VALUES(?,?,?)').run(randomUUID(),id,citation)
    return {data:this.detail(db,a,id,now),replayed:false}
  })}
  save(session:SessionActor,expected:string,id:string,revision:number,patch:NotePatch){return this.tx('write',(db,now)=>{
    const a=this.actor(session,now,expected),old=this.detail(db,a,id,now)
    if(!Number.isSafeInteger(revision)||revision<1||!Object.keys(patch).length)throw invalid()
    if(revision!==old.revision)throw conflict()
    const d={title:patch.title??old.title,kind:patch.kind??old.kind,body:patch.body??old.body}
    draftValid(d)
    const {add_citation:add,remove_reference:remove}=patch
    if(add!==undefined&&remove!==undefined)throw invalid()
    let referenceChanged=false
    if(add!==undefined){
      this.assertCitation(db,a,add,now)
      if(!old.references.some(r=>r.citation_id===add)){
        if(old.references.length>=noteLimits.references)throw new AssetError(409,'NOTE_REFERENCE_LIMIT')
        db.prepare('INSERT INTO note_references VALUES(?,?,?)').run(randomUUID(),id,add);referenceChanged=true
      }
    }else if(remove!==undefined){
      if(!noteId.test(remove))throw invalid()
      referenceChanged=!!db.prepare('DELETE FROM note_references WHERE node_id=? AND id=?').run(id,remove).changes
      if(!referenceChanged)throw notFound()
    }
    if(referenceChanged||d.title!==old.title||d.kind!==old.kind||d.body!==old.body){
      if(!db.prepare('UPDATE notes SET title=?,note_kind=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
        .run(d.title,d.kind,now,id,revision).changes)throw conflict()
      if(d.body!==old.body)db.prepare('UPDATE note_nodes SET body=?,body_revision=body_revision+1 WHERE id=?').run(d.body,id)
    }
    return this.detail(db,a,id,now)
  })}
  linkProject(session:SessionActor,expected:string,project:string,id:string){return this.tx('write',(db,now)=>{
    const a=this.actor(session,now,expected);this.owned(db,a,id)
    if(!this.projectMember(a,project,now)||!this.projectManager(a,project))throw new AssetError(404,'PROJECT_NOT_FOUND')
    const made=db.prepare('INSERT INTO project_note_refs VALUES(?,?,?) ON CONFLICT(project_id,note_id) DO NOTHING').run(project,id,now)
    return {project_id:project,note_id:id,replayed:!made.changes}
  })}
  managedProjects(session:SessionActor,after=''){return this.tx('read',(db,now)=>{
    const a=this.actor(session,now);if(after&&!noteId.test(after))throw invalid()
    const items=db.prepare(`SELECT p.id,p.name FROM knowledge_projects p JOIN project_memberships m ON m.project_id=p.id AND m.user_id=?
      WHERE p.owner_user_id=? AND p.service_id=? AND p.status='active' AND p.id>? AND m.revoked_at IS NULL
      AND m.valid_from<=? AND (m.expires_at IS NULL OR m.expires_at>?) ORDER BY p.id LIMIT 51`).all(a.userId,a.userId,a.serviceId,after,now,now)
    return {items:items.slice(0,50),next:items.length>50?String(items[49].id):null}
  })}
  projectRefs(session:SessionActor,project:string,after=''){return this.tx('read',(db,now)=>{
    const a=this.actor(session,now);if(after&&!noteId.test(after))throw invalid()
    if(!this.projectMember(a,project,now))throw new AssetError(404,'PROJECT_NOT_FOUND')
    const rows=db.prepare(`SELECT n.id,n.title,n.note_kind AS kind,n.revision,n.updated_at FROM project_note_refs r
      JOIN notes n ON n.id=r.note_id WHERE r.project_id=? AND n.service_id=? AND n.owner_user_id=? AND n.id>?
      ORDER BY n.id LIMIT 51`).all(project,a.serviceId,a.userId,after) as NoteMeta[]
    return {items:rows.slice(0,50),next:rows.length>50?rows[49].id:null}
  })}
}
